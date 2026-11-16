// Tests the AI manager engine with real code (compiled by esbuild) against sample company data.
//   Run:  npm run test:ai
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { format, addDays } from 'date-fns';

const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.Event = class { constructor(t) { this.type = t; } };
globalThis.CustomEvent = globalThis.Event;
globalThis.alert = () => {};

const root = resolve('.');
const tmp = mkdtempSync(join(tmpdir(), 'cb-ai-'));
writeFileSync(join(tmp, 'backend-stub.js'), "export const isCloud=false;export const DB_KEY='db';export const ERP_KEY='erp';export const LEGACY_DB_KEY='l1';export const LEGACY_ERP_KEY='l2';export const PHOTO_BUCKET='p';export const supabase=null;export const sb=()=>{throw new Error('no')};");
const out = await build({
    entryPoints: [join(root, 'src/services/aiManager.ts'), join(root, 'src/services/mockDb.ts'), join(root, 'src/services/erp.ts')],
    bundle: true, format: 'esm', platform: 'node', write: false, outdir: tmp, splitting: true, logLevel: 'silent',
    plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /\/backend$/ }, () => ({ path: join(tmp, 'backend-stub.js') })); } }],
});
for (const f of out.outputFiles) writeFileSync(f.path, f.text);
const load = n => import(pathToFileURL(join(tmp, n)).href);
const ai = await load('aiManager.js');
const dbm = await load('mockDb.js');
const erp = await load('erp.js');

const C = 'c1';
const day = n => format(addDays(new Date(), n), 'yyyy-MM-dd');
const iso = n => addDays(new Date(), n).toISOString();
let snap, issues;

before(() => {
    dbm.initDB();
    const db = dbm.getDB();
    db.companies = [{ id: C, name: 'Sparkle Cleaners', subscriptionPlan: 'ai_master', createdAt: iso(-90) }];
    db.users = [
        { id: 'u1', email: 'a@x', name: 'Amal Ali', role: 'cleaner', companyId: C, status: 'active', createdAt: iso(-50) },
        { id: 'u2', email: 'j@x', name: 'Joseph', role: 'cleaner', companyId: C, status: 'active', createdAt: iso(-50) },
        { id: 'u3', email: 'p@x', name: 'Priya', role: 'cleaner', companyId: C, status: 'active', createdAt: iso(-50) },
    ];
    db.staff = ['u1', 'u2', 'u3'].map((u, i) => ({ id: `st${i + 1}`, companyId: C, userId: u, rating: 5, completedJobsCount: 0, revenueGenerated: 0, createdAt: iso(-50) }));
    db.services = [{ id: 'sv1', companyId: C, name: 'Deep clean', description: '', price: 300, durationMinutes: 120, createdAt: iso(-50) }];
    db.clients = [
        { id: 'cl1', companyId: C, name: 'Fatima', phone: '+974 5555 1111', address: 'West Bay', totalSpent: 0, createdAt: iso(0) },
        { id: 'cl2', companyId: C, name: 'Mark', phone: '+974 5555 2222', address: 'Pearl', totalSpent: 0, createdAt: iso(-30) },
    ];
    const bk = (id, o) => ({ id, companyId: C, clientId: 'cl1', serviceId: 'sv1', address: 'x', paymentStatus: 'unpaid', createdAt: iso(-1), ...o });
    db.bookings = [
        bk('b1', { date: day(0), time: '00:01', price: 100, status: 'completed', cleanerId: 'st1' }),
        bk('b2', { date: day(0), time: '00:02', price: 150, status: 'completed', cleanerId: 'st2' }),
        bk('b3', { date: day(0), time: '00:03', price: 250, status: 'completed', cleanerId: 'st1', paymentStatus: 'paid' }),
        bk('b4', { date: day(0), time: '00:05', price: 400, status: 'confirmed', cleanerId: 'st3' }),          // should have started (late)
        bk('b5', { date: day(0), time: '23:00', price: 200, status: 'confirmed' }),                              // no cleaner
        bk('b6', { date: day(0), time: '23:30', price: 90, status: 'cancelled', cleanerId: 'st2' }),
        bk('b7', { date: day(-1), time: '10:00', price: 400, status: 'completed', cleanerId: 'st1' }),         // yesterday
        bk('b8', { date: day(1), time: '09:00', price: 300, status: 'confirmed', cleanerId: 'st2' }),            // tomorrow
    ];
    dbm.saveDB(db);
    erp.addItem('attendance', C, { staffId: 'st3', date: day(0), status: 'absent' });                           // Priya absent, and she has job b4
    erp.addItem('invoices', C, { number: 'INV-1', clientId: 'cl2', bookingIds: [], issueDate: day(-20), dueDate: day(-10), items: [{ description: 'x', qty: 1, price: 500 }], discount: 0, taxRate: 0, status: 'sent' });
    erp.addItem('invoices', C, { number: 'INV-2', clientId: 'cl2', bookingIds: [], issueDate: day(-20), dueDate: day(-10), items: [{ description: 'x', qty: 1, price: 300 }], discount: 0, taxRate: 0, status: 'sent' });
    const inv2 = erp.readCollection('invoices', C).find(i => i.number === 'INV-2');
    erp.addItem('payments', C, { invoiceId: inv2.id, amount: 300, method: 'bank', date: day(-5), kind: 'payment' });   // INV-2 fully paid
    erp.addItem('supplies', C, { name: 'Gloves', unit: 'box', stock: 2, minStock: 6, costPerUnit: 15 });
    erp.addItem('complaints', C, { clientId: 'cl1', subject: 'Late arrival', details: 'x', severity: 'high', status: 'open' });
    erp.addItem('expenses', C, { date: day(0), category: 'Fuel', description: 'Van', amount: 120 });
    snap = ai.buildSnapshot(dbm.getDB(), C);
    issues = ai.findIssues(snap, dbm.getDB(), C, 'en');
});

const ask = (q, lang) => ai.respond(q, snap, ai.findIssues(snap, dbm.getDB(), C, lang || ai.detectLang(q)), dbm.getDB(), C, 'John', lang);

test('numbers come straight from the data', () => {
    assert.equal(snap.revenueToday, 500);                  // 100 + 150 + 250 completed
    assert.equal(snap.completed.length, 3);
    assert.equal(snap.cancelled.length, 1);
    assert.equal(snap.bookedToday, 500 + 400 + 200);       // not cancelled
    assert.equal(snap.stillToCome, 600);
    assert.equal(snap.revenueYesterday, 400);
    assert.equal(snap.tomorrowJobs.length, 1);
    assert.equal(snap.newClientsToday, 1);
    assert.equal(snap.expensesMonth >= 120, true);
});

test('finds the real problems and ranks the urgent ones first', () => {
    const ids = issues.map(i => i.id);
    for (const id of ['unassigned', 'late', 'absent', 'overdue', 'complaints', 'stock', 'cancelled']) assert.ok(ids.includes(id), `missing ${id} in ${ids}`);
    assert.equal(issues[0].severity, 'high');
    const order = { high: 0, medium: 1, low: 2 };
    for (let i = 1; i < issues.length; i++) assert.ok(order[issues[i - 1].severity] <= order[issues[i].severity]);
});

test('overdue invoices count only unpaid ones, with the right balance', () => {
    const od = issues.find(i => i.id === 'overdue');
    assert.match(od.title, /1 overdue invoice, 500 QAR/);
    assert.equal(snap.overdue.length, 1);
    assert.equal(snap.overdue[0].number, 'INV-1');
    assert.ok(od.actions.some(a => a.href && a.href.includes('wa.me/97455552222')), 'whatsapp reminder to the right client');
});

test('free-cleaner suggestions skip absent staff', () => {
    const un = issues.find(i => i.id === 'unassigned');
    assert.ok(un.fixes[0].includes('Amal Ali') || un.fixes[0].includes('Joseph'));
    assert.ok(!un.fixes[0].includes('Priya'), 'Priya is absent');
});

test('the late job and the absent cleaner are linked to real names', () => {
    const late = issues.find(i => i.id === 'late');
    assert.match(late.detail, /Fatima/);
    assert.match(late.detail, /Priya/);
    const absent = issues.find(i => i.id === 'absent');
    assert.match(absent.detail, /Priya/);
});

test('answers: sales, bookings, problems, report', () => {
    assert.match(ask('How are sales today?').text, /500 QAR from 3 finished jobs/);
    assert.match(ask('how many bookings do we have today?').text, /5 jobs today: 3 done, 0 in progress and 2 still to start/);
    const p = ask('what went wrong today? any problems?');
    assert.match(p.text, /I found \d+ things?/);
    assert.ok(p.items.length >= 4 && p.actions.length >= 1);
    const r = ask('give me the daily report');
    assert.ok(r.actions.some(a => a.href && a.href.startsWith('https://wa.me/?text=')));
    assert.ok(r.items.some(l => /Sales so far: 500 QAR/.test(l)));
});

test('Arabic and Darija questions get Arabic answers with the same numbers', () => {
    const a = ask('chhal bi3na lyom?');
    assert.match(a.text, /[؀-ۿ]/);
    assert.match(a.text, /500 QAR/);
    assert.match(a.text, /من 3 خدمات منتهية/, 'understood as a sales question, not the fallback');
    const d = ask('chno l akhtae li traw lyom o nasa2ih bach nslhom');
    assert.match(d.text, /لقيت \d+ حاجات/, 'understood as a problems question');
    assert.ok(d.items.length >= 4);
    const b = ask('شنو المشاكل اللي وقعت اليوم؟');
    assert.match(b.text, /[؀-ۿ]/);
    assert.ok(b.items.length > 0);
    assert.equal(ai.detectLang('How are sales?'), 'en');
    assert.equal(ai.detectLang('mochkil f chantier'), 'ar');
});

test('action buttons are not repeated', () => {
    const p = ask('what went wrong today? any problems?');
    const keys = p.actions.map(a => a.label + (a.to || a.href || ''));
    assert.equal(new Set(keys).size, keys.length);
});

test('best cleaner this week is ranked by revenue', () => {
    const t = ask('who is the best cleaner this week?');
    assert.match(t.text, /Amal Ali/);                       // 100 + 250 + 400 = 750
    assert.match(t.text, /750 QAR/);
});

test('unknown questions still get a useful summary instead of a dead end', () => {
    const r = ask('blah blah purple elephants');
    assert.match(r.text, /500 QAR today/);
});

test('an empty company does not crash and reports good news', () => {
    const emptyDb = dbm.getDB();
    const s2 = ai.buildSnapshot(emptyDb, 'c-empty');
    const i2 = ai.findIssues(s2, emptyDb, 'c-empty');
    assert.equal(i2.length, 0);
    assert.match(ai.respond('any problems?', s2, i2, emptyDb, 'c-empty').text, /nothing needs fixing/i);
    assert.match(ai.dailyReport(s2, i2), /Nothing needs attention/);
});

test('the model context contains facts only and no phone numbers', () => {
    const ctx = ai.modelContext(snap, issues);
    const j = JSON.parse(ctx);
    assert.equal(j.today.salesCompletedQAR, 500);
    assert.equal(/\+974|555/.test(ctx), false);
});
