-- CleanBase: drivers.
--
-- Two new company collections:
--   accommodations  where the cleaners live (the driver picks them up and brings them back there)
--   trips           one per booking: the driver, and each step of the ride with its time
--
-- Who may do what:
--   owner, manager, dispatcher   create, assign and change trips; manage accommodations
--   driver                       reads the day, and moves ONLY the trips assigned to them to the next step;
--                                cannot create, delete or hand a trip to someone else
--   cleaner, staff               read trips and accommodations (to see who is coming)

create or replace function public.cb_tenant_collections() returns text[] language sql immutable as $$
    select array['companies','bookings','clients','services','staff','notifications','subscriptions','reviews','automations',
        'invoices','payments','expenses','zones','vehicles','supplies','supplyUsage','jobMeta','staffMeta','staffDocs',
        'attendance','leave','payroll','leads','quotes','complaints','promos','clientMeta','reviewRequests','contractTemplates','contracts','activity','settings',
        'trips','accommodations'] $$;

create or replace function public.cb_can_read(col text) returns boolean language sql stable security definer set search_path = public as $$
    select case public.cb_role()
        when 'superadmin' then true
        when 'companyadmin' then col = any (public.cb_tenant_collections())
        when 'manager' then col = any (public.cb_tenant_collections())
        when 'dispatcher' then col = any (array['companies','staff','clients','services','bookings','subscriptions','reviews','notifications',
            'jobMeta','zones','vehicles','supplies','supplyUsage','complaints','clientMeta','reviewRequests','contractTemplates','contracts','activity','settings',
            'trips','accommodations'])
        when 'accountant' then col = any (array['companies','staff','clients','services','bookings','subscriptions','reviews','notifications',
            'invoices','payments','expenses','payroll','staffMeta','staffDocs','attendance','leave','quotes','promos','activity','settings',
            'supplies','supplyUsage','jobMeta','complaints','zones','clientMeta'])
        when 'staff' then col = any (array['companies','staff','clients','services','bookings','notifications','jobMeta','supplies','supplyUsage','vehicles','zones','reviews','attendance','trips','accommodations'])
        when 'driver' then col = any (array['companies','staff','clients','services','bookings','notifications','jobMeta','supplies','supplyUsage','vehicles','zones','reviews','attendance','trips','accommodations'])
        when 'cleaner' then col = any (array['companies','staff','clients','services','bookings','notifications','jobMeta','supplies','supplyUsage','vehicles','zones','reviews','attendance','trips','accommodations'])
        else false end $$;

create or replace function public.cb_can_write(col text) returns boolean language sql stable security definer set search_path = public as $$
    select case public.cb_role()
        when 'superadmin' then true
        when 'companyadmin' then col = any (public.cb_tenant_collections())
        when 'manager' then col = any (public.cb_tenant_collections()) and col <> 'companies'
        when 'dispatcher' then col = any (array['bookings','clients','subscriptions','jobMeta','supplies','supplyUsage','zones','vehicles',
            'complaints','clientMeta','reviewRequests','contractTemplates','contracts','notifications','activity','trips','accommodations'])
        when 'accountant' then col = any (array['bookings','invoices','payments','expenses','payroll','staffMeta','attendance','promos','activity','notifications'])
        when 'staff' then col = any (array['bookings','jobMeta','supplyUsage','supplies','attendance','notifications','activity'])
        when 'driver' then col = any (array['bookings','jobMeta','supplyUsage','supplies','attendance','notifications','activity','trips'])
        when 'cleaner' then col = any (array['bookings','jobMeta','supplyUsage','supplies','attendance','notifications','activity'])
        else false end $$;

-- Field roles: bookings and trips are created and deleted by the office only.
drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert to authenticated with check (
    public.cb_is_super()
    or (collection = 'auditLogs' and company_id is null and public.cb_is_active())
    or (
        public.cb_is_active() and company_id is not null and company_id = public.cb_company()
        and public.cb_can_write(collection)
        and collection <> 'companies'
        and not (collection in ('bookings','trips') and public.cb_is_field_role())
    )
);

-- A driver changes only the trips assigned to them, and cannot give them to someone else.
drop policy if exists records_update on public.records;
create policy records_update on public.records for update to authenticated
using (
    public.cb_is_super()
    or (
        public.cb_is_active() and company_id is not null and company_id = public.cb_company()
        and public.cb_can_write(collection)
        and (collection <> 'bookings' or not public.cb_is_field_role() or data ->> 'cleanerId' = public.cb_staff_id())
        and (collection <> 'trips' or not public.cb_is_field_role() or data ->> 'driverId' = public.cb_staff_id())
    )
)
with check (
    public.cb_is_super()
    or (
        public.cb_is_active() and company_id is not null and company_id = public.cb_company()
        and public.cb_can_write(collection)
        and (collection <> 'bookings' or not public.cb_is_field_role() or data ->> 'cleanerId' = public.cb_staff_id())
        and (collection <> 'trips' or not public.cb_is_field_role() or data ->> 'driverId' = public.cb_staff_id())
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
        and not (collection in ('bookings','trips') and public.cb_is_field_role())
    )
);

-- A driver may only move a trip forward through its steps: they cannot change which booking it is for.
create or replace function public.cb_trip_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
    if new.collection <> 'trips' then return new; end if;
    if auth.uid() is null or public.cb_is_super() or not public.cb_is_field_role()
       or coalesce(current_setting('cb.bypass', true), '') = '1' then
        return new;
    end if;
    if (new.data ->> 'bookingId') is distinct from (old.data ->> 'bookingId')
       or (new.data ->> 'date') is distinct from (old.data ->> 'date') then
        raise exception 'a driver cannot change which booking a trip is for';
    end if;
    return new;
end $$;
drop trigger if exists records_trip_guard on public.records;
create trigger records_trip_guard before update on public.records
    for each row when (new.collection = 'trips') execute function public.cb_trip_guard();
