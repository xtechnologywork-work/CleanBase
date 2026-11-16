-- CleanBase: built-in automations. No outside services. They run inside the database.
--   1. Recurring subscriptions create their bookings for the next 14 days.
--   2. Notifications for overdue invoices, expiring staff documents and low stock.
-- Scheduled hourly by 0004 (pg_cron). You can also run it by hand: select public.run_automations();

create or replace function public.run_automations() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    made_bookings int := 0;
    made_notes int := 0;
    n int;
begin
    -- 1. Recurring bookings -------------------------------------------------
    with subs as (
        select s.id, s.company_id, s.data as d
        from public.records s
        where s.collection = 'subscriptions' and s.data ->> 'status' = 'active'
          and s.data ->> 'frequency' in ('weekly','bi-weekly','monthly')
    ),
    days as (
        select subs.*, gs::date as day
        from subs, generate_series(current_date, current_date + 14, interval '1 day') gs
        where (subs.d ->> 'startDate')::date <= gs::date
          and (subs.d ->> 'endDate' is null or (subs.d ->> 'endDate')::date >= gs::date)
          and case subs.d ->> 'frequency'
                when 'weekly' then (gs::date - (subs.d ->> 'startDate')::date) % 7 = 0
                when 'bi-weekly' then (gs::date - (subs.d ->> 'startDate')::date) % 14 = 0
                else extract(day from gs) = extract(day from (subs.d ->> 'startDate')::date)
              end
    ),
    ins as (
        insert into public.records (collection, id, company_id, data)
        select 'bookings', 'b-sub-' || days.id || '-' || to_char(days.day, 'YYYYMMDD'), days.company_id,
            jsonb_strip_nulls(jsonb_build_object(
                'id', 'b-sub-' || days.id || '-' || to_char(days.day, 'YYYYMMDD'),
                'companyId', days.company_id,
                'clientId', days.d ->> 'clientId',
                'serviceId', days.d ->> 'serviceId',
                'cleanerId', days.d ->> 'cleanerId',
                'date', to_char(days.day, 'YYYY-MM-DD'),
                'time', coalesce(days.d ->> 'time', '09:00'),
                'address', coalesce((select c.data ->> 'address' from public.records c where c.collection = 'clients' and c.id = days.d ->> 'clientId'), ''),
                'price', coalesce((days.d ->> 'pricePerVisit')::numeric, 0),
                'status', 'confirmed', 'paymentStatus', 'unpaid',
                'isRecurring', true, 'subscriptionId', days.id, 'createdAt', now()))
        from days
        on conflict (collection, id) do nothing
        returning 1
    )
    select count(*) into made_bookings from ins;

    -- 2a. Overdue invoices ------------------------------------------------------
    with inv as (
        select r.id, r.company_id, r.data ->> 'number' as number, (r.data ->> 'dueDate')::date as due,
               ((select coalesce(sum((i ->> 'qty')::numeric * (i ->> 'price')::numeric), 0) from jsonb_array_elements(r.data -> 'items') i)
                 - coalesce((r.data ->> 'discount')::numeric, 0)) * (1 + coalesce((r.data ->> 'taxRate')::numeric, 0) / 100) as total,
               (select coalesce(sum(case when p.data ->> 'kind' = 'refund' then -(p.data ->> 'amount')::numeric else (p.data ->> 'amount')::numeric end), 0)
                  from public.records p where p.collection = 'payments' and p.company_id = r.company_id and p.data ->> 'invoiceId' = r.id) as paid
        from public.records r
        where r.collection = 'invoices' and r.data ->> 'status' = 'sent'
    ),
    ins as (
        insert into public.records (collection, id, company_id, data)
        select 'notifications', 'auto-od-' || inv.id, inv.company_id,
            jsonb_build_object('id', 'auto-od-' || inv.id, 'companyId', inv.company_id, 'title', 'Invoice overdue',
                'message', 'Invoice ' || inv.number || ' was due on ' || to_char(inv.due, 'DD Mon YYYY') || ' and still has a balance.',
                'read', false, 'createdAt', now())
        from inv where inv.due < current_date and inv.total - inv.paid > 0.005
        on conflict (collection, id) do nothing
        returning 1
    )
    select count(*) into n from ins; made_notes := made_notes + n;

    -- 2b. Staff documents expiring within 30 days --------------------------------
    with ins as (
        insert into public.records (collection, id, company_id, data)
        select 'notifications', 'auto-doc-' || d.id, d.company_id,
            jsonb_build_object('id', 'auto-doc-' || d.id, 'companyId', d.company_id, 'title', 'Document expiring',
                'message', coalesce(d.data ->> 'type', 'Document') || ' expires on ' || to_char((d.data ->> 'expiry')::date, 'DD Mon YYYY') || '.',
                'read', false, 'createdAt', now())
        from public.records d
        where d.collection = 'staffDocs' and (d.data ->> 'expiry')::date <= current_date + 30
        on conflict (collection, id) do nothing
        returning 1
    )
    select count(*) into n from ins; made_notes := made_notes + n;

    -- 2c. Low stock, at most once a week per item ---------------------------------
    with ins as (
        insert into public.records (collection, id, company_id, data)
        select 'notifications', 'auto-stock-' || s.id || '-' || to_char(current_date, 'IYYYIW'), s.company_id,
            jsonb_build_object('id', 'auto-stock-' || s.id || '-' || to_char(current_date, 'IYYYIW'), 'companyId', s.company_id, 'title', 'Low stock',
                'message', (s.data ->> 'name') || ' is at ' || (s.data ->> 'stock') || ' ' || coalesce(s.data ->> 'unit', '') || '. Time to reorder.',
                'read', false, 'createdAt', now())
        from public.records s
        where s.collection = 'supplies' and (s.data ->> 'stock')::numeric <= (s.data ->> 'minStock')::numeric
        on conflict (collection, id) do nothing
        returning 1
    )
    select count(*) into n from ins; made_notes := made_notes + n;

    return jsonb_build_object('bookingsCreated', made_bookings, 'notificationsCreated', made_notes);
end $$;
revoke all on function public.run_automations() from public, anon, authenticated;
