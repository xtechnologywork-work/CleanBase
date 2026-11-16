import React, { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { addDays, addMonths, differenceInDays, endOfMonth, format, getDay, parseISO, startOfMonth } from 'date-fns';
import {
    cashIn, downloadCsv, expensesIn, fmt, fmt0, inRange, invoicePaid, invoiceState, invoiceTotal, LEAD_STAGES, outstanding, pctChange,
    PERIOD_LABEL, rangeFor, revenueIn, staffName, today, useCollection, useDB,
} from '../services/erp';
import type { Period } from '../services/erp';
import { Empty, Kpi, PageHeader, Panel, Table, Tabs } from '../components/shared/ui';

interface Bucket { label: string; from: string; to: string }

/** Split the period into days (up to 30 days), weeks (90 days) or months (this year). */
function bucketsFor(period: Period, from: string, to: string): Bucket[] {
    const out: Bucket[] = [];
    const end = parseISO(to);
    if (period === 'ytd') {
        for (let d = startOfMonth(parseISO(from)); d <= end; d = addMonths(d, 1)) {
            const last = format(endOfMonth(d), 'yyyy-MM-dd');
            out.push({ label: format(d, 'MMM'), from: format(d, 'yyyy-MM-dd'), to: last > to ? to : last });
        }
    } else if (period === '90d') {
        for (let d = parseISO(from); d <= end; d = addDays(d, 7)) {
            const last = format(addDays(d, 6), 'yyyy-MM-dd');
            out.push({ label: format(d, 'd MMM'), from: format(d, 'yyyy-MM-dd'), to: last > to ? to : last });
        }
    } else {
        for (let d = parseISO(from); d <= end; d = addDays(d, 1)) {
            const s = format(d, 'yyyy-MM-dd');
            out.push({ label: format(d, 'd MMM'), from: s, to: s });
        }
    }
    return out;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const BLUE = '#0066cc', GREY = '#a1a1a6', GREEN = '#248a3d';

const Meter: React.FC<{ pct: number; color?: string }> = ({ pct, color = BLUE }) => (
    <div style={{ height: 8, background: 'var(--color-bg-body)', borderRadius: 99, overflow: 'hidden' }} aria-hidden="true">
        <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: color, borderRadius: 99 }} />
    </div>
);

export const AnalyticsPage: React.FC = () => {
    const { user } = useAuth();
    const companyId = user?.companyId || '';
    const db = useDB();
    const { items: expenses } = useCollection('expenses', companyId);
    const { items: payments } = useCollection('payments', companyId);
    const { items: invoices } = useCollection('invoices', companyId);
    const { items: leads } = useCollection('leads', companyId);
    const { items: complaints } = useCollection('complaints', companyId);
    const [period, setPeriod] = useState<Period>('30d');

    const r = rangeFor(period);
    const bookings = db.bookings.filter(b => b.companyId === companyId);
    const clients = db.clients.filter(c => c.companyId === companyId);
    const reviews = db.reviews.filter(x => x.companyId === companyId);
    const svcName = (id: string) => db.services.find(s => s.id === id)?.name || 'Service';

    const done = bookings.filter(b => b.status === 'completed' && inRange(b.date, r.from, r.to));
    const cancelled = bookings.filter(b => b.status === 'cancelled' && inRange(b.date, r.from, r.to));
    const inPeriod = bookings.filter(b => inRange(b.date, r.from, r.to));
    const prevDone = bookings.filter(b => b.status === 'completed' && inRange(b.date, r.prevFrom, r.prevTo));
    const prevCancelled = bookings.filter(b => b.status === 'cancelled' && inRange(b.date, r.prevFrom, r.prevTo));
    const prevTotal = bookings.filter(b => inRange(b.date, r.prevFrom, r.prevTo)).length;

    const revenue = revenueIn(db, companyId, r.from, r.to), prevRevenue = revenueIn(db, companyId, r.prevFrom, r.prevTo);
    const cash = cashIn(db, companyId, r.from, r.to), prevCash = cashIn(db, companyId, r.prevFrom, r.prevTo);
    const spent = expensesIn(companyId, r.from, r.to), prevSpent = expensesIn(companyId, r.prevFrom, r.prevTo);
    const profit = revenue - spent, prevProfit = prevRevenue - prevSpent;
    const ticket = done.length ? revenue / done.length : 0;
    const prevTicket = prevDone.length ? prevRevenue / prevDone.length : 0;
    const cancelRate = inPeriod.length ? (cancelled.length / inPeriod.length) * 100 : 0;
    const prevCancelRate = prevTotal ? (prevCancelled.length / prevTotal) * 100 : 0;

    const delta = (cur: number, prev: number) => {
        if (prev === 0) return cur === 0 ? 'Same as the period before' : 'Nothing earlier to compare with';
        const p = Math.round(pctChange(cur, prev));
        return `${p >= 0 ? 'Up' : 'Down'} ${Math.abs(p)}% on the period before`;
    };

    const series = useMemo(() => bucketsFor(period, r.from, r.to).map(b => {
        const rev = revenueIn(db, companyId, b.from, b.to), exp = expensesIn(companyId, b.from, b.to);
        return { name: b.label, revenue: rev, expenses: exp, profit: rev - exp, jobs: db.bookings.filter(x => x.companyId === companyId && x.status === 'completed' && inRange(x.date, b.from, b.to)).length };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [db, companyId, period, r.from, r.to, expenses.length]);
    const hasMoney = series.some(s => s.revenue > 0 || s.expenses > 0);

    // Demand: busiest weekday and hour, from all jobs that were not cancelled
    const heat = useMemo(() => {
        const grid: Record<number, Record<number, number>> = {};
        let min = 24, max = -1, top = { n: 0, day: 0, hour: 0 };
        inPeriod.filter(b => b.status !== 'cancelled').forEach(b => {
            const h = parseInt((b.time || '').slice(0, 2), 10);
            if (Number.isNaN(h)) return;
            const d = (getDay(parseISO(b.date)) + 6) % 7;
            grid[d] ||= {}; grid[d][h] = (grid[d][h] || 0) + 1;
            min = Math.min(min, h); max = Math.max(max, h);
            if (grid[d][h] > top.n) top = { n: grid[d][h], day: d, hour: h };
        });
        return { grid, min, max, top, any: max >= 0 };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookings.length, r.from, r.to, db.bookings]);
    const hours = heat.any ? Array.from({ length: heat.max - heat.min + 1 }, (_, i) => heat.min + i) : [];

    // Services
    const bySvc = Object.values(done.reduce<Record<string, { id: string; name: string; jobs: number; revenue: number }>>((a, b) => {
        a[b.serviceId] ||= { id: b.serviceId, name: svcName(b.serviceId), jobs: 0, revenue: 0 };
        a[b.serviceId].jobs++; a[b.serviceId].revenue += b.price;
        return a;
    }, {})).sort((x, y) => y.revenue - x.revenue);

    // Clients
    const firstDone: Record<string, string> = {};
    bookings.filter(b => b.status === 'completed').forEach(b => { if (!firstDone[b.clientId] || b.date < firstDone[b.clientId]) firstDone[b.clientId] = b.date; });
    const activeIds = [...new Set(done.map(b => b.clientId))];
    const newIds = activeIds.filter(id => firstDone[id] >= r.from);
    const jobsPerClient = bookings.filter(b => b.status === 'completed').reduce<Record<string, number>>((a, b) => { a[b.clientId] = (a[b.clientId] || 0) + 1; return a; }, {});
    const buyers = Object.keys(jobsPerClient).length;
    const repeatRate = buyers ? Math.round((Object.values(jobsPerClient).filter(n => n > 1).length / buyers) * 100) : 0;
    const invClient = new Map(invoices.map(i => [i.id, i.clientId]));
    const paidBy: Record<string, number> = {};
    payments.forEach(p => {
        const cid = p.clientId || (p.invoiceId ? invClient.get(p.invoiceId) : undefined);
        if (cid) paidBy[cid] = (paidBy[cid] || 0) + (p.kind === 'refund' ? -p.amount : p.amount);
    });
    const topClients = clients.map(c => ({ id: c.id, name: c.name, jobs: jobsPerClient[c.id] || 0, paid: paidBy[c.id] || 0 }))
        .filter(c => c.paid > 0).sort((a, b) => b.paid - a.paid).slice(0, 5);

    // Cleaners
    const ratingOf = (id: string) => { const rs = reviews.filter(x => x.cleanerId === id); return rs.length ? rs.reduce((s, x) => s + x.rating, 0) / rs.length : null; };
    const byCleaner = db.staff.filter(s => s.companyId === companyId).map(s => {
        const jobs = done.filter(b => b.cleanerId === s.id);
        return { id: s.id, name: staffName(db, s.id), jobs: jobs.length, revenue: jobs.reduce((a, b) => a + b.price, 0), rating: ratingOf(s.id) };
    }).filter(c => c.jobs > 0).sort((a, b) => b.revenue - a.revenue);

    // Sales
    const stageCount = LEAD_STAGES.map(st => ({ id: st, n: leads.filter(l => l.stage === st).length, value: leads.filter(l => l.stage === st).reduce((s, l) => s + l.value, 0) }));
    const won = stageCount.find(s => s.id === 'won')!, lost = stageCount.find(s => s.id === 'lost')!;
    const winRate = won.n + lost.n ? Math.round((won.n / (won.n + lost.n)) * 100) : null;
    const openValue = stageCount.filter(s => ['new', 'contacted', 'quoted'].includes(s.id)).reduce((s, x) => s + x.value, 0);
    const maxStage = Math.max(1, ...stageCount.map(s => s.n));

    // Quality
    const periodReviews = reviews.filter(x => inRange(x.createdAt.slice(0, 10), r.from, r.to));
    const avgRating = periodReviews.length ? periodReviews.reduce((s, x) => s + x.rating, 0) / periodReviews.length : 0;
    const newComplaints = complaints.filter(c => inRange(c.createdAt.slice(0, 10), r.from, r.to));

    // Money still to collect
    const owed = outstanding(db, companyId);
    const aging = [{ label: 'Not due yet', n: 0, sum: 0 }, { label: '1 to 30 days late', n: 0, sum: 0 }, { label: '31 to 60 days late', n: 0, sum: 0 }, { label: 'Over 60 days late', n: 0, sum: 0 }];
    invoices.forEach(inv => {
        const st = invoiceState(inv, payments);
        if (st === 'draft' || st === 'cancelled' || st === 'paid') return;
        const bal = invoiceTotal(inv) - invoicePaid(inv, payments);
        const late = differenceInDays(parseISO(today()), parseISO(inv.dueDate));
        const i = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : 3;
        aging[i].n++; aging[i].sum += bal;
    });
    const agingMax = Math.max(1, ...aging.map(a => a.sum));

    const empty = bookings.length === 0 && expenses.length === 0 && payments.length === 0;

    return (
        <div className="pg">
            <PageHeader title="Analytics" subtitle="How the business is doing, compared with the period before. Every number comes from your own records.">
                <Tabs value={period} onChange={setPeriod} tabs={(['7d', '30d', '90d', 'ytd'] as Period[]).map(p => ({ id: p, label: p === 'ytd' ? 'Year' : p }))} />
                <button className="btn btn-secondary btn-sm" disabled={!hasMoney} onClick={() => downloadCsv(`analytics-${period}.csv`, series.map(s => ({ Period: s.name, Revenue: s.revenue, Expenses: s.expenses, Profit: s.profit, Jobs: s.jobs })))}>Export CSV</button>
            </PageHeader>

            {empty ? (
                <Panel><Empty>Nothing to analyse yet. Once you add bookings, payments and expenses, your numbers and trends appear here.</Empty></Panel>
            ) : (
                <>
                    <div className="kpis">
                        <Kpi label={`Revenue, ${PERIOD_LABEL[period]}`} value={fmt0(revenue)} unit="QAR" hint={delta(revenue, prevRevenue)} />
                        <Kpi label="Cash collected" value={fmt0(cash)} unit="QAR" hint={delta(cash, prevCash)} />
                        <Kpi label="Expenses" value={fmt0(spent)} unit="QAR" hint={delta(spent, prevSpent)} />
                        <Kpi label="Net profit" value={fmt0(profit)} unit="QAR" tone={profit < 0 ? 'bad' : undefined} hint={revenue ? `${Math.round((profit / revenue) * 100)}% margin. ${delta(profit, prevProfit)}` : delta(profit, prevProfit)} />
                    </div>
                    <div className="kpis">
                        <Kpi label="Completed jobs" value={done.length} hint={delta(done.length, prevDone.length)} />
                        <Kpi label="Average job value" value={fmt(ticket, 0)} unit="QAR" hint={delta(ticket, prevTicket)} />
                        <Kpi label="Cancellation rate" value={fmt(cancelRate, 1)} unit="%" tone={cancelRate > 15 ? 'warn' : undefined} hint={`${cancelled.length} of ${inPeriod.length} jobs. ${delta(cancelRate, prevCancelRate)}`} />
                        <Kpi label="Still to collect" value={fmt0(owed.total)} unit="QAR" tone={owed.overdue > 0 ? 'warn' : undefined} hint={owed.overdue > 0 ? `${fmt0(owed.overdue)} QAR is overdue` : 'Nothing overdue'} />
                    </div>

                    <Panel title="Money in and out" subtitle={period === 'ytd' ? 'By month' : period === '90d' ? 'By week' : 'By day'}>
                        {!hasMoney ? <Empty>No revenue or expenses in this period.</Empty> : (
                            <div style={{ height: 300 }} role="img" aria-label="Revenue, expenses and profit over the period">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ededf0" />
                                        <XAxis dataKey="name" stroke="#86868b" fontSize={12} tickLine={false} axisLine={false} minTickGap={24} />
                                        <YAxis stroke="#86868b" fontSize={11} tickLine={false} axisLine={false} />
                                        <Tooltip formatter={v => `${fmt0(Number(v))} QAR`} contentStyle={{ borderRadius: 10, border: 'none', fontSize: 12, boxShadow: 'var(--shadow-lg)' }} />
                                        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                                        <Bar dataKey="revenue" name="Revenue" fill={BLUE} radius={[5, 5, 0, 0]} />
                                        <Bar dataKey="expenses" name="Expenses" fill={GREY} radius={[5, 5, 0, 0]} />
                                        <Line type="monotone" dataKey="profit" name="Profit" stroke={GREEN} strokeWidth={2} dot={false} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </Panel>

                    <Panel title="When your clients book" subtitle={heat.any ? `Busiest slot: ${DAYS[heat.top.day]} at ${String(heat.top.hour).padStart(2, '0')}:00 (${heat.top.n} jobs). Use it to plan your team.` : 'Jobs by weekday and start time'}>
                        {!heat.any ? <Empty>No bookings in this period.</Empty> : (
                            <div className="tbl-wrap">
                                <div style={{ display: 'grid', gridTemplateColumns: `44px repeat(${hours.length}, minmax(34px, 1fr))`, gap: 4, minWidth: 44 + hours.length * 38 }}>
                                    <span />
                                    {hours.map(h => <span key={h} className="tiny" style={{ textAlign: 'center' }}>{String(h).padStart(2, '0')}</span>)}
                                    {DAYS.map((d, di) => (
                                        <React.Fragment key={d}>
                                            <span className="tiny" style={{ alignSelf: 'center' }}>{d}</span>
                                            {hours.map(h => {
                                                const n = heat.grid[di]?.[h] || 0;
                                                return (
                                                    <span key={h} title={`${d} ${String(h).padStart(2, '0')}:00, ${n} job${n === 1 ? '' : 's'}`} aria-label={`${d} ${h}:00, ${n} jobs`}
                                                        style={{ height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600, background: n ? `rgba(0,102,204,${0.15 + 0.85 * (n / heat.top.n)})` : 'var(--color-bg-body)', color: n && n / heat.top.n > 0.5 ? '#fff' : 'var(--color-text-secondary)' }}>
                                                        {n || ''}
                                                    </span>
                                                );
                                            })}
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>
                        )}
                    </Panel>

                    <div className="grid2e">
                        <Panel title="Revenue by service" subtitle={PERIOD_LABEL[period]}>
                            {bySvc.length === 0 ? <Empty>No completed jobs in this period.</Empty> : (
                                <div className="stack">
                                    {bySvc.map(s => (
                                        <div key={s.id}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                                                <b style={{ fontWeight: 600 }}>{s.name}</b>
                                                <span className="tiny">{fmt0(s.revenue)} QAR · {s.jobs} job{s.jobs === 1 ? '' : 's'} · {revenue ? Math.round((s.revenue / revenue) * 100) : 0}%</span>
                                            </div>
                                            <Meter pct={revenue ? (s.revenue / revenue) * 100 : 0} />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Panel>
                        <Panel title="Clients" subtitle={PERIOD_LABEL[period]}>
                            <div className="kpis" style={{ marginBottom: 12 }}>
                                <Kpi label="Active" value={activeIds.length} />
                                <Kpi label="New" value={newIds.length} hint="First job in this period" />
                                <Kpi label="Returning" value={activeIds.length - newIds.length} />
                                <Kpi label="Repeat rate" value={repeatRate} unit="%" hint="Clients with 2+ jobs, all time" />
                            </div>
                            <Table rows={topClients} empty="No payments recorded yet, so there is no ranking."
                                cols={[
                                    { key: 'n', header: 'Top clients by money paid', render: c => <b style={{ fontWeight: 600 }}>{c.name}</b> },
                                    { key: 'j', header: 'Jobs', align: 'r', render: c => c.jobs },
                                    { key: 'p', header: 'Paid', align: 'r', render: c => `${fmt0(c.paid)} QAR` },
                                ]} />
                        </Panel>
                    </div>

                    <div className="grid2e">
                        <Panel title="Cleaners" subtitle={`Completed jobs, ${PERIOD_LABEL[period]}`}>
                            <Table rows={byCleaner} empty="No completed jobs assigned to a cleaner in this period."
                                cols={[
                                    { key: 'n', header: 'Cleaner', render: c => <b style={{ fontWeight: 600 }}>{c.name}</b> },
                                    { key: 'j', header: 'Jobs', align: 'r', render: c => c.jobs },
                                    { key: 'r', header: 'Revenue', align: 'r', render: c => `${fmt0(c.revenue)} QAR` },
                                    { key: 's', header: 'Rating', align: 'r', render: c => c.rating === null ? <span className="tiny">No reviews</span> : `${c.rating.toFixed(1)} / 5` },
                                ]} />
                        </Panel>
                        <Panel title="Quality" subtitle={PERIOD_LABEL[period]}>
                            <div className="kpis">
                                <Kpi label="Average rating" value={periodReviews.length ? avgRating.toFixed(1) : 'No reviews'} unit={periodReviews.length ? '/ 5' : undefined} hint={`${periodReviews.length} published review${periodReviews.length === 1 ? '' : 's'}`} />
                                <Kpi label="New complaints" value={newComplaints.length} tone={newComplaints.some(c => c.severity === 'high') ? 'bad' : undefined} hint={`${complaints.filter(c => c.status !== 'resolved').length} still open`} />
                            </div>
                        </Panel>
                    </div>

                    <div className="grid2e">
                        <Panel title="Sales pipeline" subtitle="All leads in your pipeline">
                            {leads.length === 0 ? <Empty>No leads yet. Add them under Leads and quotes.</Empty> : (
                                <div className="stack">
                                    {stageCount.map(s => (
                                        <div key={s.id}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                                <b style={{ fontWeight: 600, textTransform: 'capitalize' }}>{s.id}</b>
                                                <span className="tiny">{s.n} lead{s.n === 1 ? '' : 's'}{s.value ? ` · ${fmt0(s.value)} QAR` : ''}</span>
                                            </div>
                                            <Meter pct={(s.n / maxStage) * 100} color={s.id === 'won' ? GREEN : s.id === 'lost' ? GREY : BLUE} />
                                        </div>
                                    ))}
                                    <div className="tiny">{winRate === null ? 'No leads won or lost yet.' : `Win rate ${winRate}%. `}{openValue ? `${fmt0(openValue)} QAR still open in the pipeline.` : ''}</div>
                                </div>
                            )}
                        </Panel>
                        <Panel title="Money still to collect" subtitle="Unpaid invoices by how late they are">
                            <div className="stack">
                                {aging.map(a => (
                                    <div key={a.label}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                            <b style={{ fontWeight: 600 }}>{a.label}</b>
                                            <span className="tiny">{a.n} invoice{a.n === 1 ? '' : 's'} · {fmt0(a.sum)} QAR</span>
                                        </div>
                                        <Meter pct={(a.sum / agingMax) * 100} color={a.label === 'Not due yet' ? BLUE : '#d70015'} />
                                    </div>
                                ))}
                                <div className="tiny">{owed.uninvoicedCount ? `Also ${owed.uninvoicedCount} finished job${owed.uninvoicedCount === 1 ? '' : 's'} (${fmt0(owed.uninvoiced)} QAR) not invoiced yet.` : 'Every finished job has an invoice or is paid.'}</div>
                            </div>
                        </Panel>
                    </div>
                </>
            )}
        </div>
    );
};
