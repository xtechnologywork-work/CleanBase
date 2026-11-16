import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { addDays, endOfMonth, format, subMonths } from 'date-fns';
import { downloadCsv, fmt0, useDB } from '../../services/erp';
import { buildTenants, platformTotals, PLAN_LABEL } from '../../services/platform';
import { SELLABLE } from '../../services/plans';
import { Empty, Kpi, PageHeader, Panel, Pill, Table, Tabs } from '../../components/shared/ui';

type Tab = 'growth' | 'revenue' | 'usage';

export const SuperAdminAnalytics: React.FC = () => {
    const db = useDB();
    const tenants = useMemo(() => buildTenants(db), [db]);
    const totals = platformTotals(tenants, db);
    const [tab, setTab] = useState<Tab>('growth');

    const months = useMemo(() => Array.from({ length: 12 }, (_, i) => {
        const d = subMonths(new Date(), 11 - i);
        const from = format(d, 'yyyy-MM-01'), to = format(endOfMonth(d), 'yyyy-MM-dd');
        const done = db.bookings.filter(b => b.status === 'completed' && b.date >= from && b.date <= to);
        return {
            name: format(d, 'MMM yy'),
            signups: tenants.filter(t => t.company.createdAt.slice(0, 10) >= from && t.company.createdAt.slice(0, 10) <= to).length,
            collected: (db.platformPayments || []).filter(p => p.date >= from && p.date <= to).reduce((s, p) => s + p.amount, 0),
            gmv: done.reduce((s, b) => s + b.price, 0),
            jobs: done.length,
        };
    }), [tenants, db.bookings, db.platformPayments]);

    const approved = tenants.filter(t => t.state === 'active' || t.state === 'suspended');
    const withStaff = approved.filter(t => t.usage.staff > 0);
    const withJobs = approved.filter(t => t.usage.bookings > 0);
    const cutoff = format(addDays(new Date(), -30), 'yyyy-MM-dd');
    const activeRecent = approved.filter(t => t.usage.lastActivity && t.usage.lastActivity.slice(0, 10) >= cutoff);
    const funnel = [
        { label: 'Registered', n: tenants.length }, { label: 'Approved', n: approved.length }, { label: 'Added cleaners', n: withStaff.length },
        { label: 'Took bookings', n: withJobs.length }, { label: 'Active in last 30 days', n: activeRecent.length },
    ];
    const top = [...tenants].filter(t => t.state === 'active').sort((a, b) => b.usage.revenue30d - a.usage.revenue30d).slice(0, 10);
    const atRisk = tenants.filter(t => t.state === 'active' && t.usage.jobs30d === 0);
    const mix = (Object.keys(PLAN_LABEL) as (keyof typeof PLAN_LABEL)[]).map(p => ({ p, list: tenants.filter(t => t.state === 'active' && t.plan === p) })).filter(m => SELLABLE.includes(m.p) || m.list.length > 0);
    const tip = { borderRadius: 10, border: 'none', fontSize: 12, boxShadow: 'var(--shadow-lg)' };

    const chart = (keys: { k: string; name: string; color: string }[], money = true) => (
        <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={months} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ededf0" />
                    <XAxis dataKey="name" stroke="#86868b" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#86868b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip formatter={v => money ? `${fmt0(Number(v))} QAR` : String(v)} contentStyle={tip} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    {keys.map(k => <Bar key={k.k} dataKey={k.k} name={k.name} fill={k.color} radius={[6, 6, 0, 0]} />)}
                </BarChart>
            </ResponsiveContainer>
        </div>
    );

    return (
        <div className="pg">
            <PageHeader title="Analytics" subtitle="Growth, income and how customers actually use CleanBase. All numbers come from your real data." />
            <Tabs value={tab} onChange={setTab} tabs={[{ id: 'growth', label: 'Growth' }, { id: 'revenue', label: 'Revenue' }, { id: 'usage', label: 'Usage' }]} />

            {tab === 'growth' && (
                <>
                    <div className="kpis">
                        <Kpi label="Registered" value={tenants.length} />
                        <Kpi label="Approval rate" value={tenants.length ? Math.round((approved.length / tenants.length) * 100) : 0} unit="%" hint={`${approved.length} approved`} />
                        <Kpi label="Activation rate" value={approved.length ? Math.round((withJobs.length / approved.length) * 100) : 0} unit="%" hint="Approved tenants that took a booking" />
                        <Kpi label="Suspended" value={totals.suspended} tone={totals.suspended ? 'warn' : undefined} />
                    </div>
                    <div className="grid2e">
                        <Panel title="From sign-up to active use" subtitle="Where new customers drop off">
                            {funnel.map((f, i) => (
                                <div key={f.label} style={{ marginBottom: 14 }}>
                                    <div className="row" style={{ padding: 0, border: 0, marginBottom: 4 }}>
                                        <span>{f.label}</span><span className="muted">{f.n}{i > 0 && funnel[i - 1].n ? ` · ${Math.round((f.n / funnel[i - 1].n) * 100)}% of previous` : ''}</span>
                                    </div>
                                    <div className="bar"><i style={{ width: `${funnel[0].n ? (f.n / funnel[0].n) * 100 : 0}%` }} /></div>
                                </div>
                            ))}
                        </Panel>
                        <Panel title="New tenants per month">{chart([{ k: 'signups', name: 'New tenants', color: '#0066cc' }], false)}</Panel>
                    </div>
                </>
            )}

            {tab === 'revenue' && (
                <>
                    <div className="kpis">
                        <Kpi label="MRR" value={fmt0(totals.mrr)} unit="QAR" />
                        <Kpi label="ARR" value={fmt0(totals.arr)} unit="QAR" />
                        <Kpi label="Collected this month" value={fmt0(totals.collectedMonth)} unit="QAR" tone="good" />
                        <Kpi label="Average per tenant" value={fmt0(totals.active ? totals.mrr / totals.active : 0)} unit="QAR / month" />
                    </div>
                    <Panel title="Income collected per month" subtitle="Payments you recorded under Billing">{chart([{ k: 'collected', name: 'Collected', color: '#248a3d' }])}</Panel>
                    <Panel title="Plan mix">
                        <Table rows={mix.map(m => ({ id: m.p, ...m }))} cols={[
                            { key: 'p', header: 'Plan', render: m => PLAN_LABEL[m.p] }, { key: 'c', header: 'Active tenants', align: 'r', render: m => m.list.length },
                            { key: 'm', header: 'MRR', align: 'r', render: m => `${fmt0(m.list.reduce((s, t) => s + t.mrr, 0))} QAR` },
                            { key: 's', header: 'Share', align: 'r', render: m => `${totals.mrr ? Math.round((m.list.reduce((s, t) => s + t.mrr, 0) / totals.mrr) * 100) : 0}%` },
                        ]} />
                    </Panel>
                </>
            )}

            {tab === 'usage' && (
                <>
                    <div className="kpis">
                        <Kpi label="Tenant revenue, 30 days" value={fmt0(totals.gmv30d)} unit="QAR" hint="Completed jobs, all tenants" />
                        <Kpi label="Jobs, 30 days" value={totals.jobs30d} />
                        <Kpi label="Cleaners" value={totals.staff} />
                        <Kpi label="Tenants with no jobs, 30 days" value={atRisk.length} tone={atRisk.length ? 'warn' : undefined} />
                    </div>
                    <Panel title="Tenant revenue per month" subtitle="Value of completed jobs across all tenants">{chart([{ k: 'gmv', name: 'Completed jobs value', color: '#0066cc' }])}</Panel>
                    <div className="grid2e">
                        <Panel title="Top tenants, last 30 days" actions={<button className="btn btn-secondary btn-sm" onClick={() => downloadCsv('top-tenants.csv', top.map(t => ({ Company: t.company.name, Plan: PLAN_LABEL[t.plan], Jobs30d: t.usage.jobs30d, Revenue30d: t.usage.revenue30d })))}>Export CSV</button>}>
                            <Table rows={top.map(t => ({ id: t.company.id, t }))} empty="No active tenants yet." cols={[
                                { key: 'c', header: 'Company', render: ({ t }) => t.company.name }, { key: 'j', header: 'Jobs', align: 'r', render: ({ t }) => t.usage.jobs30d },
                                { key: 'r', header: 'Revenue', align: 'r', render: ({ t }) => `${fmt0(t.usage.revenue30d)} QAR` },
                            ]} />
                        </Panel>
                        <Panel title="At risk" subtitle="Active tenants with no completed job in 30 days">
                            {atRisk.length === 0 ? <Empty>Every active tenant completed a job recently.</Empty> : atRisk.slice(0, 10).map(t => (
                                <div className="row" key={t.company.id}><span>{t.company.name}<div className="sub">{t.owner?.email}</div></span><Pill tone="warn">{t.usage.bookings} bookings ever</Pill></div>
                            ))}
                        </Panel>
                    </div>
                </>
            )}
        </div>
    );
};
