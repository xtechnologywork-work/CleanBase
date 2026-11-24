-- CleanBase: booking page branding.
-- The company record may carry a logo (small data URL), a main colour, a soft colour and a short tagline.
-- public_store returns them so the public booking page can show the company's own look.
-- Values are checked here again: the logo must be an image data URL under 300 KB, colours must be #rrggbb.

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
            select jsonb_agg(jsonb_build_object('cleanerId', data ->> 'staffId', 'start', data ->> 'start', 'end', data ->> 'end'))
            from public.records where collection = 'leave' and company_id = p_company and data ->> 'status' = 'approved'), '[]'::jsonb)
    ) end $$;
revoke all on function public.public_store(text) from public;
grant execute on function public.public_store(text) to anon, authenticated;
