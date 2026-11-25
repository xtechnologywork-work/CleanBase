-- One readable view per collection, so Supabase's Table Editor shows bookings, clients, invoices, staff...
-- as separate tables with a column for every field.
--
-- The app keeps writing to public.records (that is where row level security lives). These views only READ it:
--   * they run with the caller's rights (security_invoker), so they can never show more than records allows;
--   * the app roles (anon, authenticated) get no access to them at all: they are for you in the dashboard.
-- Columns come from the fields found in your data. After new kinds of data appear, run again:
--   select public.cb_refresh_collection_views();

create or replace function public.cb_refresh_collection_views() returns text language plpgsql as $$
declare
    c text;
    vname text;
    cols text;
    rk "char";
    n int := 0;
begin
    for c in select distinct collection from public.records where collection ~ '^[A-Za-z][A-Za-z0-9]*$' loop
        vname := lower(regexp_replace(c, '([a-z0-9])([A-Z])', '\1_\2', 'g'));
        -- never replace a real table or function-backed relation that is not one of these views
        select relkind into rk from pg_class where relnamespace = 'public'::regnamespace and relname = vname;
        if rk is not null and rk <> 'v' then continue; end if;

        select string_agg(format('r.data ->> %L as %I', k, k), ', ' order by k) into cols
        from (
            select distinct k
            from public.records r,
                 jsonb_object_keys(case when jsonb_typeof(r.data) = 'object' then r.data else '{}'::jsonb end) as k
            where r.collection = c
              and k ~ '^[A-Za-z_][A-Za-z0-9_]*$'
              and k not in ('id', 'company_id', 'updated_at', 'data')
            limit 60
        ) s;

        execute format('drop view if exists public.%I', vname);
        execute format(
            'create view public.%I with (security_invoker = true) as select r.id, r.company_id, r.updated_at%s, r.data from public.records r where r.collection = %L',
            vname, case when cols is null then '' else ', ' || cols end, c);
        execute format('revoke all on public.%I from anon, authenticated', vname);
        n := n + 1;
    end loop;
    return n || ' views created or refreshed';
end $$;

revoke all on function public.cb_refresh_collection_views() from public, anon, authenticated;

select public.cb_refresh_collection_views();
