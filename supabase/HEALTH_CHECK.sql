-- CleanBase: database health check.
-- READ ONLY: it changes nothing. Paste it in Supabase, SQL Editor, press Run,
-- and read the "status" column. Anything that is not OK says what to do in "fix".

with
fn(name, migration) as (values
    ('register_company', '0002'), ('portal_lookup', '0002'), ('review_lookup', '0002'), ('review_submit', '0002'),
    ('export_company', '0002'), ('cb_make_superadmin', '0002'), ('run_automations', '0003'),
    ('public_store', '0005'), ('public_request_booking', '0005'), ('cb_store_rules', '0005'),
    ('public_store_track', '0006'), ('store_insights', '0006'),
    ('cb_phone_key', '0008'), ('public_brand', '0009'), ('cb_day_hours', '0010'),
    ('handle_new_user', '0001'), ('profiles_guard', '0001'), ('cb_company_guard', '0012'), ('cb_reservations', '0015')
),
checks(area, item, ok, detail, fix) as (
    -- Tables and row level security
    select 'Tables', 'records and profiles exist',
        to_regclass('public.records') is not null and to_regclass('public.profiles') is not null,
        '', 'Run MASTER_SETUP.sql'
    union all
    select 'Security', 'Row level security is ON for records and profiles',
        coalesce((select bool_and(relrowsecurity) from pg_class where oid in (to_regclass('public.records'), to_regclass('public.profiles'))), false),
        '', 'Run MASTER_SETUP.sql'
    union all
    select 'Security', 'Access rules (policies) are in place',
        (select count(*) from pg_policies where schemaname = 'public' and tablename in ('records', 'profiles')) >= 8,
        (select count(*)::text || ' policies' from pg_policies where schemaname = 'public' and tablename in ('records', 'profiles')),
        'Run MASTER_SETUP.sql'
    union all
    select 'Security', 'Anonymous visitors cannot read the tables directly',
        not has_table_privilege('anon', 'public.records', 'select') and not has_table_privilege('anon', 'public.profiles', 'select'),
        '', 'Run MASTER_SETUP.sql (it revokes anon access)'
    -- Functions, one line per migration feature
    union all
    select 'Functions', fn.name || ' (migration ' || fn.migration || ')',
        exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = fn.name),
        '', 'Run MASTER_SETUP.sql'
    from fn
    union all
    select 'Functions', 'Booking page shows your branding (migration 0007)',
        exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'public_store' and p.prosrc ilike '%brandColor%'),
        '', 'Run MASTER_SETUP.sql'
    union all
    select 'Sign up', 'New accounts are linked to invitations (trigger on auth.users)',
        exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal),
        '', 'Run MASTER_SETUP.sql'
    union all
    select 'Sign up', 'Invitations are linked only after the email is confirmed (migration 0013)',
        exists (select 1 from pg_trigger where tgname = 'on_auth_user_confirmed' and not tgisinternal),
        '', 'Run MASTER_SETUP.sql'
    union all
    select 'Drivers', 'Drivers can only move their own rides (migration 0014)',
        exists (select 1 from pg_trigger where tgname = 'records_trip_guard' and not tgisinternal)
        and 'trips' = any (public.cb_tenant_collections()),
        '', 'Run MASTER_SETUP.sql'
    union all
    select 'Security', 'Owners cannot change their own plan, price or license (migration 0012)',
        exists (select 1 from pg_trigger where tgname = 'records_company_guard' and not tgisinternal),
        '', 'Run MASTER_SETUP.sql'
    -- Storage
    union all
    select 'Storage', 'Bucket job-photos exists and is private',
        exists (select 1 from storage.buckets where id = 'job-photos' and not public),
        coalesce((select case when public then 'bucket is PUBLIC' else '' end from storage.buckets where id = 'job-photos'), 'bucket missing'),
        'Run MASTER_SETUP.sql'
    union all
    select 'Storage', 'Bucket staff-videos exists and is private',
        exists (select 1 from storage.buckets where id = 'staff-videos' and not public),
        coalesce((select case when public then 'bucket is PUBLIC' else '' end from storage.buckets where id = 'staff-videos'), 'bucket missing'),
        'Run MASTER_SETUP.sql'
    -- Realtime
    union all
    select 'Realtime', 'Live updates for records',
        exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records'),
        '', 'Run MASTER_SETUP.sql'
    union all
    select 'Realtime', 'Live updates for profiles',
        exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'),
        '', 'Run MASTER_SETUP.sql'
    -- People and data
    union all
    select 'Accounts', 'An active platform admin (superadmin) can sign in',
        exists (select 1 from public.profiles where role = 'superadmin' and status = 'active' and auth_id is not null),
        (select count(*)::text || ' superadmin profile(s)' from public.profiles where role = 'superadmin'),
        'Run: select public.cb_make_superadmin(''your@email'', ''Your name''); then sign up with that email'
    union all
    select 'Accounts', 'Every company has an owner',
        not exists (select 1 from public.records c where c.collection = 'companies'
            and not exists (select 1 from public.profiles p where p.company_id = c.id and p.role = 'companyadmin')),
        (select count(*)::text || ' company(ies) without an owner' from public.records c where c.collection = 'companies'
            and not exists (select 1 from public.profiles p where p.company_id = c.id and p.role = 'companyadmin')),
        'Open Super admin, Tenants: delete the empty company or provision an owner'
    union all
    select 'Accounts', 'Every person belongs to an existing company',
        not exists (select 1 from public.profiles p where p.role <> 'superadmin'
            and not exists (select 1 from public.records c where c.collection = 'companies' and c.id = p.company_id)),
        (select count(*)::text || ' person(s) without a company' from public.profiles p where p.role <> 'superadmin'
            and not exists (select 1 from public.records c where c.collection = 'companies' and c.id = p.company_id)),
        'Tell your developer: these profiles point to a deleted company'
    union all
    select 'Data', 'No records point to a deleted company',
        not exists (select 1 from public.records r where r.company_id is not null and r.collection <> 'companies'
            and not exists (select 1 from public.records c where c.collection = 'companies' and c.id = r.company_id)),
        (select count(*)::text || ' orphan record(s)' from public.records r where r.company_id is not null and r.collection <> 'companies'
            and not exists (select 1 from public.records c where c.collection = 'companies' and c.id = r.company_id)),
        'Tell your developer: leftovers of a deleted company'
    union all
    select 'Accounts', 'Invitations waiting for sign up (information)',
        true,
        (select count(*)::text || ' invited email(s) not signed up yet' from public.profiles where auth_id is null),
        ''
)
select area, item, case when ok then 'OK' else 'NEEDS ACTION' end as status, nullif(detail, '') as detail, case when ok then null else fix end as fix
from checks
order by ok, area, item;
