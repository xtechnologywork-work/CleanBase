-- ============================================================================
-- CleanBase MASTER SETUP
-- Paste this whole file into Supabase > SQL Editor > New query, then press Run.
-- Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PART: 0001_schema_and_security.sql
-- ---------------------------------------------------------------------------
-- CleanBase: schema and row-level security
-- Run the migration files in order (0001 to 0006) in the Supabase SQL editor.
--
-- Design:
--   profiles  one row per person (owner, manager, cleaner...). Linked to a Supabase Auth user by auth_id.
--             A profile can exist BEFORE the person signs up. When they sign up with the same email
--             the trigger links them. That is how owners add staff without any service-role key.
--   records   every business object (bookings, clients, invoices...) as jsonb, one table, keyed by
--             (collection, id). Row level security decides who can read and write which collection.

create table if not exists public.profiles (
    id          text primary key,
    auth_id     uuid unique references auth.users (id) on delete set null,
    email       text not null,
    name        text not null default '',
    role        text not null check (role in ('superadmin','companyadmin','manager','dispatcher','accountant','staff','driver','cleaner')),
    company_id  text,
    status      text not null default 'active' check (status in ('active','locked')),
    created_at  timestamptz not null default now()
);
create unique index if not exists profiles_email_key on public.profiles (lower(email));
create index if not exists profiles_company_idx on public.profiles (company_id);

create table if not exists public.records (
    collection  text not null,
    id          text not null,
    company_id  text,
    data        jsonb not null,
    updated_at  timestamptz not null default now(),
    primary key (collection, id)
);
create index if not exists records_company_collection_idx on public.records (company_id, collection);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists records_touch on public.records;
create trigger records_touch before update on public.records for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers (security definer so policies can look at the caller's profile)
-- ---------------------------------------------------------------------------

create or replace function public.cb_role() returns text language sql stable security definer set search_path = public as $$
    select role from public.profiles where auth_id = auth.uid() limit 1 $$;

create or replace function public.cb_company() returns text language sql stable security definer set search_path = public as $$
    select company_id from public.profiles where auth_id = auth.uid() limit 1 $$;

create or replace function public.cb_profile_id() returns text language sql stable security definer set search_path = public as $$
    select id from public.profiles where auth_id = auth.uid() limit 1 $$;

create or replace function public.cb_is_active() returns boolean language sql stable security definer set search_path = public as $$
    select coalesce((select status = 'active' from public.profiles where auth_id = auth.uid() limit 1), false) $$;

create or replace function public.cb_is_super() returns boolean language sql stable security definer set search_path = public as $$
    select coalesce((select role = 'superadmin' and status = 'active' from public.profiles where auth_id = auth.uid() limit 1), false) $$;

create or replace function public.cb_is_field_role() returns boolean language sql stable security definer set search_path = public as $$
    select coalesce(public.cb_role() in ('staff','driver','cleaner'), false) $$;

-- The staff record that belongs to the signed-in person (staff.userId = profile id).
create or replace function public.cb_staff_id() returns text language sql stable security definer set search_path = public as $$
    select r.id from public.records r
    where r.collection = 'staff' and r.company_id = public.cb_company() and r.data ->> 'userId' = public.cb_profile_id()
    limit 1 $$;

-- Collections that belong to a company. Anything else (platform payments, audit logs, platform settings)
-- is reserved for the platform admin, so a tenant can never write or forge those rows.
create or replace function public.cb_tenant_collections() returns text[] language sql immutable as $$
    select array['companies','bookings','clients','services','staff','notifications','subscriptions','reviews','automations',
        'invoices','payments','expenses','zones','vehicles','supplies','supplyUsage','jobMeta','staffMeta','staffDocs',
        'attendance','leave','payroll','leads','quotes','complaints','promos','clientMeta','reviewRequests','contractTemplates','contracts','activity','settings'] $$;

-- Who may read which collection.
create or replace function public.cb_can_read(col text) returns boolean language sql stable security definer set search_path = public as $$
    select case public.cb_role()
        when 'superadmin' then true
        when 'companyadmin' then col = any (public.cb_tenant_collections())
        when 'manager' then col = any (public.cb_tenant_collections())
        when 'dispatcher' then col = any (array['companies','staff','clients','services','bookings','subscriptions','reviews','notifications',
            'jobMeta','zones','vehicles','supplies','supplyUsage','complaints','clientMeta','reviewRequests','contractTemplates','contracts','activity','settings'])
        when 'accountant' then col = any (array['companies','staff','clients','services','bookings','subscriptions','reviews','notifications',
            'invoices','payments','expenses','payroll','staffMeta','staffDocs','attendance','leave','quotes','promos','activity','settings',
            'supplies','supplyUsage','jobMeta','complaints','zones','clientMeta'])
        when 'staff' then col = any (array['companies','staff','clients','services','bookings','notifications','jobMeta','supplies','supplyUsage','vehicles','zones','reviews','attendance'])
        when 'driver' then col = any (array['companies','staff','clients','services','bookings','notifications','jobMeta','supplies','supplyUsage','vehicles','zones','reviews','attendance'])
        when 'cleaner' then col = any (array['companies','staff','clients','services','bookings','notifications','jobMeta','supplies','supplyUsage','vehicles','zones','reviews','attendance'])
        else false end $$;

-- Who may write which collection.
create or replace function public.cb_can_write(col text) returns boolean language sql stable security definer set search_path = public as $$
    select case public.cb_role()
        when 'superadmin' then true
        when 'companyadmin' then col = any (public.cb_tenant_collections())
        when 'manager' then col = any (public.cb_tenant_collections()) and col <> 'companies'
        when 'dispatcher' then col = any (array['bookings','clients','subscriptions','jobMeta','supplies','supplyUsage','zones','vehicles',
            'complaints','clientMeta','reviewRequests','contractTemplates','contracts','notifications','activity'])
        when 'accountant' then col = any (array['bookings','invoices','payments','expenses','payroll','staffMeta','attendance','promos','activity','notifications'])
        when 'staff' then col = any (array['bookings','jobMeta','supplyUsage','supplies','attendance','notifications','activity'])
        when 'driver' then col = any (array['bookings','jobMeta','supplyUsage','supplies','attendance','notifications','activity'])
        when 'cleaner' then col = any (array['bookings','jobMeta','supplyUsage','supplies','attendance','notifications','activity'])
        else false end $$;

-- ---------------------------------------------------------------------------
-- Row level security: records
-- ---------------------------------------------------------------------------

alter table public.records enable row level security;
alter table public.profiles enable row level security;

drop policy if exists records_select on public.records;
create policy records_select on public.records for select to authenticated using (
    public.cb_is_super()
    or (collection = 'platformSettings' and company_id is null)
    or (public.cb_is_active() and company_id is not null and company_id = public.cb_company() and public.cb_can_read(collection))
);

drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert to authenticated with check (
    public.cb_is_super()
    or (collection = 'auditLogs' and company_id is null and public.cb_is_active())
    or (
        public.cb_is_active() and company_id is not null and company_id = public.cb_company()
        and public.cb_can_write(collection)
        and collection <> 'companies'
        and not (collection = 'bookings' and public.cb_is_field_role())
    )
);

drop policy if exists records_update on public.records;
create policy records_update on public.records for update to authenticated
using (
    public.cb_is_super()
    or (
        public.cb_is_active() and company_id is not null and company_id = public.cb_company()
        and public.cb_can_write(collection)
        and (collection <> 'bookings' or not public.cb_is_field_role() or data ->> 'cleanerId' = public.cb_staff_id())
    )
)
with check (
    public.cb_is_super()
    or (
        public.cb_is_active() and company_id is not null and company_id = public.cb_company()
        and public.cb_can_write(collection)
        and (collection <> 'bookings' or not public.cb_is_field_role() or data ->> 'cleanerId' = public.cb_staff_id())
        and (collection <> 'companies' or id = company_id)
    )
);

drop policy if exists records_delete on public.records;
create policy records_delete on public.records for delete to authenticated using (
    public.cb_is_super()
    or (
        public.cb_is_active() and company_id is not null and company_id = public.cb_company()
        and public.cb_can_write(collection)
        and collection not in ('companies','auditLogs')
        and not (collection = 'bookings' and public.cb_is_field_role())
    )
);

-- ---------------------------------------------------------------------------
-- Row level security: profiles
-- ---------------------------------------------------------------------------

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
    auth_id = auth.uid()
    or public.cb_is_super()
    or (public.cb_is_active() and company_id is not null and company_id = public.cb_company())
);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check (
    public.cb_is_super()
    or (public.cb_is_active() and public.cb_role() in ('companyadmin','manager') and company_id = public.cb_company())
);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
using (
    public.cb_is_super() or auth_id = auth.uid()
    or (public.cb_is_active() and public.cb_role() in ('companyadmin','manager') and company_id = public.cb_company())
)
with check (
    public.cb_is_super() or auth_id = auth.uid()
    or (public.cb_is_active() and public.cb_role() in ('companyadmin','manager') and company_id = public.cb_company())
);

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete to authenticated using (
    public.cb_is_super()
    or (public.cb_is_active() and public.cb_role() in ('companyadmin','manager') and company_id = public.cb_company()
        and role not in ('companyadmin','superadmin'))
);

-- Guard the columns a non-super user must never change.
create or replace function public.profiles_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
    if auth.uid() is null or public.cb_is_super() or coalesce(current_setting('cb.bypass', true), '') = '1' then
        return new;
    end if;
    if tg_op = 'INSERT' then
        if new.role in ('superadmin','companyadmin') then raise exception 'cannot create that role'; end if;
        if new.auth_id is not null then raise exception 'auth_id is set by sign up'; end if;
        if new.status <> 'active' then raise exception 'new team members start active'; end if;
        return new;
    end if;
    -- UPDATE
    if new.company_id is distinct from old.company_id or new.auth_id is distinct from old.auth_id
       or new.status is distinct from old.status or lower(new.email) is distinct from lower(old.email) then
        raise exception 'that profile field can only be changed by the platform admin';
    end if;
    if new.role is distinct from old.role then
        if new.role in ('superadmin','companyadmin') or old.role in ('superadmin','companyadmin') or old.id = public.cb_profile_id() then
            raise exception 'role change not allowed';
        end if;
    end if;
    return new;
end $$;
drop trigger if exists profiles_guard_trg on public.profiles;
create trigger profiles_guard_trg before insert or update on public.profiles for each row execute function public.profiles_guard();

-- When someone signs up with an email that already has a profile, link them to it.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
    perform set_config('cb.bypass', '1', true);
    update public.profiles set auth_id = new.id where lower(email) = lower(new.email) and auth_id is null;
    return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Grants: the policies above do the real filtering
-- ---------------------------------------------------------------------------
revoke all on public.records from anon;
revoke all on public.profiles from anon;
grant select, insert, update, delete on public.records to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- PART: 0002_public_api.sql
-- ---------------------------------------------------------------------------
-- CleanBase: functions the app calls (registration, public booking page, client portal, export)

-- Sign-up step 2: after supabase.auth.signUp, the new owner calls this to create the company.
-- The owner starts "locked" until the platform admin approves the tenant.
create or replace function public.register_company(p_company_name text, p_plan text, p_name text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    uid uuid := auth.uid();
    em text;
    stamp text := (extract(epoch from clock_timestamp()) * 1000)::bigint::text;
    cid text := 'c-' || stamp;
    pid text := 'u-' || stamp;
    revenue int;
begin
    if uid is null then raise exception 'You must be signed in'; end if;
    if exists (select 1 from public.profiles where auth_id = uid) then raise exception 'This account already has a profile'; end if;
    if p_plan not in ('pro','ai_master') then raise exception 'Unknown plan'; end if;
    if length(trim(coalesce(p_company_name, ''))) < 2 or length(p_company_name) > 120 then raise exception 'Company name looks wrong'; end if;
    select email into em from auth.users where id = uid;
    -- The AI Master plan is priced with each customer: it starts at 0 and the platform admin sets the agreed amount.
    revenue := case p_plan when 'pro' then 500 else 0 end;

    perform set_config('cb.bypass', '1', true);
    insert into public.records (collection, id, company_id, data) values (
        'companies', cid, cid,
        jsonb_build_object('id', cid, 'name', trim(p_company_name), 'subscriptionPlan', p_plan, 'monthlyRevenue', revenue, 'createdAt', now())
    );
    insert into public.profiles (id, auth_id, email, name, role, company_id, status)
    values (pid, uid, em, coalesce(nullif(trim(p_name), ''), split_part(em, '@', 1)), 'companyadmin', cid, 'locked');
    return jsonb_build_object('profileId', pid, 'companyId', cid);
end $$;
revoke all on function public.register_company(text, text, text) from public, anon;
grant execute on function public.register_company(text, text, text) to authenticated;

-- Public booking page: services of one company (no login needed).
create or replace function public.public_company(p_company text) returns jsonb
language sql stable security definer set search_path = public as $$
    select case when exists (select 1 from public.profiles where company_id = p_company and role = 'companyadmin' and status = 'active')
        then jsonb_build_object(
            'id', p_company,
            'name', (select data ->> 'name' from public.records where collection = 'companies' and id = p_company),
            'services', coalesce((select jsonb_agg(data order by data ->> 'name') from public.records where collection = 'services' and company_id = p_company), '[]'::jsonb)
        )
        else null end $$;
revoke all on function public.public_company(text) from public;
grant execute on function public.public_company(text) to anon, authenticated;

-- Public booking page: create a pending booking. Inputs are validated; the client is matched by phone.
create or replace function public.public_create_booking(
    p_company text, p_service text, p_date text, p_time text, p_name text, p_phone text, p_address text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    svc jsonb; cl_id text; bk_id text;
    stamp text := (extract(epoch from clock_timestamp()) * 1000)::bigint::text || substr(md5(random()::text), 1, 4);
begin
    if public.public_company(p_company) is null then raise exception 'Unknown company'; end if;
    if p_date !~ '^\d{4}-\d{2}-\d{2}$' or p_time !~ '^\d{2}:\d{2}$' then raise exception 'Bad date or time'; end if;
    if p_date::date < current_date then raise exception 'Date is in the past'; end if;
    if length(trim(coalesce(p_name, ''))) < 2 or length(p_name) > 120 or length(coalesce(p_phone, '')) < 5 or length(p_phone) > 40
       or length(coalesce(p_address, '')) > 300 then raise exception 'Check your details'; end if;
    select data into svc from public.records where collection = 'services' and id = p_service and company_id = p_company;
    if svc is null then raise exception 'Unknown service'; end if;

    select id into cl_id from public.records where collection = 'clients' and company_id = p_company and data ->> 'phone' = p_phone limit 1;
    if cl_id is null then
        cl_id := 'client-' || stamp;
        insert into public.records (collection, id, company_id, data) values ('clients', cl_id, p_company,
            jsonb_build_object('id', cl_id, 'companyId', p_company, 'name', trim(p_name), 'phone', trim(p_phone), 'address', trim(coalesce(p_address, '')), 'totalSpent', 0, 'createdAt', now()));
    end if;

    bk_id := 'b-' || stamp;
    insert into public.records (collection, id, company_id, data) values ('bookings', bk_id, p_company,
        jsonb_build_object('id', bk_id, 'companyId', p_company, 'clientId', cl_id, 'serviceId', p_service, 'date', p_date, 'time', p_time,
            'address', trim(coalesce(p_address, '')), 'price', coalesce((svc ->> 'price')::numeric, 0), 'status', 'pending', 'paymentStatus', 'unpaid', 'createdAt', now()));
    insert into public.records (collection, id, company_id, data) values ('notifications', 'notif-' || stamp, p_company,
        jsonb_build_object('id', 'notif-' || stamp, 'companyId', p_company, 'title', 'New booking request',
            'message', 'New booking received from ' || trim(p_name), 'read', false, 'createdAt', now()));
    return jsonb_build_object('ok', true, 'bookingId', bk_id);
end $$;
revoke all on function public.public_create_booking(text, text, text, text, text, text, text) from public;
grant execute on function public.public_create_booking(text, text, text, text, text, text, text) to anon, authenticated;

-- Client portal: a client looks up their own bookings with their phone number.
-- NOTE: the phone number is the only secret here. Add a PIN or one-time code before exposing money details.
create or replace function public.portal_lookup(p_company text, p_phone text) returns jsonb
language sql stable security definer set search_path = public as $$
    select (
        select jsonb_build_object(
            'client', c.data - 'totalSpent',
            'bookings', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', b.id, 'date', b.data ->> 'date', 'time', b.data ->> 'time', 'status', b.data ->> 'status',
                    'paymentStatus', b.data ->> 'paymentStatus', 'price', b.data -> 'price',
                    'service', (select s.data ->> 'name' from public.records s where s.collection = 'services' and s.id = b.data ->> 'serviceId')
                ) order by b.data ->> 'date' desc)
                from public.records b where b.collection = 'bookings' and b.company_id = p_company and b.data ->> 'clientId' = c.id
            ), '[]'::jsonb))
        from public.records c
        where c.collection = 'clients' and c.company_id = p_company and c.data ->> 'phone' = p_phone and length(p_phone) >= 5
        limit 1) $$;
revoke all on function public.portal_lookup(text, text) from public;
grant execute on function public.portal_lookup(text, text) to anon, authenticated;

-- Review links. A customer opens /review/<token> without logging in. The token is the only key:
-- 144 random bits, so it cannot be guessed. A link works once, and only while its request is "sent".
create index if not exists records_review_token_idx on public.records ((data ->> 'token')) where collection = 'reviewRequests';

create or replace function public.review_lookup(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
    select (
        select jsonb_build_object(
            'status', r.data ->> 'status',
            'company', (select c.data ->> 'name' from public.records c where c.collection = 'companies' and c.id = r.company_id),
            'service', r.data ->> 'serviceName',
            'date', r.data ->> 'serviceDate',
            'cleaner', r.data ->> 'cleanerName'
        )
        from public.records r
        where r.collection = 'reviewRequests' and length(coalesce(p_token, '')) >= 20 and r.data ->> 'token' = p_token
        limit 1) $$;
revoke all on function public.review_lookup(text) from public;
grant execute on function public.review_lookup(text) to anon, authenticated;

create or replace function public.review_submit(p_token text, p_rating int, p_comment text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare hit text;
begin
    if length(coalesce(p_token, '')) < 20 then raise exception 'This review link is not valid'; end if;
    if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Choose a rating from 1 to 5 stars'; end if;
    if length(coalesce(p_comment, '')) > 1000 then raise exception 'Please keep the note under 1000 characters'; end if;
    update public.records
       set data = data || jsonb_build_object('status', 'submitted', 'rating', p_rating, 'comment', trim(coalesce(p_comment, '')), 'submittedAt', now())
     where collection = 'reviewRequests' and data ->> 'token' = p_token and data ->> 'status' = 'sent'
     returning id into hit;
    if hit is null then raise exception 'This review link is no longer valid'; end if;
    return jsonb_build_object('ok', true);
end $$;
revoke all on function public.review_submit(text, int, text) from public;
grant execute on function public.review_submit(text, int, text) to anon, authenticated;

-- Full export of one company (owner or platform admin).
create or replace function public.export_company(p_company text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
    if not (public.cb_is_super() or (public.cb_is_active() and public.cb_role() = 'companyadmin' and public.cb_company() = p_company)) then
        raise exception 'Only the owner can export company data';
    end if;
    return jsonb_build_object(
        'exportedAt', now(),
        'companyId', p_company,
        'profiles', coalesce((select jsonb_agg(to_jsonb(p) - 'auth_id') from public.profiles p where p.company_id = p_company), '[]'::jsonb),
        'records', coalesce((select jsonb_agg(jsonb_build_object('collection', r.collection, 'data', r.data)) from public.records r where r.company_id = p_company), '[]'::jsonb)
    );
end $$;
revoke all on function public.export_company(text) from public, anon;
grant execute on function public.export_company(text) to authenticated;

-- Run once from the SQL editor to create the platform admin:
--   select public.cb_make_superadmin('you@example.com', 'Your Name');
-- Then sign up in the app with that email and the profile links automatically.
create or replace function public.cb_make_superadmin(p_email text, p_name text default 'Platform Admin') returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
    select id into uid from auth.users where lower(email) = lower(p_email) limit 1;
    insert into public.profiles (id, auth_id, email, name, role, company_id, status)
    values ('u-super-' || substr(md5(lower(p_email)), 1, 8), uid, p_email, p_name, 'superadmin', null, 'active')
    on conflict (lower(email)) do update set role = 'superadmin', status = 'active', company_id = null, auth_id = coalesce(public.profiles.auth_id, excluded.auth_id);
    return 'ok';
end $$;
revoke all on function public.cb_make_superadmin(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- PART: 0003_automations.sql
-- ---------------------------------------------------------------------------
-- CleanBase: built-in automations. No outside services. They run inside the database.
--   1. Recurring subscriptions create their bookings for the next 14 days.
--   2. Notifications for overdue invoices, expiring staff documents and low stock.
-- Scheduled hourly by 0004 (pg_cron). You can also run it by hand: select public.run_automations();

create or replace function public.run_automations() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    made_bookings int := 0;
    made_notes int := 0;
    n int;
begin
    -- 1. Recurring bookings -------------------------------------------------
    with subs as (
        select s.id, s.company_id, s.data as d
        from public.records s
        where s.collection = 'subscriptions' and s.data ->> 'status' = 'active'
          and s.data ->> 'frequency' in ('weekly','bi-weekly','monthly')
    ),
    days as (
        select subs.*, gs::date as day
        from subs, generate_series(current_date, current_date + 14, interval '1 day') gs
        where (subs.d ->> 'startDate')::date <= gs::date
          and (subs.d ->> 'endDate' is null or (subs.d ->> 'endDate')::date >= gs::date)
          and case subs.d ->> 'frequency'
                when 'weekly' then (gs::date - (subs.d ->> 'startDate')::date) % 7 = 0
                when 'bi-weekly' then (gs::date - (subs.d ->> 'startDate')::date) % 14 = 0
                else extract(day from gs) = extract(day from (subs.d ->> 'startDate')::date)
              end
    ),
    ins as (
        insert into public.records (collection, id, company_id, data)
        select 'bookings', 'b-sub-' || days.id || '-' || to_char(days.day, 'YYYYMMDD'), days.company_id,
            jsonb_strip_nulls(jsonb_build_object(
                'id', 'b-sub-' || days.id || '-' || to_char(days.day, 'YYYYMMDD'),
                'companyId', days.company_id,
                'clientId', days.d ->> 'clientId',
                'serviceId', days.d ->> 'serviceId',
                'cleanerId', days.d ->> 'cleanerId',
                'date', to_char(days.day, 'YYYY-MM-DD'),
                'time', coalesce(days.d ->> 'time', '09:00'),
                'address', coalesce((select c.data ->> 'address' from public.records c where c.collection = 'clients' and c.id = days.d ->> 'clientId'), ''),
                'price', coalesce((days.d ->> 'pricePerVisit')::numeric, 0),
                'status', 'confirmed', 'paymentStatus', 'unpaid',
                'isRecurring', true, 'subscriptionId', days.id, 'createdAt', now()))
        from days
        on conflict (collection, id) do nothing
        returning 1
    )
    select count(*) into made_bookings from ins;

    -- 2a. Overdue invoices ------------------------------------------------------
    with inv as (
        select r.id, r.company_id, r.data ->> 'number' as number, (r.data ->> 'dueDate')::date as due,
               ((select coalesce(sum((i ->> 'qty')::numeric * (i ->> 'price')::numeric), 0) from jsonb_array_elements(r.data -> 'items') i)
                 - coalesce((r.data ->> 'discount')::numeric, 0)) * (1 + coalesce((r.data ->> 'taxRate')::numeric, 0) / 100) as total,
               (select coalesce(sum(case when p.data ->> 'kind' = 'refund' then -(p.data ->> 'amount')::numeric else (p.data ->> 'amount')::numeric end), 0)
                  from public.records p where p.collection = 'payments' and p.company_id = r.company_id and p.data ->> 'invoiceId' = r.id) as paid
        from public.records r
        where r.collection = 'invoices' and r.data ->> 'status' = 'sent'
    ),
    ins as (
        insert into public.records (collection, id, company_id, data)
        select 'notifications', 'auto-od-' || inv.id, inv.company_id,
            jsonb_build_object('id', 'auto-od-' || inv.id, 'companyId', inv.company_id, 'title', 'Invoice overdue',
                'message', 'Invoice ' || inv.number || ' was due on ' || to_char(inv.due, 'DD Mon YYYY') || ' and still has a balance.',
                'read', false, 'createdAt', now())
        from inv where inv.due < current_date and inv.total - inv.paid > 0.005
        on conflict (collection, id) do nothing
        returning 1
    )
    select count(*) into n from ins; made_notes := made_notes + n;

    -- 2b. Staff documents expiring within 30 days --------------------------------
    with ins as (
        insert into public.records (collection, id, company_id, data)
        select 'notifications', 'auto-doc-' || d.id, d.company_id,
            jsonb_build_object('id', 'auto-doc-' || d.id, 'companyId', d.company_id, 'title', 'Document expiring',
                'message', coalesce(d.data ->> 'type', 'Document') || ' expires on ' || to_char((d.data ->> 'expiry')::date, 'DD Mon YYYY') || '.',
                'read', false, 'createdAt', now())
        from public.records d
        where d.collection = 'staffDocs' and (d.data ->> 'expiry')::date <= current_date + 30
        on conflict (collection, id) do nothing
        returning 1
    )
    select count(*) into n from ins; made_notes := made_notes + n;

    -- 2c. Low stock, at most once a week per item ---------------------------------
    with ins as (
        insert into public.records (collection, id, company_id, data)
        select 'notifications', 'auto-stock-' || s.id || '-' || to_char(current_date, 'IYYYIW'), s.company_id,
            jsonb_build_object('id', 'auto-stock-' || s.id || '-' || to_char(current_date, 'IYYYIW'), 'companyId', s.company_id, 'title', 'Low stock',
                'message', (s.data ->> 'name') || ' is at ' || (s.data ->> 'stock') || ' ' || coalesce(s.data ->> 'unit', '') || '. Time to reorder.',
                'read', false, 'createdAt', now())
        from public.records s
        where s.collection = 'supplies' and (s.data ->> 'stock')::numeric <= (s.data ->> 'minStock')::numeric
        on conflict (collection, id) do nothing
        returning 1
    )
    select count(*) into n from ins; made_notes := made_notes + n;

    return jsonb_build_object('bookingsCreated', made_bookings, 'notificationsCreated', made_notes);
end $$;
revoke all on function public.run_automations() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- PART: 0004_supabase_extras.sql
-- ---------------------------------------------------------------------------
-- CleanBase: Supabase-only extras (storage bucket, realtime, hourly automations).
-- Every block is guarded: if a feature is not available on your project the block is skipped
-- with a NOTICE and the rest still runs.

-- Private bucket for job photos. Files live under "<company id>/<job id>/<file>".
do $do$
begin
    insert into storage.buckets (id, name, public) values ('job-photos', 'job-photos', false) on conflict (id) do nothing;

    drop policy if exists "job photos read" on storage.objects;
    create policy "job photos read" on storage.objects for select to authenticated using (
        bucket_id = 'job-photos' and public.cb_is_active() and (public.cb_is_super() or (storage.foldername(name))[1] = public.cb_company())
    );
    drop policy if exists "job photos write" on storage.objects;
    create policy "job photos write" on storage.objects for insert to authenticated with check (
        bucket_id = 'job-photos' and public.cb_is_active() and (public.cb_is_super() or (storage.foldername(name))[1] = public.cb_company())
    );
    drop policy if exists "job photos delete" on storage.objects;
    create policy "job photos delete" on storage.objects for delete to authenticated using (
        bucket_id = 'job-photos' and public.cb_is_active() and (public.cb_is_super() or (storage.foldername(name))[1] = public.cb_company())
    );
exception when others then
    raise notice 'Storage setup skipped: %', sqlerrm;
end $do$;

-- Live updates: other users see changes without refreshing. Row level security still applies to the data.
do $do$
begin
    alter publication supabase_realtime add table public.records;
    alter publication supabase_realtime add table public.profiles;
exception
    when duplicate_object then null;
    when others then raise notice 'Realtime setup skipped: %', sqlerrm;
end $do$;

-- Hourly automations (recurring bookings, overdue, expiry and stock notifications). Needs pg_cron.
do $do$
begin
    create extension if not exists pg_cron;
    perform cron.unschedule('cleanbase-automations');
exception when others then null;
end $do$;
do $do$
begin
    perform cron.schedule('cleanbase-automations', '0 * * * *', 'select public.run_automations()');
exception when others then
    raise notice 'Hourly schedule skipped (enable pg_cron under Database, Extensions, then run this file again): %', sqlerrm;
end $do$;

-- ---------------------------------------------------------------------------
-- PART: 0005_booking_store.sql
-- ---------------------------------------------------------------------------
-- CleanBase: booking store.
-- A client opens the company's public link, picks a service, a cleaner and a free time, and sends a request.
-- Visitors never read tables. They only call these two functions:
--   public_store(company)          services shown online, cleaners (first name, photo, rating), working rules,
--                                  and the times cleaners are already taken. Nothing about other clients.
--   public_request_booking(...)    checks everything again on the server and saves a pending booking.
-- The old public_create_booking (no cleaner, no clash check) is removed.

-- "09:30" -> 570
create or replace function public.cb_min(t text) returns int language sql immutable as $$
    select split_part(t, ':', 1)::int * 60 + coalesce(nullif(split_part(t, ':', 2), ''), '0')::int $$;

-- The current time in the company's time zone. A wrong zone name falls back to Qatar.
create or replace function public.cb_local_now(tz text) returns timestamp language plpgsql stable as $$
begin
    return now() at time zone coalesce(nullif(tz, ''), 'Asia/Qatar');
exception when others then
    return now() at time zone 'Asia/Qatar';
end $$;

-- Working rules from the company's Business rules, with safe defaults.
create or replace function public.cb_store_rules(p_company text) returns jsonb
language sql stable security definer set search_path = public as $$
    select jsonb_build_object(
        'workStart', coalesce(nullif(s.data ->> 'workStart', ''), '07:00'),
        'workEnd', coalesce(nullif(s.data ->> 'workEnd', ''), '19:00'),
        'minNoticeHours', coalesce(nullif(s.data ->> 'minNoticeHours', '')::numeric, 12),
        'timezone', coalesce(nullif(s.data ->> 'timezone', ''), 'Asia/Qatar'),
        'bookingDays', greatest(1, coalesce(nullif(s.data ->> 'bookingDays', '')::numeric::int, 60)))
    from (select 1) one
    left join lateral (select data from public.records where collection = 'settings' and company_id = p_company limit 1) s on true $$;
revoke all on function public.cb_store_rules(text) from public;

create or replace function public.public_store(p_company text) returns jsonb
language sql stable security definer set search_path = public as $$
    select case when public.public_company(p_company) is null then null else jsonb_build_object(
        'company', jsonb_build_object('id', p_company, 'name', (select data ->> 'name' from public.records where collection = 'companies' and id = p_company)),
        'services', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', id, 'name', data ->> 'name', 'description', coalesce(data ->> 'description', ''),
                'price', coalesce(nullif(data ->> 'price', '')::numeric, 0),
                'durationMinutes', coalesce(nullif(data ->> 'durationMinutes', '')::numeric::int, 120)) order by data ->> 'name')
            from public.records
            where collection = 'services' and company_id = p_company and coalesce(data ->> 'online', 'true') <> 'false'), '[]'::jsonb),
        'cleaners', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', s.id, 'name', split_part(coalesce(p.name, ''), ' ', 1),
                'photo', case when s.data ->> 'photo' like 'data:image/%' and length(s.data ->> 'photo') < 400000 then s.data ->> 'photo' end,
                'rating', coalesce(nullif(s.data ->> 'rating', '')::numeric, 0)) order by p.name)
            from public.records s join public.profiles p on p.id = s.data ->> 'userId'
            where s.collection = 'staff' and s.company_id = p_company and p.role in ('cleaner', 'staff')), '[]'::jsonb),
        'rules', public.cb_store_rules(p_company),
        'busy', coalesce((
            select jsonb_agg(jsonb_build_object(
                'cleanerId', b.data ->> 'cleanerId', 'date', b.data ->> 'date',
                'start', public.cb_min(b.data ->> 'time'),
                'end', public.cb_min(b.data ->> 'time') + coalesce(nullif(sv.data ->> 'durationMinutes', '')::numeric::int, 120)))
            from public.records b
            left join public.records sv on sv.collection = 'services' and sv.id = b.data ->> 'serviceId' and sv.company_id = b.company_id
            where b.collection = 'bookings' and b.company_id = p_company
              and coalesce(b.data ->> 'status', '') <> 'cancelled' and coalesce(b.data ->> 'cleanerId', '') <> ''
              and b.data ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$' and b.data ->> 'time' ~ '^\d{1,2}:\d{2}'
              and b.data ->> 'date' >= to_char(current_date - 1, 'YYYY-MM-DD')), '[]'::jsonb),
        'away', coalesce((
            select jsonb_agg(jsonb_build_object('cleanerId', data ->> 'staffId', 'start', data ->> 'start', 'end', data ->> 'end'))
            from public.records where collection = 'leave' and company_id = p_company and data ->> 'status' = 'approved'), '[]'::jsonb)
    ) end $$;
revoke all on function public.public_store(text) from public;
grant execute on function public.public_store(text) to anon, authenticated;

create or replace function public.public_request_booking(
    p_company text, p_service text, p_cleaner text, p_date text, p_time text,
    p_name text, p_phone text, p_address text, p_notes text default ''
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    svc jsonb; rules jsonb; cl_id text; bk_id text; st int; dur int; local_now timestamp; waiting int;
    phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
    stamp text := (extract(epoch from clock_timestamp()) * 1000)::bigint::text || substr(md5(random()::text), 1, 4);
begin
    if public.public_company(p_company) is null then raise exception 'This booking link is not active'; end if;
    if coalesce(p_date, '') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_time, '') !~ '^\d{2}:\d{2}$' then raise exception 'Choose a date and a time'; end if;
    if length(trim(coalesce(p_name, ''))) < 2 or length(p_name) > 120 then raise exception 'Please enter your name'; end if;
    if length(phone) < 7 or length(phone) > 20 then raise exception 'Please enter a valid phone number'; end if;
    if length(trim(coalesce(p_address, ''))) < 3 or length(p_address) > 300 then raise exception 'Please enter your address'; end if;
    if length(coalesce(p_notes, '')) > 500 then raise exception 'The note is too long'; end if;

    select data into svc from public.records
     where collection = 'services' and id = p_service and company_id = p_company and coalesce(data ->> 'online', 'true') <> 'false';
    if svc is null then raise exception 'This service is not available'; end if;
    if not exists (select 1 from public.records s join public.profiles p on p.id = s.data ->> 'userId'
                    where s.collection = 'staff' and s.id = p_cleaner and s.company_id = p_company and p.role in ('cleaner', 'staff')) then
        raise exception 'This cleaner is not available';
    end if;

    rules := public.cb_store_rules(p_company);
    dur := coalesce(nullif(svc ->> 'durationMinutes', '')::numeric::int, 120);
    st := public.cb_min(p_time);
    if st < public.cb_min(rules ->> 'workStart') or st + dur > public.cb_min(rules ->> 'workEnd') then raise exception 'Choose a time within working hours'; end if;
    local_now := public.cb_local_now(rules ->> 'timezone');
    if p_date::date + make_interval(mins => st) < local_now + (rules ->> 'minNoticeHours')::numeric * interval '1 hour' then
        raise exception 'This time is too soon. Please choose a later time';
    end if;
    if p_date::date > local_now::date + (rules ->> 'bookingDays')::int then raise exception 'This date is too far ahead'; end if;
    if exists (select 1 from public.records where collection = 'leave' and company_id = p_company and data ->> 'staffId' = p_cleaner
                and data ->> 'status' = 'approved' and p_date between data ->> 'start' and data ->> 'end') then
        raise exception 'This cleaner is away on that day';
    end if;

    -- One request at a time per cleaner and day, so two clients can never take the same time
    perform pg_advisory_xact_lock(hashtext(p_company || '|' || p_cleaner || '|' || p_date));
    if exists (
        select 1 from public.records b
        left join public.records sv on sv.collection = 'services' and sv.id = b.data ->> 'serviceId' and sv.company_id = b.company_id
        where b.collection = 'bookings' and b.company_id = p_company and b.data ->> 'cleanerId' = p_cleaner and b.data ->> 'date' = p_date
          and coalesce(b.data ->> 'status', '') <> 'cancelled' and b.data ->> 'time' ~ '^\d{1,2}:\d{2}'
          and public.cb_min(b.data ->> 'time') < st + dur
          and st < public.cb_min(b.data ->> 'time') + coalesce(nullif(sv.data ->> 'durationMinutes', '')::numeric::int, 120)
    ) then
        raise exception 'This time was just taken. Please choose another time';
    end if;

    select id into cl_id from public.records
     where collection = 'clients' and company_id = p_company and regexp_replace(coalesce(data ->> 'phone', ''), '[^0-9+]', '', 'g') = phone limit 1;
    if cl_id is not null then
        select count(*) into waiting from public.records
         where collection = 'bookings' and company_id = p_company and data ->> 'clientId' = cl_id
           and data ->> 'status' = 'pending' and data ->> 'source' = 'store'
           and case when data ->> 'createdAt' ~ '^\d{4}-\d{2}-\d{2}' then (data ->> 'createdAt')::timestamptz > now() - interval '1 day' else false end;
        if waiting >= 3 then raise exception 'You already have 3 requests waiting. The company will contact you soon'; end if;
    else
        cl_id := 'client-' || stamp;
        insert into public.records (collection, id, company_id, data) values ('clients', cl_id, p_company,
            jsonb_build_object('id', cl_id, 'companyId', p_company, 'name', trim(p_name), 'phone', trim(p_phone),
                'address', trim(p_address), 'totalSpent', 0, 'createdAt', now()));
    end if;

    bk_id := 'b-' || stamp;
    insert into public.records (collection, id, company_id, data) values ('bookings', bk_id, p_company,
        jsonb_build_object('id', bk_id, 'companyId', p_company, 'clientId', cl_id, 'serviceId', p_service, 'cleanerId', p_cleaner,
            'date', p_date, 'time', p_time, 'address', trim(p_address), 'price', coalesce(nullif(svc ->> 'price', '')::numeric, 0),
            'status', 'pending', 'paymentStatus', 'unpaid', 'source', 'store', 'notes', nullif(trim(coalesce(p_notes, '')), ''), 'createdAt', now()));
    insert into public.records (collection, id, company_id, data) values ('notifications', 'notif-' || stamp, p_company,
        jsonb_build_object('id', 'notif-' || stamp, 'companyId', p_company, 'title', 'New booking request',
            'message', trim(p_name) || ' asked for ' || coalesce(svc ->> 'name', 'a service') || ' on ' || p_date || ' at ' || p_time,
            'read', false, 'createdAt', now()));
    return jsonb_build_object('ok', true, 'bookingId', bk_id);
end $$;
revoke all on function public.public_request_booking(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.public_request_booking(text, text, text, text, text, text, text, text, text) to anon, authenticated;

-- Replaced by public_request_booking
drop function if exists public.public_create_booking(text, text, text, text, text, text, text);

-- The old public page used this; it now lists only the services shown in the store
create or replace function public.public_company(p_company text) returns jsonb
language sql stable security definer set search_path = public as $$
    select case when exists (select 1 from public.profiles where company_id = p_company and role = 'companyadmin' and status = 'active')
        then jsonb_build_object(
            'id', p_company,
            'name', (select data ->> 'name' from public.records where collection = 'companies' and id = p_company),
            'services', coalesce((select jsonb_agg(data order by data ->> 'name') from public.records
                                   where collection = 'services' and company_id = p_company and coalesce(data ->> 'online', 'true') <> 'false'), '[]'::jsonb)
        )
        else null end $$;

-- ---------------------------------------------------------------------------
-- PART: 0006_store_insights.sql
-- ---------------------------------------------------------------------------
-- CleanBase: booking store insights.
-- The public store records which steps a visitor reached. A visitor is a random id kept in their browser:
-- no name, no phone, no IP address. One row per visitor, step and day; last_at moves while the page is open.
-- Nobody reads the table directly. Visitors write through public_store_track; owners read totals through store_insights.

create table if not exists public.store_events (
    company_id text not null,
    visitor_id text not null,
    step text not null,
    day date not null default current_date,
    first_at timestamptz not null default now(),
    last_at timestamptz not null default now(),
    primary key (company_id, visitor_id, step, day)
);
create index if not exists store_events_company_time_idx on public.store_events (company_id, first_at);
alter table public.store_events enable row level security;
revoke all on public.store_events from anon, authenticated;

create or replace function public.public_store_track(p_company text, p_visitor text, p_step text) returns void
language plpgsql security definer set search_path = public as $$
begin
    if coalesce(p_visitor, '') !~ '^[A-Za-z0-9_-]{16,64}$' then return; end if;
    if p_step not in ('view', 'service', 'cleaner', 'time', 'details', 'request') then return; end if;
    if not exists (select 1 from public.profiles where company_id = p_company and role = 'companyadmin' and status = 'active') then return; end if;
    insert into public.store_events (company_id, visitor_id, step) values (p_company, p_visitor, p_step)
    on conflict (company_id, visitor_id, step, day) do update set last_at = now()
        where public.store_events.last_at < now() - interval '15 seconds';
end $$;
revoke all on function public.public_store_track(text, text, text) from public;
grant execute on function public.public_store_track(text, text, text) to anon, authenticated;

-- Totals for the owner: unique visitors per step, real store requests, live visitors and a day by day series.
create or replace function public.store_insights(p_company text, p_days int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
    since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 366)));
    days int := greatest(1, least(coalesce(p_days, 30), 366));
begin
    if not (public.cb_is_super() or (public.cb_is_active() and public.cb_company() = p_company and public.cb_role() in ('companyadmin', 'manager'))) then
        raise exception 'Not allowed';
    end if;
    return jsonb_build_object(
        'steps', (
            select coalesce(jsonb_object_agg(step, n), '{}'::jsonb) from (
                select step, count(distinct visitor_id) n from public.store_events
                 where company_id = p_company and last_at >= since group by step) s),
        'activeNow', (
            select count(distinct visitor_id) from public.store_events
             where company_id = p_company and last_at >= now() - interval '2 minutes'),
        'requests', (
            select count(*) from public.records
             where collection = 'bookings' and company_id = p_company and data ->> 'source' = 'store'
               and case when data ->> 'createdAt' ~ '^\d{4}-\d{2}-\d{2}' then (data ->> 'createdAt')::timestamptz >= since else false end),
        'accepted', (
            select count(*) from public.records
             where collection = 'bookings' and company_id = p_company and data ->> 'source' = 'store'
               and data ->> 'status' in ('confirmed', 'in_progress', 'completed')
               and case when data ->> 'createdAt' ~ '^\d{4}-\d{2}-\d{2}' then (data ->> 'createdAt')::timestamptz >= since else false end),
        'daily', (
            select coalesce(jsonb_agg(jsonb_build_object('day', to_char(d, 'YYYY-MM-DD'), 'visitors', coalesce(v.n, 0), 'requests', coalesce(r.n, 0)) order by d), '[]'::jsonb)
            from generate_series(current_date - (days - 1), current_date, interval '1 day') d
            left join (select day, count(distinct visitor_id) n from public.store_events where company_id = p_company and step = 'view' group by day) v on v.day = d::date
            left join (select day, count(distinct visitor_id) n from public.store_events where company_id = p_company and step = 'request' group by day) r on r.day = d::date)
    );
end $$;
revoke all on function public.store_insights(text, int) from public;
grant execute on function public.store_insights(text, int) to authenticated;
