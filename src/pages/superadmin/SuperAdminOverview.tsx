import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { addDays, endOfMonth, format, parseISO, subMonths } from 'date-fns';
import { Banknote, Building2, Hourglass, TrendingUp } from 'lucide-react';
import { fmt0, useDB } from '../../services/erp';
import { approveTenant, buildTenants, platformTotals, PLAN_LABEL } from '../../services/platform';
import type { Plan } from '../../services/platform';
import { SELLABLE } from '../../services/plans';
import { Empty, Kpi, PageHeader, Panel, Pill } from '../../components/shared/ui';

const TYPE_TONE = { security: 'info', success: 'good', warning: 'warn', info: undefined } as const;

export const SuperAdminOverview: React.FC = () => {
    const navigate = useNavigate();
    const db = useDB();
    const tenants = useMemo(() => buildTenants(db), [db]);
    const totals = platformTotals(tenants, db);

    const months = useMemo(() => Array.from({ length: 6 }, (_, i) => {
        const d = subMonths(new Date(), 5 - i);
        const from = format(d, 'yyyy-MM-01'), to = format(endOfMonth(d), 'yyyy-MM-dd');
        return {
            name: format(d, 'MMM'),
            signups: tenants.filter(t => t.company.createdAt.slice(0, 10) >= from && t.company.createdAt.slice(0, 10) <= to).length,
            collected: (db.platformPayments || []).filter(p => p.date >= from && p.date <= to).reduce((s, p) => s + p.amount, 0),
        };
    }), [tenants, db.platformPayments]);

    const cutoff = format(addDays(new Date(), -30), 'yyyy-MM-dd');
    const pending = tenants.filter(t => t.state === 'pending');
    const expiring = tenants.filter(t => t.state === 'active' && (t.license === 'soon' || t.license === 'expired'));
    const quiet = tenants.filter(t => t.state === 'active' && t.company.createdAt.slice(0, 10) < cutoff && (!t.usage.lastActivity || t.usage.lastActivity.slice(0, 10) < cutoff));
    const noOwner = tenants.filter(t => t.state === 'no-owner');
    const planMix = (Object.keys(PLAN_LABEL) as Plan[]).map(p => {
        const list = tenants.filter(t => t.state === 'active' && t.plan === p);
        return { p, count: list.length, mrr: list.reduce((s, t) => s + t.mrr, 0) };
    }).filter(x => SELLABLE.includes(x.p) || x.count > 0);   // old plans only while someone is still on them
    const logs = (db.auditLogs || []).slice(0, 8);

    return (
        <div className="pg">
            <PageHeader title="Platform overview" subtitle="How CleanBase is doing as a business: customers, recurring revenue, and what needs your decision today." />

            <div className="kpis">
                <Kpi label="Active tenants" icon={<Building2 size={16} />} value={totals.active} hint={`${totals.total} registered in total`} />
                <Kpi label="Monthly recurring revenue" icon={<TrendingUp size={16} />} value={fmt0(totals.mrr)} unit="QAR" hint={`${fmt0(totals.arr)} QAR a year`} />
                <Kpi label="Collected this month" icon={<Banknote size={16} />} value={fmt0(totals.collectedMonth)} unit="QAR" tone="good" hint="Payments you recorded" />
                <Kpi label="Waiting for approval" icon={<Hourglass size={16} />} value={totals.pending} tone={totals.pending ? 'warn' : undefined} hint={totals.pending ? 'Waiting for your decision' : 'Nobody waiting'} />
            </div>
            <div className="kpis">
                <Kpi label="Tenant revenue, 30 days" value={fmt0(totals.gmv30d)} unit="QAR" hint="Completed jobs across all tenants" />
                <Kpi label="Jobs completed, 30 days" value={totals.jobs30d} />
                <Kpi label="Cleaners on the platform" value={totals.staff} />
                <Kpi label="Licenses to renew" value={totals.expired + totals.expiring} tone={totals.expired ? 'bad' : totals.expiring ? 'warn' : undefined} hint={`${totals.expired} expired, ${totals.expiring} within 7 days`} />
            </div>

            <div className="grid2">
                <Panel title="Needs your decision" subtitle="Approve new companies and chase renewals">
                    {pending.length + expiring.length + quiet.length + noOwner.length === 0 ? <Empty>All clear. Nothing needs a decision.</Empty> : (
                        <div className="stack" style={{ gap: '0.5rem' }}>
                            {pending.map(t => (
                                <div className="attn" key={t.company.id} style={{ cursor: 'default' }}>
                                    <span><b>{t.company.name || 'Unnamed company'}</b> wants access<div className="tiny">{t.owner?.email} · {PLAN_LABEL[t.plan]}</div></span>
                                    <span style={{ display: 'flex', gap: 6 }}>
                                        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/admin/tenants')}>Review</button>
                                        <button className="btn btn-primary btn-sm" onClick={() => { approveTenant(t.company.id); }}>Approve</button>
                                    </span>
                                </div>
                            ))}
                            {expiring.map(t => (
                                <button className="attn" key={t.company.id} onClick={() => navigate('/admin/billing')}>
                                    <span><b>{t.company.name}</b> license {t.license === 'expired' ? 'has expired' : 'ends soon'}<div className="tiny">{t.licenseUntil}</div></span>
                                    <Pill tone={t.license === 'expired' ? 'bad' : 'warn'}>{t.license === 'expired' ? 'Expired' : `${t.daysLeft} days`}</Pill>
                                </button>
                            ))}
                            {quiet.map(t => (
                                <button className="attn" key={t.company.id} onClick={() => navigate('/admin/tenants')}>
                                    <span><b>{t.company.name}</b> has had no activity for 30 days<div className="tiny">Worth a check-in before they cancel</div></span><Pill>Quiet</Pill>
                                </button>
                            ))}
                            {noOwner.map(t => (
                                <button className="attn" key={t.company.id} onClick={() => navigate('/admin/tenants')}>
                                    <span><b>{t.company.name || t.company.id}</b> has no owner account</span><Pill tone="bad">No owner</Pill>
                                </button>
                            ))}
                        </div>
                    )}
                </Panel>

                <Panel title="Revenue by plan" subtitle="Active tenants only">
                    {planMix.map(x => (
                        <div key={x.p} style={{ marginBottom: 14 }}>
                            <div className="row" style={{ padding: 0, border: 0, marginBottom: 4 }}><span>{PLAN_LABEL[x.p]}</span><span className="muted">{x.count} {x.count === 1 ? 'tenant' : 'tenants'} · {fmt0(x.mrr)} QAR</span></div>
                            <div className="bar"><i style={{ width: `${totals.mrr ? (x.mrr / totals.mrr) * 100 : 0}%` }} /></div>
                        </div>
                    ))}
                </Panel>
            </div>

            <div className="grid2e">
                <Panel title="New tenants" subtitle="Companies that signed up, last six months">
                    <div style={{ height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={months} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ededf0" />
                                <XAxis dataKey="name" stroke="#86868b" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#86868b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                                <Tooltip contentStyle={{ borderRadius: 10, border: 'none', fontSize: 12, boxShadow: 'var(--shadow-lg)' }} />
                                <Bar dataKey="signups" name="New tenants" fill="#0066cc" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Panel>
                <Panel title="Income collected" subtitle="Payments you recorded, last six months">
                    <div style={{ height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={months} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ededf0" />
                                <XAxis dataKey="name" stroke="#86868b" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#86868b" fontSize={11} tickLine={false} axisLine={false} />
                                <Tooltip formatter={v => `${fmt0(Number(v))} QAR`} contentStyle={{ borderRadius: 10, border: 'none', fontSize: 12, boxShadow: 'var(--shadow-lg)' }} />
                                <Bar dataKey="collected" name="Collected" fill="#248a3d" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Panel>
            </div>

            <Panel title="Recent activity" actions={<button className="btn btn-secondary btn-sm" onClick={() => navigate('/admin/audit-logs')}>Open audit log</button>}>
                {logs.length === 0 ? <Empty>No activity yet. Approvals, plan changes and payments are logged here.</Empty> : logs.map(l => (
                    <div className="row" key={l.id}>
                        <div><b style={{ fontWeight: 600 }}>{l.actor}</b> <span className="muted">{l.action.charAt(0).toLowerCase() + l.action.slice(1)}</span></div>
                        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Pill tone={TYPE_TONE[l.type]}>{l.type}</Pill><span className="tiny">{format(parseISO(l.timestamp), 'd MMM, HH:mm')}</span></span>
                    </div>
                ))}
            </Panel>
        </div>
    );
};
