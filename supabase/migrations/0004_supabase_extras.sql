-- CleanBase: Supabase-only extras (storage bucket, realtime, hourly automations).
-- Every block is guarded: if a feature is not available on your project the block is skipped
-- with a NOTICE and the rest still runs.

-- Private bucket for job photos. Files live under "<company id>/<job id>/<file>".
do $do$
begin
    insert into storage.buckets (id, name, public) values ('job-photos', 'job-photos', false) on conflict (id) do nothing;

    drop policy if exists "job photos read" on storage.objects;
    create policy "job photos read" on storage.objects for select to authenticated using (
        bucket_id = 'job-photos' and public.cb_is_active() and (public.cb_is_super() or (storage.foldername(name))[1] = public.cb_company())
    );
    drop policy if exists "job photos write" on storage.objects;
    create policy "job photos write" on storage.objects for insert to authenticated with check (
        bucket_id = 'job-photos' and public.cb_is_active() and (public.cb_is_super() or (storage.foldername(name))[1] = public.cb_company())
    );
    drop policy if exists "job photos delete" on storage.objects;
    create policy "job photos delete" on storage.objects for delete to authenticated using (
        bucket_id = 'job-photos' and public.cb_is_active() and (public.cb_is_super() or (storage.foldername(name))[1] = public.cb_company())
    );
exception when others then
    raise notice 'Storage setup skipped: %', sqlerrm;
end $do$;

-- Live updates: other users see changes without refreshing. Row level security still applies to the data.
do $do$
begin
    alter publication supabase_realtime add table public.records;
    alter publication supabase_realtime add table public.profiles;
exception
    when duplicate_object then null;
    when others then raise notice 'Realtime setup skipped: %', sqlerrm;
end $do$;

-- Hourly automations (recurring bookings, overdue, expiry and stock notifications). Needs pg_cron.
do $do$
begin
    create extension if not exists pg_cron;
    perform cron.unschedule('cleanbase-automations');
exception when others then null;
end $do$;
do $do$
begin
    perform cron.schedule('cleanbase-automations', '0 * * * *', 'select public.run_automations()');
exception when others then
    raise notice 'Hourly schedule skipped (enable pg_cron under Database, Extensions, then run this file again): %', sqlerrm;
end $do$;
