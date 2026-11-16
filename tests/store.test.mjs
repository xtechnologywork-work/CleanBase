// Tests the booking store availability rules with the real code (compiled by esbuild).
//   Run:  npm run test:store
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.Event = class { constructor(t) { this.type = t; } };
globalThis.alert = () => {};

const root = resolve('.');
const tmp = mkdtempSync(join(tmpdir(), 'cb-store-'));
writeFileSync(join(tmp, 'backend-stub.js'), "export const isCloud=false;export const DB_KEY='db';export const ERP_KEY='erp';export const LEGACY_DB_KEY='l1';export const LEGACY_ERP_KEY='l2';export const PHOTO_BUCKET='p';export const supabase=null;export const sb=()=>{throw new Error('no')};");
const out = await build({
    entryPoints: [join(root, 'src/services/store.ts'), join(root, 'src/services/mockDb.ts'), join(root, 'src/services/storeInsights.ts')],
    bundle: true, format: 'esm', platform: 'node', write: false, outdir: tmp, splitting: true, logLevel: 'silent',
    plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /\/backend$/ }, () => ({ path: join(tmp, 'backend-stub.js') })); } }],
});
for (const f of out.outputFiles) writeFileSync(f.path, f.text);
const S = await import(pathToFileURL(join(tmp, 'store.js')).href);
const M = await import(pathToFileURL(join(tmp, 'mockDb.js')).href);
const I = await import(pathToFileURL(join(tmp, 'storeInsights.js')).href);

const base = (over = {}) => ({
    company: { id: 'c1', name: 'Co' },
    services: [{ id: 's2h', name: 'Two hours', description: '', price: 100, durationMinutes: 120 }, { id: 's5h', name: 'Five hours', description: '', price: 250, durationMinutes: 300 }],
    cleaners: [{ id: 'A', name: 'Ana' }, { id: 'B', name: 'Bea' }],
    rules: { workStart: '08:00', workEnd: '18:00', minNoticeHours: 0, timezone: 'Asia/Qatar', bookingDays: 30 },
    busy: [], away: [], ...over,
});
const NOW = { date: '2027-03-10', minutes: 6 * 60 };   // 06:00 on 10 March

test('slots respect working hours and the length of the service', () => {
    const d = base();
    const two = S.slotsOn(d, 's2h', 'A', '2027-03-11', NOW).map(s => s.time);
    assert.equal(two[0], '08:00');
    assert.equal(two.at(-1), '16:00');            // 16:00 + 2h = 18:00, the last that fits
    const five = S.slotsOn(d, 's5h', 'A', '2027-03-11', NOW).map(s => s.time);
    assert.equal(five.at(-1), '13:00');           // 13:00 + 5h = 18:00
    assert.ok(!five.includes('13:30'));
});

test('a taken time blocks every start that would overlap it', () => {
    const d = base({ busy: [{ cleanerId: 'A', date: '2027-03-11', start: 10 * 60, end: 12 * 60 }] });
    const t = S.slotsOn(d, 's2h', 'A', '2027-03-11', NOW).map(s => s.time);
    for (const x of ['08:30', '09:00', '09:30', '10:00', '11:00', '11:30']) assert.ok(!t.includes(x), x);
    assert.ok(t.includes('08:00') && t.includes('12:00'));
    // the other cleaner is not affected, and "any" still offers 10:00 with B only
    assert.ok(S.slotsOn(d, 's2h', 'B', '2027-03-11', NOW).some(s => s.time === '10:00'));
    assert.deepEqual(S.slotsOn(d, 's2h', 'any', '2027-03-11', NOW).find(s => s.time === '10:00').cleanerIds, ['B']);
});

test('approved leave closes the whole day for that cleaner', () => {
    const d = base({ away: [{ cleanerId: 'A', start: '2027-03-11', end: '2027-03-12' }] });
    assert.equal(S.slotsOn(d, 's2h', 'A', '2027-03-12', NOW).length, 0);
    assert.ok(S.slotsOn(d, 's2h', 'A', '2027-03-13', NOW).length > 0);
});

test('notice period, past days and the booking window', () => {
    const d = base({ rules: { ...base().rules, minNoticeHours: 12 } });
    const now = { date: '2027-03-10', minutes: 15 * 60 };   // 15:00 + 12h = 03:00 next day
    assert.equal(S.slotsOn(d, 's2h', 'A', '2027-03-10', now).length, 0);
    assert.equal(S.slotsOn(d, 's2h', 'A', '2027-03-11', now)[0].time, '08:00');
    const late = { date: '2027-03-10', minutes: 23 * 60 };  // 23:00 + 12h = 11:00 next day
    assert.equal(S.slotsOn(d, 's2h', 'A', '2027-03-11', late)[0].time, '11:00');
    assert.equal(S.slotsOn(d, 's2h', 'A', '2027-03-09', NOW).length, 0);                  // past
    assert.equal(S.slotsOn(d, 's2h', 'A', '2027-04-10', NOW).length, 0);                  // 31 days ahead, window is 30
    assert.ok(S.slotsOn(d, 's2h', 'A', '2027-04-09', NOW).length > 0);
});

test('time zone: the company clock is used, not the visitor clock', () => {
    const at = new Date('2027-03-10T22:30:00Z');             // 01:30 on 11 March in Doha
    assert.deepEqual(S.zonedNow('Asia/Qatar', at), { date: '2027-03-11', minutes: 90 });
    assert.deepEqual(S.zonedNow('Not/AZone', at), { date: '2027-03-11', minutes: 90 });  // bad zone falls back to Qatar
});

test('local request: saved as pending, then the same time cannot be taken twice', () => {
    mem.clear();
    const db = M.getDB();
    db.companies = [{ id: 'c9', name: 'Nine', createdAt: '' }];
    db.users = [{ id: 'u1', name: 'Maria Lopez', email: 'm@x', role: 'cleaner', companyId: 'c9', status: 'active', createdAt: '' }];
    db.staff = [{ id: 'st1', companyId: 'c9', userId: 'u1', rating: 4.8, completedJobsCount: 0, revenueGenerated: 0, createdAt: '' }];
    db.services = [{ id: 'sv1', companyId: 'c9', name: 'Home', description: '', price: 120, durationMinutes: 120, createdAt: '' }, { id: 'sv2', companyId: 'c9', name: 'Hidden', description: '', price: 1, durationMinutes: 60, online: false, createdAt: '' }];
    db.bookings = []; db.clients = [];
    M.saveDB(db);

    const data = S.localStoreData('c9');
    assert.deepEqual(data.services.map(s => s.id), ['sv1']);           // hidden service is not in the store
    assert.deepEqual(data.cleaners, [{ id: 'st1', name: 'Maria', photo: undefined, rating: 4.8 }]);
    const day = S.addDaysStr(S.zonedNow('Asia/Qatar').date, 3);
    const req = { serviceId: 'sv1', cleanerId: 'st1', date: day, time: '10:00', name: 'Sara', phone: '+974 5555 1234', address: 'West Bay', notes: '' };
    assert.deepEqual(S.localRequestBooking('c9', req), { ok: true });
    const after = M.getDB();
    assert.equal(after.bookings.length, 1);
    assert.equal(after.bookings[0].status, 'pending');
    assert.equal(after.bookings[0].cleanerId, 'st1');
    assert.equal(after.clients.length, 1);
    assert.match(S.localRequestBooking('c9', { ...req, phone: '+97455551234' }).error, /just taken/);   // same slot
    assert.equal(S.localRequestBooking('c9', { ...req, time: '11:00' }).ok, false);                    // overlaps 10:00 to 12:00
    assert.equal(S.localRequestBooking('c9', { ...req, serviceId: 'sv2', time: '15:00' }).ok, false);  // hidden service
    assert.equal(S.localRequestBooking('c9', { ...req, time: '12:00', phone: '12' }).ok, false);       // bad phone
    // the same phone number is matched to the same client, and at most 3 waiting requests a day
    assert.equal(S.localRequestBooking('c9', { ...req, time: '12:00', phone: '+97455551234' }).ok, true);
    assert.equal(S.localRequestBooking('c9', { ...req, time: '14:00' }).ok, true);
    assert.equal(M.getDB().clients.length, 1);
    assert.match(S.localRequestBooking('c9', { ...req, time: '16:00' }).error, /3 requests/);
});

test('insights: unique visitors per step, live visitors and conversion inputs', () => {
    mem.delete('cleanbase_store_events');
    mem.set('cleanbase_store_visitor', 'v_aaaaaaaaaaaaaaaaaaaa');
    I.track('c9', 'view'); I.track('c9', 'view'); I.track('c9', 'service'); I.track('c9', 'request');
    mem.set('cleanbase_store_visitor', 'v_bbbbbbbbbbbbbbbbbbbb');
    I.track('c9', 'view');
    I.track('other', 'view');
    const r = I.localInsights('c9', 30);
    assert.deepEqual(r.steps, { view: 2, service: 1, request: 1 });
    assert.equal(r.activeNow, 2);
    assert.equal(r.daily.length, 30);
    assert.deepEqual(r.daily.at(-1), { day: new Date().toISOString().slice(0, 10), visitors: 2, requests: 1 });
    assert.equal(r.requests, 3);                       // the three store bookings saved in the test above
    assert.equal(I.localInsights('c9', 30, Date.now() + 5 * 60 * 1000).activeNow, 0);   // 5 minutes later nobody is live
});
