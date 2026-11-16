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
