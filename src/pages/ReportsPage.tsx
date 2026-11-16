import React, { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { differenceInDays, endOfMonth, format, parseISO, subMonths } from 'date-fns';
import {
    dayLabel, downloadCsv, expensesIn, fmt, fmt0, inRange, PERIOD_LABEL, rangeFor, revenueIn, staffName, today, useCollection, useDB,
} from '../services/erp';
import type { Period } from '../services/erp';
import { Empty, Kpi, PageHeader, Panel, Table, Tabs } from '../components/shared/ui';

type Tab = 'revenue' | 'profit' | 'cleaners' | 'clients' | 'cancellations';

export const ReportsPage: React.FC = () => {
    const { user } = useAuth();
    const companyId = user?.companyId || '';
    const db = useDB();
    const { items: expenses } = useCollection('expenses', companyId);
    const { items: usage } = useCollection('supplyUsage', companyId);
    const { items: supplies } = useCollection('supplies', companyId);
    const [tab, setTab] = useState<Tab>('revenue');
    const [period, setPeriod] = useState<Period>('30d');

    const r = rangeFor(period);
    const bookings = db.bookings.filter(b => b.companyId === companyId);
    const svcName = (id: string) => db.services.find(s => s.id === id)?.name || 'Service';
    const dur = (id: string) => db.services.find(s => s.id === id)?.durationMinutes || 120;

    const months = useMemo(() => Array.from({ length: 6 }, (_, i) => {
        const d = subMonths(new Date(), 5 - i);
        const from = format(d, 'yyyy-MM-01'), to = format(endOfMonth(d), 'yyyy-MM-dd');
        const revenue = revenueIn(db, companyId, from, to), spent = expensesIn(companyId, from, to);
        return { name: format(d, 'MMM'), month: format(d, 'yyyy-MM'), revenue, expenses: spent, profit: revenue - spent };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [db, companyId, expenses.length]);

    const done = bookings.filter(b => b.status === 'completed' && inRange(b.date, r.from, r.to));
    const cancelled = bookings.filter(b => b.status === 'cancelled' && inRange(b.date, r.from, r.to));

    const bySvc = Object.values(done.reduce<Record<string, { id: string; name: string; jobs: number; revenue: number; supplies: number }>>((a, b) => {
        const k = b.serviceId; a[k] ||= { id: k, name: svcName(k), jobs: 0, revenue: 0, supplies: 0 };
        a[k].jobs++; a[k].revenue += b.price;
        a[k].supplies += usage.filter(u => u.bookingId === b.id).reduce((s, u) => s + u.qty * (supplies.find(x => x.id === u.supplyId)?.costPerUnit || 0), 0);
        return a;
    }, {})).sort((x, y) => y.revenue - x.revenue);

    const byCleaner = db.staff.filter(s => s.companyId === companyId).map(s => {
        const jobs = done.filter(b => b.cleanerId === s.id);
        const hours = jobs.reduce((a, b) => a + dur(b.serviceId) / 60, 0);
        const revenue = jobs.reduce((a, b) => a + b.price, 0);
        return { id: s.id, name: staffName(db, s.id), jobs: jobs.length, hours, revenue, perHour: hours ? revenue / hours : 0 };
    }).sort((a, b) => b.revenue - a.revenue);

    const clients = db.clients.filter(c => c.companyId === companyId);
    const clientRows = clients.map(c => {
        const mine = bookings.filter(b => b.clientId === c.id && b.status === 'completed');
        const last = mine.map(b => b.date).sort().pop();
        return { id: c.id, name: c.name, jobs: mine.length, revenue: mine.reduce((s, b) => s + b.price, 0), last, daysSince: last ? differenceInDays(new Date(), parseISO(last)) : null };
    }).sort((a, b) => b.revenue - a.revenue);
    const repeat = clientRows.filter(c => c.jobs > 1).length;
    const buyers = clientRows.filter(c => c.jobs > 0).length;
    const dormant = clientRows.filter(c => c.daysSince !== null && c.daysSince > 60);
    const newClients = clients.filter(c => inRange(c.createdAt.slice(0, 10), r.from, r.to)).length;
    const activeClients = new Set(done.map(b => b.clientId)).size;

    const totalBookings = bookings.filter(b => inRange(b.date, r.from, r.to)).length;
    const lost = cancelled.reduce((s, b) => s + b.price, 0);
    const revenue = revenueIn(db, companyId, r.from, r.to);
    const spent = expensesIn(companyId, r.from, r.to);

    const chart = (keys: { k: string; name: string; color: string }[]) => (
        <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={months} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ededf0" />
                    <XAxis dataKey="name" stroke="#86868b" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#86868b" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip formatter={v => `${fmt0(Number(v))} QAR`} contentStyle={{ borderRadius: 10, border: 'none', fontSize: 12, boxShadow: 'var(--shadow-lg)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    {keys.map(k => <Bar key={k.k} dataKey={k.k} name={k.name} fill={k.color} radius={[6, 6, 0, 0]} />)}
                </BarChart>
            </ResponsiveContainer>
        </div>
    );

    return (
        <div className="pg">
            <PageHeader title="Reports" subtitle="The numbers behind the business. Every table exports to CSV for your accountant.">
                <Tabs value={period} onChange={setPeriod} tabs={(['7d', '30d', '90d', 'ytd'] as Period[]).map(p => ({ id: p, label: p === 'ytd' ? 'Year' : p }))} />
            </PageHeader>
            <Tabs value={tab} onChange={setTab} tabs={[
                { id: 'revenue', label: 'Revenue' }, { id: 'profit', label: 'Profit' }, { id: 'cleaners', label: 'Cleaner productivity' },
                { id: 'clients', label: 'Client retention' }, { id: 'cancellations', label: 'Cancellations' },
            ]} />

            {tab === 'revenue' && (
                <>
                    <div className="kpis">
                        <Kpi label={`Revenue, ${PERIOD_LABEL[period]}`} value={fmt0(revenue)} unit="QAR" />
                        <Kpi label="Completed jobs" value={done.length} />
                        <Kpi label="Average job value" value={fmt(done.length ? revenue / done.length : 0, 0)} unit="QAR" />
                    </div>
                    <Panel title="Revenue by month" subtitle="Last six months">{chart([{ k: 'revenue', name: 'Revenue', color: '#0066cc' }])}</Panel>
                    <Panel title="By service" actions={<button className="btn btn-secondary btn-sm" onClick={() => downloadCsv('revenue-by-service.csv', bySvc.map(s => ({ Service: s.name, Jobs: s.jobs, Revenue: s.revenue })))}>Export CSV</button>}>
                        <Table rows={bySvc} empty="No completed jobs in this period." cols={[
                            { key: 'n', header: 'Service', render: s => s.name }, { key: 'j', header: 'Jobs', align: 'r', render: s => s.jobs },
                            { key: 'a', header: 'Average price', align: 'r', render: s => `${fmt(s.revenue / s.jobs)} QAR` },
                            { key: 'r', header: 'Revenue', align: 'r', render: s => `${fmt0(s.revenue)} QAR` },
                            { key: 'p', header: 'Share', align: 'r', render: s => `${revenue ? Math.round((s.revenue / revenue) * 100) : 0}%` },
                        ]} />
                    </Panel>
                </>
            )}

            {tab === 'profit' && (
                <>
                    <div className="kpis">
                        <Kpi label="Revenue" value={fmt0(revenue)} unit="QAR" />
                        <Kpi label="Expenses" value={fmt0(spent)} unit="QAR" />
                        <Kpi label="Net profit" value={fmt0(revenue - spent)} unit="QAR" tone={revenue - spent < 0 ? 'bad' : 'good'} />
                        <Kpi label="Margin" value={revenue ? Math.round(((revenue - spent) / revenue) * 100) : 0} unit="%" />
                    </div>
                    <Panel title="Revenue against expenses" subtitle="Month by month">{chart([{ k: 'revenue', name: 'Revenue', color: '#0066cc' }, { k: 'expenses', name: 'Expenses', color: '#a1a1a6' }])}</Panel>
                    <Panel title="Monthly profit and loss" actions={<button className="btn btn-secondary btn-sm" onClick={() => downloadCsv('profit-by-month.csv', months.map(m => ({ Month: m.month, Revenue: m.revenue, Expenses: m.expenses, Profit: m.profit })))}>Export CSV</button>}>
                        <Table rows={months.map(m => ({ ...m, id: m.month }))} cols={[
                            { key: 'm', header: 'Month', render: m => format(parseISO(`${m.month}-01`), 'MMMM yyyy') },
                            { key: 'r', header: 'Revenue', align: 'r', render: m => `${fmt0(m.revenue)} QAR` },
                            { key: 'e', header: 'Expenses', align: 'r', render: m => `${fmt0(m.expenses)} QAR` },
                            { key: 'p', header: 'Profit', align: 'r', render: m => <b className={m.profit < 0 ? 'tone-bad' : ''} style={{ fontWeight: 600 }}>{fmt0(m.profit)} QAR</b> },
                            { key: 'g', header: 'Margin', align: 'r', render: m => m.revenue ? `${Math.round((m.profit / m.revenue) * 100)}%` : '-' },
                        ]} />
                    </Panel>
                    <Panel title="Contribution per service" subtitle="Revenue minus the supplies logged on those jobs">
                        <Table rows={bySvc} empty="No completed jobs in this period." cols={[
                            { key: 'n', header: 'Service', render: s => s.name }, { key: 'r', header: 'Revenue', align: 'r', render: s => `${fmt0(s.revenue)} QAR` },
                            { key: 's', header: 'Supplies used', align: 'r', render: s => `${fmt0(s.supplies)} QAR` },
                            { key: 'c', header: 'Contribution', align: 'r', render: s => `${fmt0(s.revenue - s.supplies)} QAR` },
                        ]} />
                    </Panel>
                </>
            )}

            {tab === 'cleaners' && (
                <Panel title="Cleaner productivity" subtitle={PERIOD_LABEL[period]} actions={<button className="btn btn-secondary btn-sm" onClick={() => downloadCsv('cleaner-productivity.csv', byCleaner.map(c => ({ Cleaner: c.name, Jobs: c.jobs, Hours: c.hours.toFixed(1), Revenue: c.revenue, RevenuePerHour: c.perHour.toFixed(2) })))}>Export CSV</button>}>
                    <Table rows={byCleaner} empty="No staff yet." cols={[
                        { key: 'n', header: 'Cleaner', render: c => <b style={{ fontWeight: 600 }}>{c.name}</b> }, { key: 'j', header: 'Jobs', align: 'r', render: c => c.jobs },
                        { key: 'h', header: 'Hours worked', align: 'r', render: c => c.hours.toFixed(1) },
                        { key: 'r', header: 'Revenue', align: 'r', render: c => `${fmt0(c.revenue)} QAR` },
                        { key: 'p', header: 'Revenue per hour', align: 'r', render: c => c.perHour ? `${fmt0(c.perHour)} QAR` : '-' },
                    ]} />
                </Panel>
            )}

            {tab === 'clients' && (
                <>
                    <div className="kpis">
                        <Kpi label="Clients" value={clients.length} hint={`${newClients} new in period`} />
                        <Kpi label="Active in period" value={activeClients} />
                        <Kpi label="Repeat rate" value={buyers ? Math.round((repeat / buyers) * 100) : 0} unit="%" hint={`${repeat} of ${buyers} booked more than once`} />
                        <Kpi label="Dormant over 60 days" value={dormant.length} tone={dormant.length ? 'warn' : undefined} hint="Worth a win-back message" />
                    </div>
                    <div className="grid2e">
                        <Panel title="Top clients" actions={<button className="btn btn-secondary btn-sm" onClick={() => downloadCsv('clients.csv', clientRows.map(c => ({ Client: c.name, Jobs: c.jobs, Revenue: c.revenue, LastJob: c.last || '' })))}>Export CSV</button>}>
                            <Table rows={clientRows.slice(0, 10)} empty="No clients yet." cols={[
                                { key: 'n', header: 'Client', render: c => c.name }, { key: 'j', header: 'Jobs', align: 'r', render: c => c.jobs }, { key: 'r', header: 'Revenue', align: 'r', render: c => `${fmt0(c.revenue)} QAR` },
                            ]} />
                        </Panel>
                        <Panel title="Dormant clients" subtitle="No completed job for over 60 days">
                            <Table rows={dormant.slice(0, 10)} empty="No dormant clients." cols={[
                                { key: 'n', header: 'Client', render: c => c.name }, { key: 'l', header: 'Last job', render: c => c.last ? dayLabel(c.last) : '-' }, { key: 'd', header: 'Days ago', align: 'r', render: c => c.daysSince },
                            ]} />
                        </Panel>
                    </div>
                </>
            )}

            {tab === 'cancellations' && (
                <>
                    <div className="kpis">
                        <Kpi label="Cancelled jobs" value={cancelled.length} tone={cancelled.length ? 'warn' : undefined} />
                        <Kpi label="Cancellation rate" value={totalBookings ? ((cancelled.length / totalBookings) * 100).toFixed(1) : 0} unit="%" />
                        <Kpi label="Revenue lost" value={fmt0(lost)} unit="QAR" />
                    </div>
                    <Panel title="Cancelled bookings" actions={<button className="btn btn-secondary btn-sm" onClick={() => downloadCsv('cancellations.csv', cancelled.map(b => ({ Date: b.date, Client: db.clients.find(c => c.id === b.clientId)?.name || '', Service: svcName(b.serviceId), Price: b.price })))}>Export CSV</button>}>
                        {cancelled.length === 0 ? <Empty>No cancellations in this period.</Empty> : (
                            <Table rows={cancelled.sort((a, b) => b.date.localeCompare(a.date))} cols={[
                                { key: 'd', header: 'Date', render: b => dayLabel(b.date) }, { key: 'c', header: 'Client', render: b => db.clients.find(c => c.id === b.clientId)?.name || 'Guest' },
                                { key: 's', header: 'Service', render: b => svcName(b.serviceId) }, { key: 'p', header: 'Value', align: 'r', render: b => `${fmt(b.price)} QAR` },
                            ]} />
                        )}
                    </Panel>
                </>
            )}
            <div className="tiny">Generated {dayLabel(today())}. Revenue counts completed jobs; expenses include payroll marked as paid.</div>
        </div>
    );
};
