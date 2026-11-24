// Tests the driver trip logic and the driver WhatsApp messages with the real code (compiled by esbuild).
//   Run:  npm run test:trips
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve('.');
const tmp = mkdtempSync(join(tmpdir(), 'cb-trips-'));
const load = async (file) => {
    const out = await build({ entryPoints: [join(root, 'src/services', file)], bundle: true, format: 'esm', platform: 'node', write: false, outdir: tmp, logLevel: 'silent' });
    for (const f of out.outputFiles) writeFileSync(f.path, f.text);
    return import(pathToFileURL(join(tmp, file.replace('.ts', '.js'))).href);
};
const T = await load('trips.ts');
const M = await load('bookingMessages.ts');

const at = (day, hhmm) => new Date(`${day}T${hhmm}:00`);   // local time
const trip = (over = {}) => ({
    id: 'tr-1', companyId: 'c1', createdAt: '2026-11-01T00:00:00Z', bookingId: 'bk-1', driverId: 'st-d', date: '2026-11-22',
    ...T.planTimes('09:00', 300, 30), stage: 'scheduled', events: [], ...over,
});

test('plan: leave before the job, collect when it ends, home after the road', () => {
    assert.deepEqual(T.planTimes('09:00', 300, 30), { leaveAt: '08:30', arriveBy: '09:00', pickupAt: '14:00', returnBy: '14:30', travelMinutes: 30 });
    assert.equal(T.planTimes('00:10', 60, 30).leaveAt, '00:00', 'never before midnight');
    assert.equal(T.planTimes('22:00', 180, 30).returnBy, '23:59', 'never after the day ends');
});

test('seven steps, one at a time, never skipped, with who and when', () => {
    let t = trip();
    const seen = [];
    for (let i = 0; i < 10; i++) { t = T.advance(t, 'Dave', at('2026-11-22', '08:20')); seen.push(t.stage); }
    assert.deepEqual(seen.slice(0, 6), ['to_pickup', 'onboard', 'dropped', 'to_return', 'return_onboard', 'returned']);
    assert.equal(t.stage, 'returned', 'stays done');
    assert.equal(t.events.length, 6);
    assert.equal(t.events[0].by, 'Dave');
    const withGps = T.advance(trip(), 'Dave', new Date(), { lat: 25.2854123456, lng: 51.531045678 });
    assert.equal(withGps.events[0].lat, 25.28541);
    assert.equal(withGps.events[0].lng, 51.53105);
});

test('a step pressed by mistake can be undone for a short while only', () => {
    const now = new Date('2026-11-22T08:20:00Z');
    const t = T.advance(trip(), 'Dave', now);
    assert.equal(T.canUndo(t, new Date(now.getTime() + 30_000)), true);
    assert.equal(T.canUndo(t, new Date(now.getTime() + 5 * 60_000)), false);
    const back = T.undo(t);
    assert.equal(back.stage, 'scheduled');
    assert.equal(back.events.length, 0);
    assert.equal(T.canUndo(trip(), now), false, 'nothing to undo');
});

test('late: each step has a time, a few minutes of grace, earlier days count as late', () => {
    const t = trip();
    assert.equal(T.tripStatus(t, at('2026-11-22', '08:15')).late, false);      // must start going by 08:20
    const s = T.tripStatus(t, at('2026-11-22', '08:40'));
    assert.equal(s.next, 'to_pickup'); assert.equal(s.due, '08:20'); assert.equal(s.late, true); assert.equal(s.minutesLate, 20);
    assert.equal(T.tripStatus(t, at('2026-11-21', '23:00')).late, false, 'tomorrow is never late');
    assert.equal(T.tripStatus(t, at('2026-11-23', '07:00')).late, true, 'yesterday and not finished');
    const done = trip({ stage: 'returned' });
    assert.equal(T.tripStatus(done, at('2026-11-23', '07:00')).done, true);
    assert.equal(T.tripStatus(done, at('2026-11-23', '07:00')).late, false);
});

test("the driver's day: two stops per trip in time order, and the one to do now", () => {
    const a = trip({ id: 'a', ...T.planTimes('09:00', 120, 30) });     // out 08:30, back 10:50
    const b = trip({ id: 'b', ...T.planTimes('10:00', 120, 30) });     // out 09:30, back 11:50
    const stops = T.stopsOf([b, a]);
    assert.deepEqual(stops.map(s => `${s.trip.id}-${s.leg}`), ['a-out', 'b-out', 'a-back', 'b-back']);
    assert.equal(T.currentStop([a, b]).trip.id, 'a');
    // a is dropped: next is b's outbound leg, not waiting for a
    const a2 = { ...a, stage: 'dropped' };
    assert.equal(`${T.currentStop([a2, b]).trip.id}-${T.currentStop([a2, b]).leg}`, 'b-out');
    // once b is under way, b stays the current stop
    const b2 = { ...b, stage: 'onboard' };
    assert.equal(T.currentStop([a2, b2]).trip.id, 'b');
    // all done
    assert.equal(T.currentStop([{ ...a, stage: 'returned' }, { ...b, stage: 'returned' }]), null);
});

test('cleaners from the same accommodation at about the same time ride together', () => {
    const s = (id, time, home) => ({ trip: trip({ id, home }), time });
    const groups = T.groupRides([s('1', '08:30', 'villa'), s('2', '08:40', 'villa'), s('3', '08:35', 'flat'), s('4', '09:30', 'villa'), s('5', '08:31', '')], t => t.home);
    assert.deepEqual(groups.map(g => g.map(x => x.trip.id)), [['1', '2'], ['5'], ['3'], ['4']]);
});

test('suggested driver is the least busy one', () => {
    assert.equal(T.suggestDriver(['d1', 'd2'], [{ driverId: 'd1' }, { driverId: 'd1' }, { driverId: 'd2' }]), 'd2');
    assert.equal(T.suggestDriver(['d1', 'd2'], []), 'd1');
    assert.equal(T.suggestDriver([], []), null);
});

test('map links: a safe saved Google link, or directions to the address', () => {
    assert.equal(T.mapsLink('Villa 1, Doha', 'https://maps.app.goo.gl/abc'), 'https://maps.app.goo.gl/abc');
    assert.equal(T.mapsLink('Villa 1, Doha', 'javascript:alert(1)'), 'https://www.google.com/maps/dir/?api=1&destination=Villa%201%2C%20Doha');
    assert.equal(T.mapsLink('Villa 1, Doha', 'https://evil.test/maps'), 'https://www.google.com/maps/dir/?api=1&destination=Villa%201%2C%20Doha');
});

test('driver WhatsApp updates are English + Arabic and name the cleaner', () => {
    const v = { name: 'Sara', cleaner: 'Maria', company: 'Al Ishara', time: '09:00' };
    for (const kind of ['on_the_way', 'arrived']) {
        const text = M.driverUpdateMessage(kind, v);
        assert.ok(text.includes('Maria') && text.includes('Sara'));
        assert.ok(/[؀-ۿ]/.test(text) && /[A-Za-z]/.test(text));
        assert.ok(!/[{}]/.test(text));
    }
    assert.ok(M.driverUpdateMessage('on_the_way', v).includes('9:00 AM'));
});
