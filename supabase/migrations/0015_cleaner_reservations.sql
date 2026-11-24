-- CleanBase: a cleaner kept by a subscription.
--
-- When a client has an active subscription with a cleaner, that cleaner is theirs for the whole period of the
-- subscription: the public booking page does not offer her to anyone else, and the database refuses a request
-- for her. She is free again when the period ends, or the subscription is paused or cancelled, or its contract
-- is ended or cancelled. The same rule runs in the app (src/services/reservations.ts): keep them in step.
--
-- Which subscriptions keep their cleaner is the company setting "reserveCleaners" (record collection 'settings'):
--   monthly (default)  monthly and live-in plans      all  every active subscription      off  none

create or replace function public.cb_reservations(p_company text) returns jsonb
language sql stable security definer set search_path = public as $$
    with mode as (
        select case when m in ('all', 'off') then m else 'monthly' end as m
        from (select coalesce((select data ->> 'reserveCleaners' from public.records where collection = 'settings' and company_id = p_company limit 1), 'monthly') as m) x
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'subscriptionId', s.id, 'cleanerId', s.data ->> 'cleanerId', 'clientId', s.data ->> 'clientId',
        'start', left(s.data ->> 'startDate', 10),
        'end', coalesce(nullif(left(coalesce(s.data ->> 'endDate', ''), 10), ''), '9999-12-31'))), '[]'::jsonb)
    from public.records s, mode
    where s.collection = 'subscriptions' and s.company_id = p_company
      and s.data ->> 'status' = 'active' and coalesce(s.data ->> 'cleanerId', '') <> ''
      and left(coalesce(s.data ->> 'startDate', ''), 10) ~ '^\d{4}-\d{2}-\d{2}$'
      and mode.m <> 'off'
      and (mode.m = 'all' or s.data ->> 'frequency' in ('monthly', 'live-in'))
      -- a subscription whose latest contract was ended or cancelled keeps nobody
      and coalesce((select c.data ->> 'status' from public.records c
                     where c.collection = 'contracts' and c.company_id = p_company and c.data ->> 'subscriptionId' = s.id
                     order by c.data ->> 'createdAt' desc limit 1), '') not in ('ended', 'cancelled') $$;
revoke all on function public.cb_reservations(text) from public, anon, authenticated;

-- Booking page: reserved cleaners are shown as away
create or replace function public.public_store(p_company text) returns jsonb
language sql stable security definer set search_path = public as $$
    select case when public.public_company(p_company) is null then null else jsonb_build_object(
        'company', (
            select jsonb_strip_nulls(jsonb_build_object(
                'id', p_company,
                'name', c.data ->> 'name',
                'logo', case when c.data ->> 'logo' like 'data:image/%' and length(c.data ->> 'logo') < 300000 then c.data ->> 'logo' end,
                'primaryColor', case when c.data ->> 'brandColor' ~ '^#[0-9a-fA-F]{6}$' then c.data ->> 'brandColor' end,
                'accentColor', case when c.data ->> 'brandAccent' ~ '^#[0-9a-fA-F]{6}$' then c.data ->> 'brandAccent' end,
                'tagline', nullif(left(trim(coalesce(c.data ->> 'tagline', '')), 80), '')))
            from public.records c where c.collection = 'companies' and c.id = p_company),
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
            select jsonb_agg(u.x) from (
                select jsonb_build_object('cleanerId', data ->> 'staffId', 'start', data ->> 'start', 'end', data ->> 'end') as x
                from public.records where collection = 'leave' and company_id = p_company and data ->> 'status' = 'approved'
                union all
                -- a cleaner kept by a subscription is away for everyone else during its period
                select jsonb_build_object('cleanerId', r ->> 'cleanerId', 'start', r ->> 'start', 'end', r ->> 'end')
                from jsonb_array_elements(public.cb_reservations(p_company)) r
            ) u), '[]'::jsonb)
    ) end $$;
revoke all on function public.public_store(text) from public;
grant execute on function public.public_store(text) to anon, authenticated;

-- Booking request: refuse a reserved cleaner
create or replace function public.public_request_booking(
    p_company text, p_service text, p_cleaner text, p_date text, p_time text,
    p_name text, p_phone text, p_address text, p_notes text default ''
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    svc jsonb; rules jsonb; day_rule jsonb; cl_id text; bk_id text; st int; dur int; local_now timestamp; waiting int;
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
    day_rule := public.cb_day_hours(rules, p_date);
    if day_rule is null then raise exception 'We are closed on that day'; end if;
    if st < public.cb_min(day_rule ->> 'start') or st + dur > public.cb_min(day_rule ->> 'end') then raise exception 'Choose a time within working hours'; end if;
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
    -- A cleaner kept by a subscription for another client cannot be booked by anyone else during its period
    if exists (select 1 from jsonb_array_elements(public.cb_reservations(p_company)) r
                where r ->> 'cleanerId' = p_cleaner and p_date between r ->> 'start' and r ->> 'end'
                  and (cl_id is null or r ->> 'clientId' <> cl_id)) then
        raise exception 'This cleaner is not available on that day';
    end if;

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
