-- CleanBase: client portal phone lookup that does not care how the number was typed.
-- "33304550", "+974 3330 4550", "974-3330-4550" and "00974 33304550" are the same Qatar number.
-- A local 8 digit number is read as a Qatar number (974). Anything longer is taken as a full international number.

create or replace function public.cb_phone_key(p text) returns text language sql immutable as $$
    select case
        when length(d) = 8 then '974' || d
        else d
    end
    from (select regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^00', '') as d) x $$;

-- Same result as before (the client and their bookings), now matched by the phone key.
-- If the same person was saved twice with different spellings of the number, all their bookings are shown.
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
                from public.records b
                where b.collection = 'bookings' and b.company_id = p_company
                  and b.data ->> 'clientId' in (
                      select m.id from public.records m
                      where m.collection = 'clients' and m.company_id = p_company
                        and public.cb_phone_key(m.data ->> 'phone') = public.cb_phone_key(p_phone))
            ), '[]'::jsonb))
        from public.records c
        where c.collection = 'clients' and c.company_id = p_company
          and length(public.cb_phone_key(p_phone)) >= 7
          and public.cb_phone_key(c.data ->> 'phone') = public.cb_phone_key(p_phone)
        order by c.id
        limit 1) $$;
revoke all on function public.portal_lookup(text, text) from public;
grant execute on function public.portal_lookup(text, text) to anon, authenticated;
