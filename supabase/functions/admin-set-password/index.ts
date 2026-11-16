// Supabase Edge Function: admin-set-password
//
// Lets the PLATFORM ADMIN set a new password for any tenant owner or team member.
// It runs on Supabase's servers, so the powerful service-role key never reaches the browser.
//
// Security checks, in order:
//   1. The caller must be signed in (their login token is verified).
//   2. The caller's profile must be an active superadmin (checked in the database, not trusted from the request).
//   3. The password must be at least 8 characters.
//   4. Another platform admin's password cannot be changed by this function.
//
// Deploy: Supabase Dashboard > Edge Functions > Deploy a new function > "Via Editor",
// name it exactly  admin-set-password , paste this file, Deploy.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

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

        // 2. Are they the platform admin? (looked up with the service key, so it cannot be faked)
        const admin = createClient(url, service, { auth: { persistSession: false } });
        const { data: me } = await admin.from('profiles').select('role,status').eq('auth_id', user.id).maybeSingle();
        if (!me || me.role !== 'superadmin' || me.status !== 'active') return json({ error: 'Only the platform admin can do this.' }, 403);

        // 3. Validate the request
        const body = await req.json().catch(() => ({}));
        const profileId = typeof body.profileId === 'string' ? body.profileId : '';
        const password = typeof body.password === 'string' ? body.password : '';
        if (!profileId) return json({ error: 'Missing person.' }, 400);
        if (password.length < 8 || password.length > 72) return json({ error: 'The password must be 8 to 72 characters.' }, 400);

        const { data: target } = await admin.from('profiles').select('auth_id,role,email').eq('id', profileId).maybeSingle();
        if (!target) return json({ error: 'That person was not found.' }, 404);
        if (!target.auth_id) {
            return json({ error: 'This person has not created their account yet. They sign up with their email and choose their own password.' }, 409);
        }
        // 4. Never touch another platform admin
        if (target.role === 'superadmin' && target.auth_id !== user.id) return json({ error: 'You cannot change another platform admin.' }, 403);

        const { error } = await admin.auth.admin.updateUserById(target.auth_id, { password });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true, email: target.email });
    } catch (e) {
        return json({ error: (e as Error).message || 'Unexpected error' }, 500);
    }
});
