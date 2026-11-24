-- CleanBase: the company's public look (name, logo, colours, tagline) for pages that are not the booking store,
-- such as the client portal. Same checks as public_store: the logo must be a small image data URL, colours must be #rrggbb.
-- Returns null when the company does not exist or is not active.

create or replace function public.public_brand(p_company text) returns jsonb
language sql stable security definer set search_path = public as $$
    select case when not exists (select 1 from public.profiles where company_id = p_company and role = 'companyadmin' and status = 'active') then null else (
        select jsonb_strip_nulls(jsonb_build_object(
            'id', p_company,
            'name', c.data ->> 'name',
            'logo', case when c.data ->> 'logo' like 'data:image/%' and length(c.data ->> 'logo') < 300000 then c.data ->> 'logo' end,
            'primaryColor', case when c.data ->> 'brandColor' ~ '^#[0-9a-fA-F]{6}$' then c.data ->> 'brandColor' end,
            'accentColor', case when c.data ->> 'brandAccent' ~ '^#[0-9a-fA-F]{6}$' then c.data ->> 'brandAccent' end,
            'tagline', nullif(left(trim(coalesce(c.data ->> 'tagline', '')), 80), '')))
        from public.records c where c.collection = 'companies' and c.id = p_company) end $$;
revoke all on function public.public_brand(text) from public;
grant execute on function public.public_brand(text) to anon, authenticated;
