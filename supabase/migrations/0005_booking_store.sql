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
