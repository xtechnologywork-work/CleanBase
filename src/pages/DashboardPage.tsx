import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Banknote, CalendarCheck, CircleAlert, HandCoins, Plus, TrendingUp, UserRound, Wallet } from 'lucide-react';
import { addDays, format, parseISO } from 'date-fns';
import {
    cashIn, clearDemo, expensesIn, fmt, fmt0, hasDemo, inRange, outstanding, pctChange, PERIOD_LABEL, rangeFor, readCollection,
    revenueIn, seedDemo, shortDay, today, useCollection, useDB,
} from '../services/erp';
import type { Period } from '../services/erp';
import { Empty, Kpi, Pill, Panel, Tabs } from '../components/shared/ui';
import { isCloud } from '../services/backend';

const delta = (cur: number, prev: number, invert = false) => {
    if (prev <= 0) return <span className="muted">no previous period to compare</span>;
    const p = pctChange(cur, prev);
    const good = invert ? p <= 0 : p >= 0;
    return <span className={good ? 'tone-good' : 'tone-bad'}>{p >= 0 ? '+' : ''}{p.toFixed(1)}% vs previous period</span>;
};

export const DashboardPage: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const companyId = user?.companyId || '';
    const db = useDB();
    const [period, setPeriod] = useState<Period>('30d');

    // Subscribing keeps the page live when ERP data changes.
    useCollection('invoices', companyId);
    useCollection('expenses', companyId);
    useCollection('payments', companyId);

    const company = db.companies.find(c => c.id === companyId);
    const data = useMemo(() => {
        const r = rangeFor(period);
        const bookings = db.bookings.filter(b => b.companyId === companyId);
        const todayStr = today();
        const revenue = revenueIn(db, companyId, r.from, r.to);
        const prevRevenue = revenueIn(db, companyId, r.prevFrom, r.prevTo);
        const cash = cashIn(db, companyId, r.from, r.to);
        const prevCash = cashIn(db, companyId, r.prevFrom, r.prevTo);
        const expenses = expensesIn(companyId, r.from, r.to);
        const prevExpenses = expensesIn(companyId, r.prevFrom, r.prevTo);
        const out = outstanding(db, companyId);
        const todays = bookings.filter(b => b.date === todayStr && b.status !== 'cancelled').sort((a, b) => a.time.localeCompare(b.time));
        const upcomingUnassigned = bookings.filter(b => !b.cleanerId && b.date >= todayStr && b.status !== 'cancelled' && b.status !== 'completed');
        const completedInRange = bookings.filter(b => b.status === 'completed' && inRange(b.date, r.from, r.to));
        const cancelledInRange = bookings.filter(b => b.status === 'cancelled' && inRange(b.date, r.from, r.to));

        // Chart buckets: daily up to 30 days, otherwise weekly.
        const step = r.days <= 31 ? 1 : 7;
        const series: { name: string; revenue: number; expenses: number }[] = [];
        for (let i = 0; i < r.days; i += step) {
            const from = format(addDays(parseISO(r.from), i), 'yyyy-MM-dd');
            const to = format(addDays(parseISO(r.from), Math.min(i + step - 1, r.days - 1)), 'yyyy-MM-dd');
            series.push({ name: shortDay(from), revenue: revenueIn(db, companyId, from, to), expenses: expensesIn(companyId, from, to) });
        }

        const bySvc: Record<string, { name: string; jobs: number; revenue: number }> = {};
        completedInRange.forEach(b => {
            const name = db.services.find(s => s.id === b.serviceId)?.name || 'Service';
            bySvc[name] ||= { name, jobs: 0, revenue: 0 };
            bySvc[name].jobs++; bySvc[name].revenue += b.price;
        });
        const byCleaner: Record<string, { name: string; jobs: number; revenue: number }> = {};
        completedInRange.forEach(b => {
            if (!b.cleanerId) return;
            const st = db.staff.find(s => s.id === b.cleanerId);
            const name = db.users.find(u => u.id === st?.userId)?.name || 'Cleaner';
            byCleaner[b.cleanerId] ||= { name, jobs: 0, revenue: 0 };
            byCleaner[b.cleanerId].jobs++; byCleaner[b.cleanerId].revenue += b.price;
        });

        // Attention list
        const soon = format(addDays(new Date(), 30), 'yyyy-MM-dd');
        const staffIds = new Set(db.staff.filter(s => s.companyId === companyId).map(s => s.id));
        const docs = readCollection('staffDocs', companyId).filter(d => staffIds.has(d.staffId) && d.expiry <= soon);
        const lowStock = readCollection('supplies', companyId).filter(s => s.stock <= s.minStock);
        const complaints = readCollection('complaints', companyId).filter(c => c.status !== 'resolved');
        const leave = readCollection('leave', companyId).filter(l => l.status === 'pending');
        const deletion = bookings.filter(b => b.deletionRequested);
        const unpaidToday = todays.filter(b => b.status === 'completed' && b.paymentStatus !== 'paid');

        const activeClients = new Set(bookings.filter(b => inRange(b.date, r.from, r.to) && b.status !== 'cancelled').map(b => b.clientId)).size;
        const reviews = db.reviews.filter(rv => rv.companyId === companyId);
        const avgRating = reviews.length ? reviews.reduce((s, rv) => s + rv.rating, 0) / reviews.length : 0;

        return {
            r, revenue, prevRevenue, cash, prevCash, expenses, prevExpenses, out, todays, upcomingUnassigned, completedInRange,
            cancelledInRange, series, services: Object.values(bySvc).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
            cleaners: Object.values(byCleaner).sort((a, b) => b.revenue - a.revenue).slice(0, 5), docs, lowStock, complaints, leave,
            deletion, unpaidToday, activeClients, avgRating, reviews: reviews.length,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db, companyId, period, readCollection('invoices', companyId).length, readCollection('expenses', companyId).length, readCollection('payments', companyId).length]);

    const profit = data.revenue - data.expenses;
    const prevProfit = data.prevRevenue - data.prevExpenses;
    const hasAnyData = db.bookings.some(b => b.companyId === companyId);
    const attention: { label: string; count: number; to: string; tone?: 'warn' | 'bad' }[] = [
        { label: 'Booking requests waiting for your answer', count: db.bookings.filter(b => b.companyId === companyId && b.status === 'pending').length, to: '/app/bookings', tone: 'bad' as const },
        { label: 'Jobs with no cleaner assigned', count: data.upcomingUnassigned.length, to: '/app/dispatch', tone: 'bad' as const },
        { label: 'Overdue invoices', count: data.out.overdueCount, to: '/app/invoices', tone: 'bad' as const },
        { label: 'Completed jobs not invoiced or paid', count: data.out.uninvoicedCount, to: '/app/invoices', tone: 'warn' as const },
        { label: 'Open complaints', count: data.complaints.length, to: '/app/quality', tone: 'warn' as const },
        { label: 'Staff documents expiring within 30 days', count: data.docs.length, to: '/app/team', tone: 'warn' as const },
        { label: 'Supplies at or below minimum stock', count: data.lowStock.length, to: '/app/resources', tone: 'warn' as const },
        { label: 'Leave requests waiting for approval', count: data.leave.length, to: '/app/team', tone: 'warn' as const },
        { label: 'Deletion requests to review', count: data.deletion.length, to: '/app/bookings', tone: 'warn' as const },
    ].filter(a => a.count > 0);

    const statusPill = (s: string) => {
        if (s === 'completed') return <Pill tone="good">Completed</Pill>;
        if (s === 'in_progress') return <Pill tone="warn">In progress</Pill>;
        if (s === 'confirmed') return <Pill tone="info">Confirmed</Pill>;
        return <Pill>Pending</Pill>;
    };
    const cleanerName = (id?: string) => {
        if (!id) return null;
        const st = db.staff.find(s => s.id === id);
        return db.users.find(u => u.id === st?.userId)?.name || null;
    };
    const clientName = (id: string) => db.clients.find(c => c.id === id)?.name || 'Guest';
    const svcName = (id: string) => db.services.find(s => s.id === id)?.name || 'Service';

    return (
        <div className="pg">
            <div className="pg-head">
                <div>
                    <h1>{company?.name || 'Overview'}</h1>
                    <p>How the business is doing right now: money, jobs, people and what needs you today.</p>
                </div>
                <div className="pg-actions">
                    <Tabs
                        value={period}
                        onChange={setPeriod}
                        tabs={(['7d', '30d', '90d', 'ytd'] as Period[]).map(p => ({ id: p, label: p === 'ytd' ? 'Year' : p }))}
                    />
                    <button className="btn btn-primary" onClick={() => navigate('/app/bookings')}><Plus size={15} /> New booking</button>
                </div>
            </div>

            {!hasAnyData && (
                <Panel title="Your workspace is empty" subtitle={isCloud ? 'Add your services and cleaners, then take your first booking. Everything you enter is saved to your account.' : 'Add your first booking, or load sample data to see every part of the system working with numbers in it.'}>
                    <div className="toolbar">
                        {!isCloud && <button className="btn btn-primary" onClick={() => seedDemo(companyId)}>Load sample data</button>}
                        <button className="btn btn-secondary" onClick={() => navigate('/app/services')}>Set up services first</button>
                    </div>
                </Panel>
            )}

            <div className="kpis">
                <Kpi label="Revenue" icon={<TrendingUp size={16} />} value={fmt0(data.revenue)} unit="QAR"
                    hint={<>{data.completedInRange.length} completed jobs, {delta(data.revenue, data.prevRevenue)}</>} />
                <Kpi label="Cash collected" icon={<Banknote size={16} />} value={fmt0(data.cash)} unit="QAR"
                    hint={delta(data.cash, data.prevCash)} />
                <Kpi label="Outstanding" icon={<HandCoins size={16} />} value={fmt0(data.out.total)} unit="QAR" tone={data.out.overdue > 0 ? 'warn' : undefined}
                    hint={data.out.overdue > 0 ? `${fmt0(data.out.overdue)} QAR overdue` : 'Nothing overdue'} />
                <Kpi label="Net profit" icon={<Wallet size={16} />} value={fmt0(profit)} unit="QAR" tone={profit < 0 ? 'bad' : undefined}
                    hint={<>After {fmt0(data.expenses)} QAR expenses, {delta(profit, prevProfit)}</>} />
            </div>

            <div className="kpis">
                <Kpi label="Jobs today" icon={<CalendarCheck size={16} />} value={data.todays.length}
                    hint={`${data.todays.filter(b => b.status === 'completed').length} done, ${data.todays.filter(b => b.status === 'in_progress').length} in progress`} />
                <Kpi label="Unassigned jobs" icon={<CircleAlert size={16} />} value={data.upcomingUnassigned.length} tone={data.upcomingUnassigned.length ? 'bad' : undefined}
                    hint="Upcoming, no cleaner yet" />
                <Kpi label="Active clients" icon={<UserRound size={16} />} value={data.activeClients} hint={`In the last ${PERIOD_LABEL[period]}`} />
                <Kpi label="Average rating" value={data.reviews ? data.avgRating.toFixed(1) : 'No reviews'} unit={data.reviews ? '/ 5' : undefined}
                    hint={`${data.cancelledInRange.length} cancellations in period`} />
            </div>

            <div className="grid2">
                <Panel title="Revenue and expenses" subtitle={`Completed jobs against money going out, last ${PERIOD_LABEL[period]}`}>
                    <div style={{ height: 260 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ededf0" />
                                <XAxis dataKey="name" stroke="#86868b" fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
                                <YAxis stroke="#86868b" fontSize={11} tickLine={false} axisLine={false} />
                                <Tooltip formatter={(v) => `${fmt0(Number(v))} QAR`} contentStyle={{ borderRadius: 10, border: 'none', fontSize: 12, boxShadow: 'var(--shadow-lg)' }} />
                                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#0066cc" strokeWidth={2} fill="#0066cc" fillOpacity={0.12} />
                                <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#86868b" strokeWidth={2} fill="#86868b" fillOpacity={0.1} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </Panel>

                <Panel title="Needs your attention" subtitle="The things most likely to cost you money or customers">
                    {attention.length === 0 ? <Empty>All clear. Nothing needs attention.</Empty> : (
                        <div className="stack" style={{ gap: '0.5rem' }}>
                            {attention.map(a => (
                                <button key={a.label} className="attn" onClick={() => navigate(a.to)}>
                                    <span>{a.label}</span>
                                    <b className={a.tone === 'bad' ? 'tone-bad' : 'tone-warn'}>{a.count}</b>
                                </button>
                            ))}
                        </div>
                    )}
                </Panel>
            </div>

            <div className="grid2">
                <Panel title="Today's jobs" subtitle={format(new Date(), 'EEEE d MMMM')} actions={<button className="btn btn-secondary btn-sm" onClick={() => navigate('/app/dispatch')}>Open dispatch board</button>}>
                    {data.todays.length === 0 ? <Empty>No jobs scheduled for today.</Empty> : data.todays.map(b => (
                        <div className="row" key={b.id}>
                            <div>
                                <b style={{ fontWeight: 600 }}>{b.time}</b> &nbsp;{clientName(b.clientId)}
                                <div className="sub">{svcName(b.serviceId)} · {b.address || 'No address'}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                {cleanerName(b.cleanerId) ? <span className="muted">{cleanerName(b.cleanerId)}</span> : <Pill tone="bad">Unassigned</Pill>}
                                {statusPill(b.status)}
                            </div>
                        </div>
                    ))}
                </Panel>

                <div className="stack">
                    <Panel title="Top services" subtitle="By revenue in the period">
                        {data.services.length === 0 ? <Empty>No completed jobs in this period.</Empty> : data.services.map(s => (
                            <div key={s.name} style={{ marginBottom: 12 }}>
                                <div className="row" style={{ padding: 0, border: 0, marginBottom: 4 }}>
                                    <span>{s.name}</span><span className="muted">{fmt0(s.revenue)} QAR · {s.jobs} {s.jobs === 1 ? 'job' : 'jobs'}</span>
                                </div>
                                <div className="bar"><i style={{ width: `${(s.revenue / data.services[0].revenue) * 100}%` }} /></div>
                            </div>
                        ))}
                    </Panel>
                    <Panel title="Top cleaners" subtitle="By revenue in the period">
                        {data.cleaners.length === 0 ? <Empty>No completed jobs in this period.</Empty> : data.cleaners.map(c => (
                            <div className="row" key={c.name}><span>{c.name}</span><span className="muted">{fmt0(c.revenue)} QAR · {c.jobs} {c.jobs === 1 ? 'job' : 'jobs'}</span></div>
                        ))}
                    </Panel>
                </div>
            </div>

            {hasDemo(companyId) && (
                <div className="tiny">
                    This workspace contains sample data. <button className="btn btn-ghost btn-sm" onClick={() => { if (confirm('Remove all sample data? Your own records stay.')) clearDemo(companyId); }}>Remove sample data</button>
                    Average job value: {fmt(data.completedInRange.length ? data.revenue / data.completedInRange.length : 0)} QAR.
                </div>
            )}
        </div>
    );
};
