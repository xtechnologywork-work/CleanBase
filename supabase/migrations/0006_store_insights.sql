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
