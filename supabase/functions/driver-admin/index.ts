// Supabase Edge Function: driver-admin
//
// Lets a COMPANY OWNER (or manager) add drivers who sign in with a phone number and a password,
// change a driver's password, and remove a driver. It runs on Supabase's servers, so the powerful
// service-role key never reaches the browser.
//
// A driver's login is a normal Supabase account whose email is made from the phone number and the
// company id (the email is never shown and never gets mail). Keep driverEmail() identical to the
// one in src/services/driverAccounts.ts: a test compares them.
//
// Security checks, in order:
//   1. The caller must be signed in (their login token is verified).
//   2. The caller's profile must be an active company owner or manager (checked in the database).
//   3. The company is taken from the caller's profile, never from the request.
//   4. A password change or a removal only touches a profile of role "driver" in the caller's own company.
//   5. Phone numbers and passwords are validated.
//
// Deploy: Supabase Dashboard > Edge Functions > Deploy a new function > "Via Editor",
// name it exactly  driver-admin , paste this file, Deploy. (Same steps as admin-set-password.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// BEGIN driverEmail
const DRIVER_EMAIL_DOMAIN = 'driver.cleanbase.app';
function driverEmail(companyId: string, digits: string): string {
    const slug = (companyId || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
    return digits && slug ? `${digits}@${slug}.${DRIVER_EMAIL_DOMAIN}` : '';
}
// END driverEmail

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

    try {
        const url = Deno.env.get('SUPABASE_URL')!;
        const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
        const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        // 1. Who is calling?
        const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
        const { data: { user } } = await caller.auth.getUser();
        if (!user) return json({ error: 'You are not signed in.' }, 401);

        // 2. Are they an active owner or manager? (looked up with the service key, so it cannot be faked)
        const admin = createClient(url, service, { auth: { persistSession: false } });
        const { data: me } = await admin.from('profiles').select('id,role,status,company_id').eq('auth_id', user.id).maybeSingle();
        if (!me || me.status !== 'active' || !['companyadmin', 'manager'].includes(me.role) || !me.company_id) {
            return json({ error: 'Only the company owner can manage drivers.' }, 403);
        }
        const companyId: string = me.company_id; // 3. the company comes from the profile

        const body = await req.json().catch(() => ({}));
        const action = clean(body.action, 20);

        /* ------------------------------ create ------------------------------ */
        if (action === 'create') {
            const name = clean(body.name, 80);
            const digits = clean(body.phone, 20).replace(/\D/g, '');
            const password = typeof body.password === 'string' ? body.password : '';
            if (name.length < 2) return json({ error: 'Enter the driver name.' }, 400);
            if (!/^\d{9,15}$/.test(digits)) return json({ error: 'Enter a valid phone number with the country code.' }, 400);
            if (password.length < 8 || password.length > 72) return json({ error: 'The password must be 8 to 72 characters.' }, 400);

            const email = driverEmail(companyId, digits);
            const { data: existing } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle();
            if (existing) return json({ error: 'A driver with this phone number already exists in your team.' }, 409);

            // The login. If an earlier attempt left a login without a profile, reuse it.
            let authId: string | null = null;
            const made = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { driver: true } });
            if (made.error) {
                if (!/already|registered|exists/i.test(made.error.message)) return json({ error: made.error.message }, 400);
                for (let page = 1; page <= 20 && !authId; page++) {
                    const { data: list, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
                    if (error || !list?.users?.length) break;
                    authId = list.users.find((u: { email?: string; id: string }) => (u.email || '').toLowerCase() === email)?.id ?? null;
                    if (list.users.length < 1000) break;
                }
                if (!authId) return json({ error: 'Could not create the login. Try again.' }, 500);
                const upd = await admin.auth.admin.updateUserById(authId, { password, email_confirm: true });
                if (upd.error) return json({ error: upd.error.message }, 400);
            } else {
                authId = made.data.user.id;
            }

            const stamp = Date.now();
            const profileId = `u-${stamp}`;
            const staffId = `staff-${stamp}`;
            const nowIso = new Date().toISOString();
            const prof = await admin.from('profiles').insert({ id: profileId, auth_id: authId, email, name, role: 'driver', company_id: companyId, status: 'active' });
            if (prof.error) { await admin.auth.admin.deleteUser(authId!).catch(() => undefined); return json({ error: prof.error.message }, 400); }
            const rec = await admin.from('records').insert({
                collection: 'staff', id: staffId, company_id: companyId,
                data: { id: staffId, companyId, userId: profileId, phone: `+${digits}`, rating: 5, completedJobsCount: 0, revenueGenerated: 0, createdAt: nowIso },
            });
            if (rec.error) {
                await admin.from('profiles').delete().eq('id', profileId);
                await admin.auth.admin.deleteUser(authId!).catch(() => undefined);
                return json({ error: rec.error.message }, 400);
            }
            return json({ ok: true, profileId, staffId });
        }

        /* ------------------------ change password / remove ------------------------ */
        if (action === 'set_password' || action === 'delete') {
            const profileId = clean(body.profileId, 80);
            if (!profileId) return json({ error: 'Missing driver.' }, 400);
            // 4. only a driver of the caller's own company
            const { data: target } = await admin.from('profiles').select('id,auth_id,role,company_id').eq('id', profileId).maybeSingle();
            if (!target || target.role !== 'driver' || target.company_id !== companyId) return json({ error: 'That driver was not found.' }, 404);

            if (action === 'set_password') {
                const password = typeof body.password === 'string' ? body.password : '';
                if (password.length < 8 || password.length > 72) return json({ error: 'The password must be 8 to 72 characters.' }, 400);
                if (!target.auth_id) return json({ error: 'This driver has no login yet.' }, 409);
                const { error } = await admin.auth.admin.updateUserById(target.auth_id, { password });
                if (error) return json({ error: error.message }, 400);
                return json({ ok: true, profileId });
            }

            // delete: the rides, the team record, the profile, then the login
            const { data: staffRows } = await admin.from('records').select('id').eq('collection', 'staff').eq('company_id', companyId).eq('data->>userId', profileId);
            const staffIds = (staffRows || []).map((r: { id: string }) => r.id);
            if (staffIds.length) {
                await admin.from('records').delete().eq('collection', 'trips').eq('company_id', companyId).in('data->>driverId', staffIds);
                await admin.from('records').delete().eq('collection', 'staff').eq('company_id', companyId).in('id', staffIds);
            }
            const del = await admin.from('profiles').delete().eq('id', profileId).select('id');
            if (del.error) return json({ error: del.error.message }, 400);
            if (!del.data || del.data.length === 0) return json({ error: 'The driver could not be removed.' }, 500);
            if (target.auth_id) await admin.auth.admin.deleteUser(target.auth_id).catch(() => undefined);
            return json({ ok: true, profileId });
        }

        return json({ error: 'Unknown action.' }, 400);
    } catch (e) {
        return json({ error: (e as Error).message || 'Unexpected error' }, 500);
    }
});
