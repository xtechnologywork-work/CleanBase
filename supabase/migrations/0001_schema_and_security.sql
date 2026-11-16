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
