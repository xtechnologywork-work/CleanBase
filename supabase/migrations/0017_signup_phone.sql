-- Sign up asks for a contact phone number, so the platform admin can reach a new company while it waits for approval.
-- The number is kept on the company record (data.phone). It is optional here, so a sign-up started before this
-- update (email confirmation still pending) can finish; the sign-up page itself requires it.

drop function if exists public.register_company(text, text, text);

create or replace function public.register_company(p_company_name text, p_plan text, p_name text default '', p_phone text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    uid uuid := auth.uid();
    em text;
    stamp text := (extract(epoch from clock_timestamp()) * 1000)::bigint::text;
    cid text := 'c-' || stamp;
    pid text := 'u-' || stamp;
    revenue int;
    phone text := nullif(trim(coalesce(p_phone, '')), '');
begin
    if uid is null then raise exception 'You must be signed in'; end if;
    if exists (select 1 from public.profiles where auth_id = uid) then raise exception 'This account already has a profile'; end if;
    if p_plan not in ('pro','ai_master') then raise exception 'Unknown plan'; end if;
    if length(trim(coalesce(p_company_name, ''))) < 2 or length(p_company_name) > 120 then raise exception 'Company name looks wrong'; end if;
    if phone is not null and phone !~ '^\+[0-9]{8,15}$' then raise exception 'Phone number looks wrong'; end if;
    select email into em from auth.users where id = uid;
    -- The AI Master plan is priced with each customer: it starts at 0 and the platform admin sets the agreed amount.
    revenue := case p_plan when 'pro' then 500 else 0 end;

    perform set_config('cb.bypass', '1', true);
    insert into public.records (collection, id, company_id, data) values (
        'companies', cid, cid,
        jsonb_strip_nulls(jsonb_build_object('id', cid, 'name', trim(p_company_name), 'subscriptionPlan', p_plan, 'monthlyRevenue', revenue,
            'phone', phone, 'createdAt', now()))
    );
    insert into public.profiles (id, auth_id, email, name, role, company_id, status)
    values (pid, uid, em, coalesce(nullif(trim(p_name), ''), split_part(em, '@', 1)), 'companyadmin', cid, 'locked');
    return jsonb_build_object('profileId', pid, 'companyId', cid);
end $$;
revoke all on function public.register_company(text, text, text, text) from public, anon;
grant execute on function public.register_company(text, text, text, text) to authenticated;
