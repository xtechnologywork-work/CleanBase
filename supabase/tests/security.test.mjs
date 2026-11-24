// Runs the real migrations in an in-process Postgres (PGlite) with a stand-in for Supabase's auth.uid(),
// then tries to break tenant isolation and role limits.   Run:  npm run test:db
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
const sql = f => readFileSync(join(here, '..', 'migrations', f), 'utf8');
const db = new PGlite();

const U = {
    ownerA: '00000000-0000-0000-0000-00000000000a',
    ownerB: '00000000-0000-0000-0000-00000000000b',
    cleanerA: '00000000-0000-0000-0000-0000000000c1',
    dispatcherA: '00000000-0000-0000-0000-0000000000d1',
    accountantA: '00000000-0000-0000-0000-0000000000e1',
    sup: '00000000-0000-0000-0000-0000000000f1',
};
const ids = {}; // company ids

async function as(sub, text, params) {
    await db.exec(`set role ${sub === 'anon' ? 'anon' : 'authenticated'}`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub === 'anon' ? '' : sub]);
    try { return await db.query(text, params); } finally { await db.exec('reset role'); await db.query(`select set_config('request.jwt.claim.sub', '', false)`); }
}
const rejects = (sub, text, params) => assert.rejects(() => as(sub, text, params));
const rec = (collection, id, company, extra = {}) =>
    [collection, id, company, JSON.stringify({ id, companyId: company, ...extra })];
const INSERT = `insert into records (collection, id, company_id, data) values ($1,$2,$3,$4::jsonb)`;
const count = async (sub, where = 'true') => Number((await as(sub, `select count(*)::int n from records where ${where}`)).rows[0].n);

before(async () => {
    await db.exec(`
        create schema auth;
        create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz default now());
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        create role anon nologin; create role authenticated nologin;
        grant usage on schema public, auth to anon, authenticated;
    `);
    for (const f of ['0001_schema_and_security.sql', '0002_public_api.sql', '0003_automations.sql', '0005_booking_store.sql', '0006_store_insights.sql', '0007_store_branding.sql', '0008_portal_phone_match.sql', '0009_public_brand.sql', '0010_weekly_hours.sql', '0012_company_guard.sql', '0013_link_after_confirm.sql', '0014_driver_trips.sql', '0015_cleaner_reservations.sql']) await db.exec(sql(f));
    await db.exec(`grant execute on all functions in schema auth to anon, authenticated`);

    // platform admin first, then the admin signs up and the trigger links them
    await db.exec(`select cb_make_superadmin('root@cb.test','Root')`);
    await db.query(`insert into auth.users values ($1,'root@cb.test')`, [U.sup]);

    // two owners register through the real function
    for (const [k, sub, email] of [['A', U.ownerA, 'a@cb.test'], ['B', U.ownerB, 'b@cb.test']]) {
        await db.query(`insert into auth.users values ($1,$2)`, [sub, email]);
        const r = await as(sub, `select register_company($1,'pro','Owner ${k}') r`, [`Company ${k}`]);
        ids[k] = r.rows[0].r.companyId;
    }
});

test('a freshly registered owner is locked and sees nothing until approved', async () => {
    const me = await as(U.ownerA, `select status from profiles where auth_id = auth.uid()`);
    assert.equal(me.rows[0].status, 'locked');
    await rejects(U.ownerA, INSERT, rec('clients', 'x1', ids.A, { name: 'x' }));
    assert.equal(await count(U.ownerA), 0);
});

test('only the platform admin can approve a tenant', async () => {
    await rejects(U.ownerA, `update profiles set status='active' where auth_id = auth.uid()`);
    const still = await as(U.ownerA, `select status from profiles where auth_id = auth.uid()`);
    assert.equal(still.rows[0].status, 'locked');
    for (const sub of [U.ownerA, U.ownerB]) await as(U.sup, `update profiles set status='active' where auth_id = $1`, [sub]);
    const me = await as(U.ownerA, `select status from profiles where auth_id = auth.uid()`);
    assert.equal(me.rows[0].status, 'active');
});

test('tenant isolation: B cannot read, write, take over or delete A rows', async () => {
    await as(U.ownerA, INSERT, rec('clients', 'cl-a1', ids.A, { name: 'Alice', phone: '+97455500001' }));
    await as(U.ownerB, INSERT, rec('clients', 'cl-b1', ids.B, { name: 'Bob', phone: '+97455500002' }));

    assert.equal(await count(U.ownerA, `collection='clients'`), 1);
    assert.equal(await count(U.ownerB, `collection='clients'`), 1);
    assert.equal((await as(U.ownerB, `select data->>'name' n from records where collection='clients'`)).rows[0].n, 'Bob');

    await rejects(U.ownerB, INSERT, rec('clients', 'cl-evil', ids.A, { name: 'Injected' }));       // write into A
    await rejects(U.ownerB, `${INSERT} on conflict (collection,id) do update set data = excluded.data`, rec('clients', 'cl-a1', ids.B, { name: 'Hijack' })); // take over id
    const upd = await as(U.ownerB, `update records set data = '{"name":"x"}' where collection='clients' and id='cl-a1' returning 1`);
    assert.equal(upd.rows.length, 0);                                                              // invisible, nothing updated
    const del = await as(U.ownerB, `delete from records where collection='clients' and id='cl-a1' returning 1`);
    assert.equal(del.rows.length, 0);
    assert.equal((await as(U.ownerA, `select data->>'name' n from records where id='cl-a1'`)).rows[0].n, 'Alice');
    await rejects(U.ownerB, `update records set company_id = $1 where collection='clients' and id='cl-b1'`, [ids.A]); // cannot move a row
});

test('company rows: owner edits own, cannot create or delete companies', async () => {
    await as(U.ownerA, `update records set data = data || '{"name":"Company A Renamed"}' where collection='companies' and id=$1`, [ids.A]);
    assert.equal((await as(U.ownerA, `select data->>'name' n from records where collection='companies'`)).rows[0].n, 'Company A Renamed');
    await rejects(U.ownerA, INSERT, rec('companies', 'c-fake', 'c-fake', { name: 'Fake' }));
    const del = await as(U.ownerA, `delete from records where collection='companies' returning 1`);
    assert.equal(del.rows.length, 0);
    const other = await as(U.ownerB, `update records set data = data || '{"name":"hacked"}' where collection='companies' and id=$1 returning 1`, [ids.A]);
    assert.equal(other.rows.length, 0);
});

test('owner adds staff; staff sign up links the profile; field role is limited', async () => {
    await as(U.ownerA, `insert into profiles (id,email,name,role,company_id,status) values ('u-clean-a','clean@cb.test','Cleo','cleaner',$1,'active')`, [ids.A]);
    await as(U.ownerA, INSERT, rec('staff', 'st-a1', ids.A, { userId: 'u-clean-a' }));
    await db.query(`insert into auth.users values ($1,'clean@cb.test')`, [U.cleanerA]);          // staff signs up
    assert.equal((await as(U.cleanerA, `select company_id from profiles where auth_id = auth.uid()`)).rows[0].company_id, ids.A);

    await as(U.ownerA, INSERT, rec('bookings', 'bk-mine', ids.A, { cleanerId: 'st-a1', status: 'confirmed', price: 100 }));
    await as(U.ownerA, INSERT, rec('bookings', 'bk-other', ids.A, { cleanerId: 'st-zzz', status: 'confirmed', price: 100 }));
    await as(U.ownerA, INSERT, rec('invoices', 'inv-1', ids.A, { number: 'INV-1', items: [], status: 'sent' }));

    assert.equal(await count(U.cleanerA, `collection='bookings'`), 2);                            // can read bookings
    assert.equal(await count(U.cleanerA, `collection='invoices'`), 0);                            // not invoices
    const mine = await as(U.cleanerA, `update records set data = data || '{"status":"in_progress"}' where collection='bookings' and id='bk-mine' returning 1`);
    assert.equal(mine.rows.length, 1);
    const other = await as(U.cleanerA, `update records set data = data || '{"status":"completed"}' where collection='bookings' and id='bk-other' returning 1`);
    assert.equal(other.rows.length, 0);
    await rejects(U.cleanerA, `update records set data = data || '{"cleanerId":"st-zzz"}' where collection='bookings' and id='bk-mine'`);   // cannot hand the job away
    await rejects(U.cleanerA, INSERT, rec('bookings', 'bk-new', ids.A, { cleanerId: 'st-a1' }));
    await rejects(U.cleanerA, INSERT, rec('expenses', 'ex-1', ids.A, { amount: 5 }));
    const del = await as(U.cleanerA, `delete from records where id='bk-mine' returning 1`);
    assert.equal(del.rows.length, 0);
});

test('dispatcher and accountant only touch their own areas', async () => {
    await as(U.ownerA, `insert into profiles (id,email,name,role,company_id,status) values ('u-disp','d@cb.test','Dee','dispatcher',$1,'active'), ('u-acc','acc@cb.test','Ace','accountant',$1,'active')`, [ids.A]);
    await db.query(`insert into auth.users values ($1,'d@cb.test'), ($2,'acc@cb.test')`, [U.dispatcherA, U.accountantA]);

    await as(U.dispatcherA, INSERT, rec('bookings', 'bk-d', ids.A, { status: 'pending' }));      // allowed
    await rejects(U.dispatcherA, INSERT, rec('invoices', 'inv-d', ids.A, { items: [] }));        // not allowed
    assert.equal(await count(U.dispatcherA, `collection='expenses'`), 0);

    await as(U.accountantA, INSERT, rec('expenses', 'ex-a', ids.A, { amount: 10 }));              // allowed
    await rejects(U.accountantA, INSERT, rec('clients', 'cl-acc', ids.A, { name: 'No' }));        // not allowed
    assert.ok(await count(U.accountantA, `collection='invoices'`) >= 1);
});

test('profile guard: no privilege escalation, no moving between companies', async () => {
    await rejects(U.ownerA, `insert into profiles (id,email,name,role,company_id,status) values ('u-x','x@cb.test','X','superadmin',$1,'active')`, [ids.A]);
    await rejects(U.ownerA, `insert into profiles (id,email,name,role,company_id,status) values ('u-y','y@cb.test','Y','cleaner',$1,'active')`, [ids.B]);
    await rejects(U.ownerA, `update profiles set role='companyadmin' where id='u-clean-a'`);
    await rejects(U.ownerA, `update profiles set company_id=$1 where id='u-clean-a'`, [ids.B]);
    await rejects(U.cleanerA, `update profiles set role='manager' where auth_id = auth.uid()`);
    await rejects(U.cleanerA, `update profiles set status='active', company_id=$1 where auth_id = auth.uid()`, [ids.B]);
    await rejects(U.ownerA, `update profiles set role='superadmin' where auth_id = auth.uid()`);
    assert.equal((await as(U.ownerB, `select count(*)::int n from profiles`)).rows[0].n, 1);       // B sees only themself
    const ownerRow = await as(U.cleanerA, `select count(*)::int n from profiles where role='superadmin'`);
    assert.equal(ownerRow.rows[0].n, 0);
});

test('audit log is append-only for tenants; platform settings are admin-only to change', async () => {
    await as(U.ownerA, INSERT, ['auditLogs', 'log-1', null, JSON.stringify({ id: 'log-1', action: 'x' })]);
    assert.equal(await count(U.ownerA, `collection='auditLogs'`), 0);                              // cannot read logs
    assert.equal(await count(U.sup, `collection='auditLogs'`), 1);                                 // admin can
    await as(U.sup, INSERT, ['platformSettings', 'platform', null, JSON.stringify({ platformName: 'CleanBase' })]);
    assert.equal(await count(U.cleanerA, `collection='platformSettings'`), 1);                     // everyone reads
    await rejects(U.ownerA, `update records set data='{}' where collection='platformSettings'`).catch(() => {});
    const upd = await as(U.ownerA, `update records set data='{"x":1}' where collection='platformSettings' returning 1`);
    assert.equal(upd.rows.length, 0);
    assert.ok((await count(U.sup)) >= 5);                                                          // admin reads across tenants
});

test('platform-only collections: tenants cannot forge, read or change platform payments', async () => {
    await as(U.sup, INSERT, ['platformPayments', 'pp-1', null, JSON.stringify({ id: 'pp-1', tenantId: ids.A, amount: 349 })]);
    assert.equal(await count(U.sup, `collection='platformPayments'`), 1);
    assert.equal(await count(U.ownerA, `collection='platformPayments'`), 0);                                   // cannot read
    await rejects(U.ownerA, INSERT, ['platformPayments', 'pp-fake', null, JSON.stringify({ id: 'pp-fake', tenantId: ids.A, amount: 9999 })]);          // no company id
    await rejects(U.ownerA, INSERT, ['platformPayments', 'pp-fake2', ids.A, JSON.stringify({ id: 'pp-fake2', tenantId: ids.A, amount: 9999 })]);      // forged under own company
    await rejects(U.ownerA, INSERT, ['somethingElse', 'x-1', ids.A, '{}']);                                              // unknown collection
    const upd = await as(U.ownerA, `update records set data = '{"amount":1}' where collection='platformPayments' returning 1`);
    assert.equal(upd.rows.length, 0);
    const del = await as(U.ownerA, `delete from records where collection='platformPayments' returning 1`);
    assert.equal(del.rows.length, 0);
    assert.equal(await count(U.sup, `collection='platformPayments'`), 1);                                       // untouched
});

test('sign-up plans: only the two current plans are accepted, with the right starting price', async () => {
    const sub = '00000000-0000-0000-0000-0000000000a1';
    await db.query(`insert into auth.users values ($1,'plan1@cb.test')`, [sub]);
    await rejects(sub, `select register_company('Old Plan Co','basic','x')`);
    await rejects(sub, `select register_company('Old Plan Co','yearly_basic','x')`);
    await rejects(sub, `select register_company('Nope Co','enterprise','x')`);
    const ok = await as(sub, `select register_company('AI Co','ai_master','x') r`);
    const co = await as(U.sup, `select data from records where collection='companies' and id=$1`, [ok.rows[0].r.companyId]);
    assert.equal(co.rows[0].data.subscriptionPlan, 'ai_master');
    assert.equal(Number(co.rows[0].data.monthlyRevenue), 0);          // priced with the customer, set by the admin
    const sub2 = '00000000-0000-0000-0000-0000000000a2';
    await db.query(`insert into auth.users values ($1,'plan2@cb.test')`, [sub2]);
    const pro = await as(sub2, `select register_company('Pro Co','pro','x') r`);
    const co2 = await as(U.sup, `select data from records where collection='companies' and id=$1`, [pro.rows[0].r.companyId]);
    assert.equal(Number(co2.rows[0].data.monthlyRevenue), 500);
});

test('review links: a customer can rate once with the secret link, and nobody else can read or forge requests', async () => {
    const token = 'tok_AAAAAAAAAAAAAAAAAAAAAAAA1';
    await as(U.ownerA, INSERT, rec('reviewRequests', 'rr-1', ids.A, { token, status: 'sent', bookingId: 'bk-mine', clientName: 'Alice', serviceName: 'Deep clean', serviceDate: '2026-01-02', cleanerName: 'Cleo', sentAt: new Date().toISOString() }));

    // the public page can look the request up, and sees only what it needs
    const look = await as('anon', `select review_lookup($1) r`, [token]);
    assert.equal(look.rows[0].r.status, 'sent');
    assert.equal(look.rows[0].r.service, 'Deep clean');
    assert.equal(look.rows[0].r.company.length > 0, true);
    assert.equal('clientName' in look.rows[0].r, false, 'no customer details leak');
    assert.equal((await as('anon', `select review_lookup('nope-nope-nope-nope-nope-nope') r`)).rows[0].r, null);
    assert.equal((await as('anon', `select review_lookup('short') r`)).rows[0].r, null);

    // bad input is refused
    await rejects('anon', `select review_submit($1, 6, 'x')`, [token]);
    await rejects('anon', `select review_submit($1, 0, 'x')`, [token]);
    await rejects('anon', `select review_submit($1, 5, $2)`, [token, 'x'.repeat(1001)]);
    await rejects('anon', `select review_submit('wrong-token-wrong-token-wrong', 5, 'x')`);

    // a valid submission works exactly once
    await as('anon', `select review_submit($1, 4, '  Great, but late.  ')`, [token]);
    const row = await as(U.ownerA, `select data from records where collection='reviewRequests' and id='rr-1'`);
    assert.equal(row.rows[0].data.status, 'submitted');
    assert.equal(row.rows[0].data.rating, 4);
    assert.equal(row.rows[0].data.comment, 'Great, but late.');
    await rejects('anon', `select review_submit($1, 1, 'changed my mind')`, [token]);          // cannot be reused
    assert.equal((await as('anon', `select review_lookup($1) r`, [token])).rows[0].r.status, 'submitted');

    // other companies and anonymous visitors cannot read the request table
    assert.equal(await count(U.ownerB, `collection='reviewRequests'`), 0);
    await rejects('anon', `select * from records where collection='reviewRequests'`);
    await rejects(U.ownerB, INSERT, rec('reviewRequests', 'rr-x', ids.A, { token: 'x'.repeat(24), status: 'sent' }));   // cannot create one for another company
});

test('anonymous visitors: no table access, but the public booking functions work', async () => {
    await rejects('anon', `select * from records`);
    await rejects('anon', `select * from profiles`);
    await as(U.ownerA, INSERT, rec('services', 'svc-1', ids.A, { name: 'Deep clean', price: 300, durationMinutes: 180 }));
    const pub = await as('anon', `select public_company($1) c`, [ids.A]);
    assert.equal(pub.rows[0].c.services.length, 1);
    assert.equal((await as('anon', `select public_company('nope') c`)).rows[0].c, null);

    // Booking store: the visitor sends a request for one cleaner and one free time
    const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    const REQ = `select public_request_booking($1,$2,$3,$4,$5,$6,$7,$8,'') r`;
    const req = (o = {}) => { const v = { co: ids.A, svc: 'svc-1', cl: 'st-a1', date: day(3), time: '10:00', name: 'Zed', phone: '+974 5550 9999', addr: 'Pearl Tower', ...o }; return [v.co, v.svc, v.cl, v.date, v.time, v.name, v.phone, v.addr]; };

    const ok = await as('anon', REQ, req());
    assert.equal(ok.rows[0].r.ok, true);
    const made = await as(U.ownerA, `select data from records where collection='bookings' and id=$1`, [ok.rows[0].r.bookingId]);
    assert.equal(made.rows[0].data.status, 'pending');
    assert.equal(made.rows[0].data.cleanerId, 'st-a1');
    assert.equal(made.rows[0].data.source, 'store');

    // The store shows the taken time, and nothing about the client who took it
    const store = (await as('anon', `select public_store($1) s`, [ids.A])).rows[0].s;
    assert.equal(store.services.length, 1);
    assert.deepEqual(store.cleaners.map(c => [c.id, c.name]), [['st-a1', 'Cleo']]);
    assert.ok(store.busy.some(b => b.cleanerId === 'st-a1' && b.date === day(3) && b.start === 600 && b.end === 780));   // 10:00 to 13:00
    assert.ok(!JSON.stringify(store).includes('Zed') && !JSON.stringify(store).includes('5550'));
    assert.equal((await as('anon', `select public_store('nope') s`)).rows[0].s, null);

    await rejects('anon', REQ, req({ phone: '+97455508888' }));                        // same time, another client
    await rejects('anon', REQ, req({ phone: '+97455508888', time: '11:00' }));         // overlaps 10:00 to 13:00
    assert.equal((await as('anon', REQ, req({ phone: '+97455508888', time: '13:00' }))).rows[0].r.ok, true);   // right after: fine
    await rejects('anon', REQ, req({ date: '2001-01-01' }));                           // past
    await rejects('anon', REQ, req({ time: '06:00' }));                                // before working hours
    await rejects('anon', REQ, req({ time: '17:00' }));                                // 17:00 + 3h ends after 19:00
    await rejects('anon', REQ, req({ date: day(200) }));                               // beyond the booking window
    await rejects('anon', REQ, req({ cl: 'st-zzz' }));                                 // not a cleaner of this company
    await rejects('anon', REQ, req({ svc: 'svc-OTHER' }));                             // unknown service
    await rejects('anon', REQ, req({ co: ids.B }));                                    // service and cleaner are not B's
    await rejects('anon', REQ, req({ name: 'Z', phone: '12' }));                       // bad name and phone
    await rejects('anon', `select public_create_booking($1,'svc-1',$2,'10:00','Zed','+97455509999','x')`, [ids.A, day(3)]);   // old function is gone

    // Approved leave closes the day; hidden services cannot be booked
    await as(U.ownerA, INSERT, rec('leave', 'lv-1', ids.A, { staffId: 'st-a1', start: day(5), end: day(5), status: 'approved' }));
    await rejects('anon', REQ, req({ date: day(5) }));
    await as(U.ownerA, `update records set data = data || '{"online":false}' where collection='services' and id='svc-1'`);
    assert.equal((await as('anon', `select public_store($1) s`, [ids.A])).rows[0].s.services.length, 0);
    await rejects('anon', REQ, req({ date: day(4) }));
    await as(U.ownerA, `update records set data = data || '{"online":true}' where collection='services' and id='svc-1'`);

    // At most 3 waiting requests a day for one phone number
    assert.equal((await as('anon', REQ, req({ time: '16:00' }))).rows[0].r.ok, true);
    assert.equal((await as('anon', REQ, req({ date: day(4) }))).rows[0].r.ok, true);
    await assert.rejects(() => as('anon', REQ, req({ date: day(6) })), /3 requests/);

    const portal = await as('anon', `select portal_lookup($1,'+974 5550 9999') r`, [ids.A]);
    assert.equal(portal.rows[0].r.bookings.length, 3);
    assert.equal((await as('anon', `select portal_lookup($1,'+974 5550 9999') r`, [ids.B])).rows[0].r, null);   // other company: nothing
    assert.equal((await as('anon', `select portal_lookup($1,'1') r`, [ids.A])).rows[0].r, null);              // short phone refused

    // The number may be typed any way: local 8 digits, with +974, with spaces or dashes, with 00974
    for (const typed of ['55509999', '5550 9999', '974 5550 9999', '+974-5550-9999', '00974 55509999']) {
        assert.equal((await as('anon', `select portal_lookup($1,$2) r`, [ids.A, typed])).rows[0].r.bookings.length, 3, `typed as ${typed}`);
    }
    assert.equal((await as('anon', `select portal_lookup($1,'55509998') r`, [ids.A])).rows[0].r, null);       // another number
    assert.equal((await as('anon', `select cb_phone_key('+974 3330 4550') k, cb_phone_key('33304550') k2, cb_phone_key('+44 7911 123456') k3`)).rows[0].k, '97433304550');
    assert.equal((await as('anon', `select cb_phone_key('33304550') k`)).rows[0].k, '97433304550');
    assert.equal((await as('anon', `select cb_phone_key('+44 7911 123456') k`)).rows[0].k, '447911123456');
});

test('booking store shows the company logo and colours, and ignores unsafe values', async () => {
    const LOGO = 'data:image/png;base64,iVBORw0KGgo=';
    await as(U.ownerA, `update records set data = data || $2::jsonb where collection='companies' and id=$1`,
        [ids.A, JSON.stringify({ logo: LOGO, brandColor: '#0f8a5f', brandAccent: '#E4F5EE', tagline: '  Spotless homes  ' })]);
    const c = (await as('anon', `select public_store($1) s`, [ids.A])).rows[0].s.company;
    assert.equal(c.logo, LOGO);
    assert.equal(c.primaryColor, '#0f8a5f');
    assert.equal(c.accentColor, '#E4F5EE');
    assert.equal(c.tagline, 'Spotless homes');

    await as(U.ownerA, `update records set data = data || $2::jsonb where collection='companies' and id=$1`,
        [ids.A, JSON.stringify({ logo: 'https://evil.test/x.png', brandColor: 'red; background:url(x)', brandAccent: '#12', tagline: '' })]);
    const bad = (await as('anon', `select public_store($1) s`, [ids.A])).rows[0].s.company;
    assert.equal(bad.logo, undefined);
    assert.equal(bad.primaryColor, undefined);
    assert.equal(bad.accentColor, undefined);
    assert.equal(bad.tagline, undefined);
    assert.ok(bad.name, 'the name is still returned');

    await as(U.ownerA, `update records set data = data || $2::jsonb where collection='companies' and id=$1`, [ids.A, JSON.stringify({ logo: 'data:image/png;base64,' + 'A'.repeat(300000) })]);
    assert.equal((await as('anon', `select public_store($1) s`, [ids.A])).rows[0].s.company.logo, undefined);   // too big
});

test('anonymous and tenants cannot run admin functions', async () => {
    await rejects('anon', `select run_automations()`);
    await rejects(U.ownerA, `select run_automations()`);
    await rejects(U.ownerA, `select cb_make_superadmin('me@evil.test')`);
    await rejects('anon', `select register_company('X','pro','x')`);
});

test('export: owner exports own company only', async () => {
    const ok = await as(U.ownerA, `select export_company($1) e`, [ids.A]);
    assert.ok(ok.rows[0].e.records.length > 3);
    await rejects(U.ownerA, `select export_company($1)`, [ids.B]);
    await rejects(U.cleanerA, `select export_company($1)`, [ids.A]);
    assert.ok((await as(U.sup, `select export_company($1) e`, [ids.B])).rows[0].e.records.length >= 1);
});

test('automations: recurring bookings are created once, overdue invoices notify once', async () => {
    const start = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    await as(U.ownerA, INSERT, rec('subscriptions', 'sub-1', ids.A, { clientId: 'cl-a1', serviceId: 'svc-1', frequency: 'weekly', startDate: start, status: 'active', pricePerVisit: 250, time: '08:00' }));
    const past = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
    await as(U.ownerA, INSERT, rec('invoices', 'inv-od', ids.A, { number: 'INV-9', dueDate: past, status: 'sent', discount: 0, taxRate: 0, items: [{ qty: 1, price: 100 }] }));
    await as(U.ownerA, INSERT, rec('invoices', 'inv-paid', ids.A, { number: 'INV-10', dueDate: past, status: 'sent', discount: 0, taxRate: 0, items: [{ qty: 1, price: 100 }] }));
    await as(U.ownerA, INSERT, rec('payments', 'py-1', ids.A, { invoiceId: 'inv-paid', amount: 100, kind: 'payment' }));

    const first = (await db.query(`select run_automations() r`)).rows[0].r;
    assert.ok(first.bookingsCreated >= 2 && first.bookingsCreated <= 3, `weekly over 15 days, got ${first.bookingsCreated}`);
    const second = (await db.query(`select run_automations() r`)).rows[0].r;
    assert.equal(second.bookingsCreated, 0);
    assert.equal(second.notificationsCreated, 0);

    const odNotes = await as(U.ownerA, `select count(*)::int n from records where collection='notifications' and id like 'auto-od-%'`);
    assert.equal(odNotes.rows[0].n, 1);                                                          // only the unpaid one
    assert.equal(await count(U.ownerB, `collection='subscriptions' or id like 'b-sub-%'`), 0);   // B sees none of it
});

test('contracts and templates stay inside the company that wrote them', async () => {
    await as(U.ownerA, INSERT, rec('contractTemplates', 'ct-1', ids.A, { name: 'Weekly', title: 'Service agreement', body: 'Hello {client_name}' }));
    await as(U.ownerA, INSERT, rec('contracts', 'ctr-1', ids.A, { number: 'CTR-1001', subscriptionId: 'sub-1', clientId: 'cl-1', status: 'draft', body: 'Hello Ali', source: 'Hello {client_name}' }));
    assert.equal(await count(U.ownerA, `collection in ('contracts','contractTemplates')`), 2);
    assert.equal(await count(U.ownerB, `collection in ('contracts','contractTemplates')`), 0);
    await rejects('anon', `select * from records where collection='contracts'`);
    await rejects(U.ownerB, INSERT, rec('contracts', 'ctr-x', ids.A, { number: 'CTR-9', status: 'draft' }));           // cannot write into another company
    await as(U.ownerB, `update records set data = data || '{"status":"signed"}' where collection='contracts' and id='ctr-1'`);   // hidden by RLS: changes nothing
    const still = await as(U.ownerA, `select data->>'status' s from records where collection='contracts' and id='ctr-1'`);
    assert.equal(still.rows[0].s, 'draft');
});

test('store insights: visitors are counted anonymously, only the owner reads the totals', async () => {
    const v1 = 'visitor_aaaaaaaaaaaaaaaa1', v2 = 'visitor_bbbbbbbbbbbbbbbb2';
    for (const [v, s] of [[v1, 'view'], [v1, 'view'], [v1, 'service'], [v1, 'request'], [v2, 'view'], ['bad id', 'view'], [v2, 'hack']]) {
        await as('anon', `select public_store_track($1,$2,$3)`, [ids.A, v, s]);
    }
    await as('anon', `select public_store_track('nope',$1,'view')`, [v1]);            // unknown company: ignored
    await rejects('anon', `select * from store_events`);
    await rejects(U.ownerA, `select * from store_events`);
    await rejects('anon', `select store_insights($1, 30)`, [ids.A]);
    await rejects(U.ownerB, `select store_insights($1, 30)`, [ids.A]);              // another company's numbers

    const r = (await as(U.ownerA, `select store_insights($1, 30) r`, [ids.A])).rows[0].r;
    assert.deepEqual(r.steps, { view: 2, service: 1, request: 1 });
    assert.equal(r.activeNow, 2);
    assert.equal(r.requests, 4);                                                     // the 4 store requests made earlier
    assert.equal(r.daily.length, 30);
    assert.deepEqual(r.daily.at(-1).visitors, 2);
    assert.equal((await as(U.ownerB, `select store_insights($1, 7) r`, [ids.B])).rows[0].r.steps.view, undefined);
});

test('public_brand: the portal gets the logo and colours, only for an active company, with the same safety checks', async () => {
    // company A was approved earlier in this file; B is still locked
    const LOGO = 'data:image/png;base64,iVBORw0KGgo=';
    await as(U.ownerA, `update records set data = data || $2::jsonb where collection='companies' and id=$1`,
        [ids.A, JSON.stringify({ logo: LOGO, brandColor: '#6d4aff', brandAccent: 'nope', tagline: 'Fresh and clean' })]);
    const b = (await as('anon', `select public_brand($1) b`, [ids.A])).rows[0].b;
    assert.equal(b.logo, LOGO);
    assert.equal(b.primaryColor, '#6d4aff');
    assert.equal(b.accentColor, undefined);          // not a colour
    assert.equal(b.tagline, 'Fresh and clean');
    assert.ok(b.name);
    assert.ok(!JSON.stringify(b).includes('totalSpent') && !('services' in b), 'nothing but the look');
    assert.equal((await as('anon', `select public_brand('nope') b`)).rows[0].b, null);
});

test('opening hours per weekday: closed days and each day\'s own hours are enforced by the server', async () => {
    const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    const iso = d => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;            // Monday = 0
    const next = idx => { for (let n = 20; n < 40; n++) if (iso(day(n)) === idx) return day(n); throw new Error('no such day'); };
    const REQ = `select public_request_booking($1,'svc-1','st-a1',$2,$3,'Zed',$4,'Pearl Tower','') r`;
    const week = Array.from({ length: 7 }, () => ({ open: true, start: '09:00', end: '17:00' }));
    week[4] = { open: false, start: '09:00', end: '17:00' };                        // Friday closed
    week[5] = { open: true, start: '10:00', end: '14:00' };                         // Saturday short day
    await as(U.ownerA, INSERT, rec('settings', 'set-A', ids.A, { weekHours: week, workStart: '07:00', workEnd: '19:00', minNoticeHours: 0 }));

    const rules = (await as('anon', `select public_store($1) s`, [ids.A])).rows[0].s.rules;
    assert.equal(rules.week.length, 7);
    assert.equal(rules.week[4].open, false);
    assert.deepEqual([rules.week[5].start, rules.week[5].end], ['10:00', '14:00']);

    await assert.rejects(() => as('anon', REQ, [ids.A, next(4), '10:00', '+974 5552 0001']), /closed on that day/);          // Friday
    assert.equal((await as('anon', REQ, [ids.A, next(5), '10:00', '+974 5552 0002'])).rows[0].r.ok, true);                    // Saturday 10:00 to 13:00
    await assert.rejects(() => as('anon', REQ, [ids.A, next(5), '12:00', '+974 5552 0003']), /working hours/);                // Saturday, would end at 15:00
    assert.equal((await as('anon', REQ, [ids.A, next(0), '09:00', '+974 5552 0004'])).rows[0].r.ok, true);                    // Monday from opening
    await assert.rejects(() => as('anon', REQ, [ids.A, next(0), '08:00', '+974 5552 0005']), /working hours/);                // Monday before opening
    await assert.rejects(() => as('anon', REQ, [ids.A, next(0), '15:00', '+974 5552 0006']), /working hours/);                // Monday, would end at 18:00

    // A broken week (not seven days) is ignored: the single start and end apply, as before
    await as(U.ownerA, `update records set data = data || $1::jsonb where collection='settings' and id='set-A'`, [JSON.stringify({ weekHours: [{ open: true, start: '09:00', end: '17:00' }] })]);
    assert.equal((await as('anon', `select public_store($1) s`, [ids.A])).rows[0].s.rules.week, null);
    assert.equal((await as('anon', REQ, [ids.A, next(4), '08:00', '+974 5552 0007'])).rows[0].r.ok, true);                   // Friday works again, 07:00 to 19:00
});

test('HEALTH_CHECK.sql runs read-only and reports the functions as present', async () => {
    await db.exec(`create schema if not exists storage; create table if not exists storage.buckets (id text primary key, name text, public boolean)`);
    await db.exec(`insert into storage.buckets values ('job-photos','job-photos',false) on conflict do nothing`);
    const before = Number((await db.query(`select count(*)::int n from records`)).rows[0].n);
    const r = await db.query(readFileSync(join(here, '..', 'HEALTH_CHECK.sql'), 'utf8'));
    const rows = r.rows;
    assert.ok(rows.length > 20, 'expected one row per check');
    const fnRows = rows.filter(x => x.area === 'Functions');
    assert.ok(fnRows.length >= 17);
    assert.deepEqual(fnRows.filter(x => x.status !== 'OK').map(x => x.item), []);
    const status = Object.fromEntries(rows.map(x => [x.item, x.status]));
    assert.equal(status['Bucket job-photos exists and is private'], 'OK');
    assert.equal(status['Bucket staff-videos exists and is private'], 'NEEDS ACTION');
    assert.equal(status['An active platform admin (superadmin) can sign in'], 'OK');
    assert.equal(status['Anonymous visitors cannot read the tables directly'], 'OK');
    assert.equal(Number((await db.query(`select count(*)::int n from records`)).rows[0].n), before, 'the check must not change data');
});

test('company guard: an owner cannot change plan, price, license or approval, and cannot read the admin notes', async () => {
    const before = (await as(U.sup, `select data from records where collection='companies' and id=$1`, [ids.A])).rows[0].data;
    await as(U.sup, `update records set data = data || '{"licenseUntil":"2026-12-01","monthlyRevenue":500}'::jsonb where collection='companies' and id=$1`, [ids.A]);
    // the owner tries to give themselves the AI plan for free, forever, and renames the company
    await as(U.ownerA, `update records set data = data || '{"subscriptionPlan":"ai_master","monthlyRevenue":0,"licenseUntil":"2099-01-01","approvedAt":"2000-01-01","name":"Renamed A"}'::jsonb where collection='companies' and id=$1`, [ids.A]);
    const after = (await as(U.sup, `select data from records where collection='companies' and id=$1`, [ids.A])).rows[0].data;
    assert.equal(after.name, 'Renamed A', 'the owner may rename the company');
    assert.equal(after.subscriptionPlan, before.subscriptionPlan);
    assert.equal(after.monthlyRevenue, 500);
    assert.equal(after.licenseUntil, '2026-12-01');
    assert.equal(after.approvedAt, before.approvedAt);
    // the owner cannot add the field either when it was not there
    await as(U.ownerA, `update records set data = data || '{"adminNotes":"hello"}'::jsonb where collection='companies' and id=$1`, [ids.A]);
    assert.equal((await as(U.sup, `select data->>'adminNotes' n from records where collection='companies' and id=$1`, [ids.A])).rows[0].n, null);
    // the platform admin's private notes are stored apart and only the admin reads them
    await as(U.sup, INSERT, ['tenantNotes', 'note-' + ids.A, null, JSON.stringify({ id: 'note-' + ids.A, tenantId: ids.A, notes: 'Pays late' })]);
    assert.equal(await count(U.ownerA, `collection='tenantNotes'`), 0);
    assert.equal(await count(U.sup, `collection='tenantNotes'`), 1);
    await rejects(U.ownerA, INSERT, ['tenantNotes', 'note-x', null, JSON.stringify({ id: 'note-x', tenantId: ids.A, notes: 'x' })]);
    // the platform admin can still change the plan
    await as(U.sup, `update records set data = data || '{"subscriptionPlan":"ai_master"}'::jsonb where collection='companies' and id=$1`, [ids.A]);
    assert.equal((await as(U.sup, `select data->>'subscriptionPlan' p from records where collection='companies' and id=$1`, [ids.A])).rows[0].p, 'ai_master');
});

test('an invitation is linked only after the invited email is confirmed', async () => {
    // the owner of A invites a dispatcher
    await as(U.ownerA, `insert into profiles (id, email, name, role, company_id, status) values ('u-inv1','invitee@cb.test','Invitee','dispatcher',$1,'active')`, [ids.A]);
    const someone = '00000000-0000-0000-0000-0000000000a9';
    // someone signs up with that email but never confirms it: the invitation stays free
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1,'Invitee@cb.test', null)`, [someone]);
    assert.equal((await db.query(`select auth_id from profiles where id='u-inv1'`)).rows[0].auth_id, null);
    assert.equal(await count(someone, "collection <> 'platformSettings'"), 0, 'an unconfirmed account sees no company data');
    // once the email is confirmed, the account is linked
    await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [someone]);
    assert.equal((await db.query(`select auth_id from profiles where id='u-inv1'`)).rows[0].auth_id, someone);
});

test('drivers: read the day, move only their own trips forward, cannot create, delete or hand them away', async () => {
    const DRV = '00000000-0000-0000-0000-0000000000a7', DRV2 = '00000000-0000-0000-0000-0000000000a8';
    await as(U.ownerA, `insert into profiles (id,email,name,role,company_id,status) values ('u-drv-a','drv@cb.test','Dave','driver',$1,'active'), ('u-drv-b','drv2@cb.test','Dan','driver',$1,'active')`, [ids.A]);
    await as(U.ownerA, INSERT, rec('staff', 'st-drv-a', ids.A, { userId: 'u-drv-a' }));
    await as(U.ownerA, INSERT, rec('staff', 'st-drv-b', ids.A, { userId: 'u-drv-b' }));
    await db.query(`insert into auth.users values ($1,'drv@cb.test'), ($2,'drv2@cb.test')`, [DRV, DRV2]);

    // the office creates accommodations and trips
    await as(U.ownerA, INSERT, rec('accommodations', 'acc-1', ids.A, { name: 'Al Sadd villa' }));
    await as(U.dispatcherA, INSERT, rec('trips', 'tr-1', ids.A, { bookingId: 'bk-mine', driverId: 'st-drv-a', date: '2026-11-22', stage: 'scheduled', events: [] }));
    await as(U.ownerA, INSERT, rec('trips', 'tr-2', ids.A, { bookingId: 'bk-other', driverId: 'st-drv-b', date: '2026-11-22', stage: 'scheduled', events: [] }));

    // the driver sees the trips, the accommodations and the bookings of the day, but not money
    assert.equal(await count(DRV, `collection='trips'`), 2);
    assert.equal(await count(DRV, `collection='accommodations'`), 1);
    assert.ok(await count(DRV, `collection='bookings'`) > 0);
    assert.equal(await count(DRV, `collection='invoices'`), 0);
    assert.equal(await count(DRV, `collection='settings'`), 0);

    // moves their own trip to the next step
    const mine = await as(DRV, `update records set data = data || '{"stage":"to_pickup"}' where collection='trips' and id='tr-1' returning 1`);
    assert.equal(mine.rows.length, 1);
    // cannot touch a colleague's trip
    const other = await as(DRV, `update records set data = data || '{"stage":"returned"}' where collection='trips' and id='tr-2' returning 1`);
    assert.equal(other.rows.length, 0);
    // cannot hand their trip to someone else, or point it at another booking
    await rejects(DRV, `update records set data = data || '{"driverId":"st-drv-b"}' where collection='trips' and id='tr-1'`);
    await rejects(DRV, `update records set data = data || '{"bookingId":"bk-other"}' where collection='trips' and id='tr-1'`);
    // cannot create or delete trips, accommodations or bookings
    await rejects(DRV, INSERT, rec('trips', 'tr-x', ids.A, { bookingId: 'bk-mine', driverId: 'st-drv-a' }));
    await rejects(DRV, INSERT, rec('accommodations', 'acc-x', ids.A, { name: 'x' }));
    assert.equal((await as(DRV, `delete from records where collection='trips' returning 1`)).rows.length, 0);
    const bk = await as(DRV, `update records set data = data || '{"price":1}' where collection='bookings' and id='bk-mine' returning 1`);
    assert.equal(bk.rows.length, 0);
    // a driver of another company sees nothing of company A
    assert.equal(await count(U.ownerB, `collection='trips'`), 0);
    // the stage really moved
    assert.equal((await as(U.ownerA, `select data->>'stage' s from records where collection='trips' and id='tr-1'`)).rows[0].s, 'to_pickup');
});

test('a cleaner kept by a subscription is not offered to anyone else, and is free again when it ends', async () => {
    const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    const REQ = `select public_request_booking($1,'svc-1','st-a1',$2,$3,'Zoe',$4,'Pearl Tower','') r`;
    const setSub = patch => as(U.ownerA, `update records set data = data || $1::jsonb where collection='subscriptions' and id='sub-r1'`, [JSON.stringify(patch)]);
    const setMode = mode => as(U.ownerA, `update records set data = data || $1::jsonb where collection='settings' and id='set-A'`, [JSON.stringify({ reserveCleaners: mode })]);
    const away = async () => (await as('anon', `select public_store($1) s`, [ids.A])).rows[0].s.away.filter(a => a.cleanerId === 'st-a1' && a.start >= day(40));   // leave from earlier tests is ignored

    // Bader has a monthly plan with the cleaner for 10 days
    await as(U.ownerA, INSERT, rec('clients', 'cl-sub', ids.A, { name: 'Bader', phone: '+974 5550 7777' }));
    await as(U.ownerA, INSERT, rec('subscriptions', 'sub-r1', ids.A, { clientId: 'cl-sub', cleanerId: 'st-a1', frequency: 'monthly', status: 'active', startDate: `${day(45)}T00:00:00.000Z`, endDate: `${day(55)}T00:00:00.000Z` }));

    // the booking page shows her away for that period only
    let a = await away();
    assert.deepEqual(a.map(x => [x.start, x.end]), [[day(45), day(55)]]);
    // nobody else can ask for her inside the period, the day after it works
    await assert.rejects(() => as('anon', REQ, [ids.A, day(50), '08:00', '+974 5552 1001']), /not available on that day/);
    await assert.rejects(() => as('anon', REQ, [ids.A, day(45), '08:00', '+974 5552 1002']), /not available on that day/);
    await assert.rejects(() => as('anon', REQ, [ids.A, day(55), '08:00', '+974 5552 1003']), /not available on that day/);
    assert.equal((await as('anon', REQ, [ids.A, day(56), '08:00', '+974 5552 1004'])).rows[0].r.ok, true);
    // Bader himself can still book her
    assert.equal((await as('anon', REQ, [ids.A, day(50), '08:00', '+974 5550 7777'])).rows[0].r.ok, true);

    // a weekly plan keeps nobody by default, but does when the company keeps cleaners for every subscription
    await setSub({ frequency: 'weekly' });
    assert.equal((await away()).length, 0);
    assert.equal((await as('anon', REQ, [ids.A, day(51), '08:00', '+974 5552 1005'])).rows[0].r.ok, true);
    await setMode('all');
    assert.equal((await away()).length, 1);
    await assert.rejects(() => as('anon', REQ, [ids.A, day(52), '08:00', '+974 5552 1006']), /not available on that day/);
    await setMode('off');
    assert.equal((await away()).length, 0);
    assert.equal((await as('anon', REQ, [ids.A, day(52), '08:00', '+974 5552 1007'])).rows[0].r.ok, true);
    await setMode('monthly'); await setSub({ frequency: 'monthly' });
    assert.equal((await away()).length, 1);

    // paused or cancelled: free. an ended contract: free. a signed contract: kept. no end date: kept until it ends
    await setSub({ status: 'paused' });
    assert.equal((await away()).length, 0);
    await setSub({ status: 'active' });
    await as(U.ownerA, INSERT, rec('contracts', 'ct-r1', ids.A, { subscriptionId: 'sub-r1', status: 'signed', createdAt: '2026-01-01T00:00:00Z' }));
    assert.equal((await away()).length, 1);
    await as(U.ownerA, `update records set data = data || '{"status":"ended"}'::jsonb where collection='contracts' and id='ct-r1'`);
    assert.equal((await away()).length, 0);
    await as(U.ownerA, `update records set data = data || '{"status":"signed"}'::jsonb where collection='contracts' and id='ct-r1'`);
    await setSub({ endDate: null });
    assert.deepEqual((await away()).map(x => x.end), ['9999-12-31']);

    // another company is never affected, and tenants cannot call the helper directly
    assert.equal((await as('anon', `select public_store($1) s`, [ids.B])).rows[0].s.away.filter(x => x.cleanerId === 'st-a1').length, 0);
    await assert.rejects(() => as(U.ownerA, `select cb_reservations($1)`, [ids.A]));
});
