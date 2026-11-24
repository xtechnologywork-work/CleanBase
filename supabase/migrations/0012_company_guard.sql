-- CleanBase: protect the fields of a company that only the platform admin may set.
--
-- A company owner can edit their company row (name, logo, colours, service zones...), but the plan,
-- the monthly price, the license date and the approval date belong to the platform admin. Before this
-- migration an owner could change them with the browser developer tools. Now the database keeps the
-- old values whatever the owner sends.
--
-- The platform admin's private notes about a tenant also move out of the company row (which the owner
-- can read) into a platform-only collection, "tenantNotes", that tenants can never read.

create or replace function public.cb_company_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare
    k text;
begin
    if new.collection <> 'companies' then return new; end if;
    if auth.uid() is null or public.cb_is_super() or coalesce(current_setting('cb.bypass', true), '') = '1' then
        return new;
    end if;
    foreach k in array array['subscriptionPlan', 'monthlyRevenue', 'licenseUntil', 'approvedAt', 'adminNotes', 'createdAt', 'id'] loop
        if tg_op = 'UPDATE' and old.data ? k then
            new.data := jsonb_set(new.data, array[k], old.data -> k);
        else
            new.data := new.data - k;
        end if;
    end loop;
    return new;
end $$;

drop trigger if exists records_company_guard on public.records;
create trigger records_company_guard before insert or update on public.records
    for each row when (new.collection = 'companies') execute function public.cb_company_guard();

-- Move existing private notes out of the company rows
do $do$
begin
    perform set_config('cb.bypass', '1', true);
    insert into public.records (collection, id, company_id, data)
    select 'tenantNotes', 'note-' || c.id, null,
           jsonb_build_object('id', 'note-' || c.id, 'tenantId', c.id, 'notes', c.data ->> 'adminNotes', 'createdAt', now())
    from public.records c
    where c.collection = 'companies' and coalesce(c.data ->> 'adminNotes', '') <> ''
    on conflict do nothing;
    update public.records set data = data - 'adminNotes' where collection = 'companies' and data ? 'adminNotes';
end $do$;
