-- CleanBase: cleaner introduction videos.
-- Private bucket "staff-videos". Files live under "<company id>/<file>". Only active members of that company
-- (and the platform admin) can read, add or remove them. Limit: 50 MB, MP4, WebM or MOV.
-- Guarded like the other storage setup: if storage is not available on your project the block is skipped with a NOTICE.
do $do$
begin
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('staff-videos', 'staff-videos', false, 52428800, array['video/mp4', 'video/webm', 'video/quicktime'])
    on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = array['video/mp4', 'video/webm', 'video/quicktime'];

    drop policy if exists "staff videos read" on storage.objects;
    create policy "staff videos read" on storage.objects for select to authenticated using (
        bucket_id = 'staff-videos' and public.cb_is_active() and (public.cb_is_super() or (storage.foldername(name))[1] = public.cb_company())
    );
    drop policy if exists "staff videos write" on storage.objects;
    create policy "staff videos write" on storage.objects for insert to authenticated with check (
        bucket_id = 'staff-videos' and public.cb_is_active() and (public.cb_is_super() or (storage.foldername(name))[1] = public.cb_company())
    );
    drop policy if exists "staff videos delete" on storage.objects;
    create policy "staff videos delete" on storage.objects for delete to authenticated using (
        bucket_id = 'staff-videos' and public.cb_is_active() and (public.cb_is_super() or (storage.foldername(name))[1] = public.cb_company())
    );
exception when others then
    raise notice 'Staff video storage setup skipped: %', sqlerrm;
end $do$;
