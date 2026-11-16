// Tests the cloud sync layer (src/services/replicate.ts + mockDb + erp) against an in-memory stand-in
// for the Supabase client. The real TypeScript is compiled with esbuild, so this runs the actual code.
//   Run:  npm run test:sync
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/* ---------- browser globals ---------- */
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const listeners = {};
globalThis.window = globalThis;
globalThis.addEventListener = (n, f) => { (listeners[n] ||= []).push(f); };
globalThis.dispatchEvent = e => { (listeners[e.type] || []).forEach(f => f(e)); return true; };
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.Event = class { constructor(type) { this.type = type; } };
globalThis.alert = () => {};
const syncEvents = [];
addEventListener('cleanbase-sync', e => syncEvents.push(e.detail));

/* ---------- stand-in Supabase ---------- */
const server = { records: [], profiles: [] };
const calls = [];
let failWith = null;           // set to an error object to make writes fail
const handlers = [];           // realtime handlers

const thenable = (run) => ({ then: (ok, bad) => Promise.resolve().then(run).then(ok, bad) });
function fakeClient() {
    return {
        from(table) {
            const rows = () => server[table];
            const keyOf = r => (table === 'records' ? `${r.collection}/${r.id}` : r.id);
            return {
                select() {
                    const b = { order() { return b; }, range(a, z) { return Promise.resolve({ data: rows().slice(a, z + 1), error: null }); } };
                    return b;
                },
                insert(list) {
                    return thenable(() => {
                        calls.push(['insert', table, list.length]);
                        if (failWith) return { error: failWith };
                        list.forEach(r => rows().push(structuredClone(r)));
                        return { error: null };
                    });
                },
                update(patch) {
                    const eq = {};
                    const b = {
                        eq(c, v) { eq[c] = v; return b; },
                        then: (ok, bad) => Promise.resolve().then(() => {
                            calls.push(['update', table, JSON.stringify(eq)]);
                            if (failWith) return { error: failWith };
                            rows().filter(r => Object.entries(eq).every(([c, v]) => r[c] === v)).forEach(r => Object.assign(r, structuredClone(patch)));
                            return { error: null };
                        }).then(ok, bad),
                    };
                    return b;
                },
                delete() {
                    const eq = {}; let ins = null;
                    const b = {
                        eq(c, v) { eq[c] = v; return b; },
                        in(c, vs) { ins = [c, vs]; return b; },
                        then: (ok, bad) => Promise.resolve().then(() => {
                            calls.push(['delete', table, JSON.stringify(ins || eq)]);
                            if (failWith) return { error: failWith };
                            server[table] = rows().filter(r => !(Object.entries(eq).every(([c, v]) => r[c] === v) && (!ins || ins[1].includes(r[ins[0]]))));
                            return { error: null };
                        }).then(ok, bad),
                    };
                    return b;
                },
                _keyOf: keyOf,
            };
        },
        channel() {
            const ch = { on(_t, _f, cb) { handlers.push(cb); return ch; }, subscribe() { return ch; }, unsubscribe() {} };
            return ch;
        },
    };
}

/* ---------- compile the real source ---------- */
const root = resolve('.');
const tmp = mkdtempSync(join(tmpdir(), 'cb-sync-'));
writeFileSync(join(tmp, 'backend-stub.js'), `
export const isCloud = true;
export const DB_KEY = 'cb_db'; export const ERP_KEY = 'cb_erp';
export const LEGACY_DB_KEY = 'legacy_db'; export const LEGACY_ERP_KEY = 'legacy_erp'; export const PHOTO_BUCKET = 'job-photos';
export const supabase = {};
export const sb = () => globalThis.__fakeSb;
`);
const out = await build({
    entryPoints: [join(root, 'src/services/replicate.ts'), join(root, 'src/services/mockDb.ts'), join(root, 'src/services/erp.ts')],
    bundle: true, format: 'esm', platform: 'node', write: false, outdir: tmp, splitting: true, logLevel: 'silent',
    plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /\/backend$/ }, () => ({ path: join(tmp, 'backend-stub.js') })); } }],
});
for (const f of out.outputFiles) writeFileSync(f.path, f.text);
const load = name => import(pathToFileURL(join(tmp, name)).href);
const rep = await load('replicate.js');
const dbm = await load('mockDb.js');
const erp = await load('erp.js');

const tick = (ms = 700) => new Promise(r => setTimeout(r, ms));
const owner = { id: 'u-own', email: 'o@x.test', name: 'Owner', role: 'companyadmin', companyId: 'c1', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' };

beforeEach(async () => {
    store.clear(); calls.length = 0; syncEvents.length = 0; failWith = null; handlers.length = 0;
    server.records = [
        { collection: 'companies', id: 'c1', company_id: 'c1', data: { id: 'c1', name: 'Co One', createdAt: 'x' } },
        { collection: 'clients', id: 'cl1', company_id: 'c1', data: { id: 'cl1', companyId: 'c1', name: 'Alice', phone: '1', address: 'A', totalSpent: 0, createdAt: 'x' } },
        { collection: 'bookings', id: 'b1', company_id: 'c1', data: { id: 'b1', companyId: 'c1', clientId: 'cl1', serviceId: 's1', date: '2026-01-02', time: '09:00', address: 'A', price: 100, status: 'confirmed', paymentStatus: 'unpaid', createdAt: 'x' } },
        { collection: 'invoices', id: 'in1', company_id: 'c1', data: { id: 'in1', companyId: 'c1', number: 'INV-1', status: 'sent', items: [] } },
    ];
    server.profiles = [{ id: 'u-own', email: 'o@x.test', name: 'Owner', role: 'companyadmin', company_id: 'c1', status: 'active', created_at: '2026-01-01T00:00:00.000Z' }];
    globalThis.__fakeSb = fakeClient();
    dbm.initDB();
    await rep.startReplication(owner);
});

test('hydrate: server rows land in the cache the app reads from', () => {
    const db = dbm.getDB();
    assert.equal(db.clients.length, 1);
    assert.equal(db.bookings[0].price, 100);
    assert.equal(db.users[0].email, 'o@x.test');
    assert.equal(db.users[0].companyId, 'c1');
    assert.equal(erp.readCollection('invoices', 'c1').length, 1);
    assert.equal(db.companies[0].name, 'Co One');
});

test('no changes means nothing is written', async () => {
    window.dispatchEvent(new Event('cleanbase-save'));
    await tick();
    assert.deepEqual(calls, []);
    assert.equal(syncEvents.at(-1).state, 'saved');
});

test('inserts, updates and deletes reach the database, and only the changed rows', async () => {
    const db = dbm.getDB();
    db.bookings.push({ id: 'b2', companyId: 'c1', clientId: 'cl1', serviceId: 's1', date: '2026-01-03', time: '10:00', address: 'A', price: 50, status: 'pending', paymentStatus: 'unpaid', createdAt: 'x' });
    db.bookings[0].status = 'completed';
    db.clients = [];
    dbm.saveDB(db);
    await tick();
    assert.ok(server.records.find(r => r.collection === 'bookings' && r.id === 'b2'), 'new booking inserted');
    assert.equal(server.records.find(r => r.id === 'b1').data.status, 'completed', 'existing booking updated');
    assert.equal(server.records.find(r => r.id === 'cl1'), undefined, 'client deleted');
    const kinds = calls.map(c => c[0]).sort();
    assert.deepEqual(kinds, ['delete', 'insert', 'update']);
    assert.equal(server.records.find(r => r.id === 'in1').data.number, 'INV-1', 'untouched rows stay untouched');
});

test('ERP collections sync too, and company ids are written to their own column', async () => {
    erp.addItem('expenses', 'c1', { date: '2026-01-05', category: 'Fuel', description: 'Van', amount: 120 });
    await tick();
    const row = server.records.find(r => r.collection === 'expenses');
    assert.ok(row);
    assert.equal(row.company_id, 'c1');
    assert.equal(row.data.amount, 120);
});

test('team members become profiles with the right company and role', async () => {
    const db = dbm.getDB();
    db.users.push({ id: 'u-new', email: 'new@x.test', name: 'Cleo', role: 'cleaner', companyId: 'c1', status: 'active', createdAt: '2026-01-02T00:00:00.000Z' });
    dbm.saveDB(db);
    await tick();
    const p = server.profiles.find(x => x.id === 'u-new');
    assert.ok(p);
    assert.equal(p.company_id, 'c1');
    assert.equal(p.role, 'cleaner');
    assert.equal('password' in p, false);
    // a rename updates the profile
    const db2 = dbm.getDB();
    db2.users.find(u => u.id === 'u-new').name = 'Cleopatra';
    dbm.saveDB(db2);
    await tick();
    assert.equal(server.profiles.find(x => x.id === 'u-new').name, 'Cleopatra');
});

test('a change the database refuses is rolled back on screen', async () => {
    failWith = { code: '42501', message: 'new row violates row-level security policy' };
    const db = dbm.getDB();
    db.bookings[0].status = 'cancelled';
    dbm.saveDB(db);
    await tick();
    failWith = null;
    assert.equal(dbm.getDB().bookings[0].status, 'confirmed', 'cache reloaded from the server');
    assert.ok(syncEvents.some(e => e.state === 'error' && /permission/i.test(e.message)));
});

test('offline: changes are kept and saved when the connection returns', async () => {
    failWith = { message: 'TypeError: Failed to fetch' };            // no code, like a network failure
    const db = dbm.getDB();
    db.bookings[0].price = 175;
    dbm.saveDB(db);
    await tick();
    assert.equal(syncEvents.at(-1).state, 'offline');
    assert.equal(dbm.getDB().bookings[0].price, 175, 'edit still visible');
    assert.equal(server.records.find(r => r.id === 'b1').data.price, 100, 'not on the server yet');
    failWith = null;
    window.dispatchEvent(new Event('online'));
    await tick();
    assert.equal(server.records.find(r => r.id === 'b1').data.price, 175, 'saved after reconnect');
});

test('realtime: another person\'s change appears locally and is not echoed back', async () => {
    const row = { id: 'b9', companyId: 'c1', clientId: 'cl1', serviceId: 's1', date: '2026-02-01', time: '11:00', address: 'B', price: 80, status: 'pending', paymentStatus: 'unpaid', createdAt: 'x' };
    handlers.forEach(h => h({ eventType: 'INSERT', new: { collection: 'bookings', id: 'b9', company_id: 'c1', data: row } }));
    assert.ok(dbm.getDB().bookings.find(b => b.id === 'b9'));
    window.dispatchEvent(new Event('cleanbase-save'));
    await tick();
    assert.deepEqual(calls, [], 'received row is not pushed back');
    handlers.forEach(h => h({ eventType: 'DELETE', old: { collection: 'bookings', id: 'b9' } }));
    assert.equal(dbm.getDB().bookings.find(b => b.id === 'b9'), undefined);
});

test('sign-out wipes the cache so the next person on this computer sees nothing', () => {
    rep.stopReplication();
    assert.equal(localStorage.getItem('cb_db'), null);
    assert.equal(localStorage.getItem('cb_erp'), null);
});

const superUser = { id: 'u-sup', email: 'root@x.test', name: 'Root', role: 'superadmin', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' };

test('platform admin: payments are stored with no company id and tenants never push them', async () => {
    // a tenant session that somehow has a platform payment in its cache must not push it
    const db = dbm.getDB();
    db.platformPayments = [{ id: 'pp-x', tenantId: 'c1', amount: 5, method: 'cash', date: '2026-01-01', months: 1, createdAt: 'x' }];
    dbm.saveDB(db);
    await tick();
    assert.equal(server.records.some(r => r.collection === 'platformPayments'), false, 'owner cannot push platform rows');

    rep.stopReplication();
    server.profiles.push({ id: 'u-sup', email: 'root@x.test', name: 'Root', role: 'superadmin', company_id: null, status: 'active', created_at: '2026-01-01T00:00:00.000Z' });
    calls.length = 0;
    await rep.startReplication(superUser);
    const d2 = dbm.getDB();
    d2.platformPayments = [{ id: 'pp-1', tenantId: 'c1', amount: 349, method: 'bank', date: '2026-01-02', months: 1, createdAt: 'x' }];
    dbm.saveDB(d2);
    await tick();
    const row = server.records.find(r => r.collection === 'platformPayments');
    assert.ok(row, 'admin push reached the database');
    assert.equal(row.company_id, null);
    assert.equal(row.data.tenantId, 'c1');
});

test('platform admin sees every tenant: companies from several tenants all land in the cache', async () => {
    server.records.push(
        { collection: 'companies', id: 'c2', company_id: 'c2', data: { id: 'c2', name: 'Co Two', subscriptionPlan: 'pro', createdAt: 'x' } },
        { collection: 'companies', id: 'c3', company_id: 'c3', data: JSON.stringify({ id: 'c3', name: 'Co Three', createdAt: 'x' }) },   // arrives as JSON text
    );
    server.profiles.push({ id: 'u-sup', email: 'root@x.test', name: 'Root', role: 'superadmin', company_id: null, status: 'active', created_at: '2026-01-01T00:00:00.000Z' });
    rep.stopReplication();
    await rep.startReplication(superUser);
    const names = dbm.getDB().companies.map(c => c.name).sort();
    assert.deepEqual(names, ['Co One', 'Co Three', 'Co Two']);
    // a company created by someone else while the admin is looking arrives live
    handlers.forEach(h => h({ eventType: 'INSERT', new: { collection: 'companies', id: 'c4', company_id: 'c4', data: { id: 'c4', name: 'Co Four', createdAt: 'x' } } }));
    assert.ok(dbm.getDB().companies.some(c => c.name === 'Co Four'));
});

test('silent re-sync: picks up missed changes, and does nothing when nothing changed', async () => {
    window.dispatchEvent(new Event('cleanbase-data-changed'));
    const before = syncEvents.length;
    assert.equal(await rep.resync(), false, 'nothing changed');
    server.records.push({ collection: 'clients', id: 'cl-late', company_id: 'c1', data: { id: 'cl-late', companyId: 'c1', name: 'Late', phone: '9', address: '', totalSpent: 0, createdAt: 'x' } });
    assert.equal(await rep.resync(), true, 'found the missed row');
    assert.ok(dbm.getDB().clients.some(c => c.id === 'cl-late'));
    assert.equal(syncEvents.length, before);
});

