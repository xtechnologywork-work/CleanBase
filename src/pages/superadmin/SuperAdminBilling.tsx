import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { addDays, format } from 'date-fns';
import { dayLabel, downloadCsv, fmt0, today, useDB } from '../../services/erp';
import { buildTenants, deletePlatformPayment, platformTotals, PLAN_LABEL } from '../../services/platform';
import { Empty, Kpi, PageHeader, Panel, Pill, Table, Tabs } from '../../components/shared/ui';
import { PaymentModal } from '../../components/superadmin/PaymentModal';
import { LicensePill } from './SuperAdminTenants';

export const SuperAdminBilling: React.FC = () => {
    const db = useDB();
    const tenants = useMemo(() => buildTenants(db), [db]);
    const totals = platformTotals(tenants, db);
    const [tab, setTab] = useState<'renewals' | 'payments'>('renewals');
    const [paying, setPaying] = useState<string | null | undefined>(undefined);   // undefined = closed, null = open without a preset tenant

    const payers = tenants.filter(t => t.state === 'active' || t.state === 'suspended');
    const soon = format(addDays(new Date(), 30), 'yyyy-MM-dd');
    const dueNext30 = payers.filter(t => t.state === 'active' && t.licenseUntil && t.licenseUntil <= soon);
    const expected = dueNext30.reduce((s, t) => s + t.mrr, 0);
    const atRisk = payers.filter(t => t.state === 'active' && t.license === 'expired');
    const renewals = [...payers].sort((a, b) => (a.licenseUntil || '9999').localeCompare(b.licenseUntil || '9999'));
    const ledger = [...(db.platformPayments || [])].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    const nameOf = (id: string) => tenants.find(t => t.company.id === id)?.company.name || 'Deleted tenant';
    const methodTotals = (['bank', 'cash', 'card', 'other'] as const).map(m => ({ m, v: ledger.filter(p => p.method === m).reduce((s, p) => s + p.amount, 0) }));

    return (
        <div className="pg">
            <PageHeader title="Billing" subtitle="Subscription income from your tenants: who is paid up, who needs to renew, and a ledger of every payment you recorded.">
                <button className="btn btn-primary" onClick={() => setPaying(null)} disabled={!payers.length}><Plus size={15} /> Record payment</button>
            </PageHeader>

            <div className="kpis">
                <Kpi label="Monthly recurring revenue" value={fmt0(totals.mrr)} unit="QAR" hint={`${totals.active} paying tenants`} />
                <Kpi label="Collected this month" value={fmt0(totals.collectedMonth)} unit="QAR" tone="good" hint={`${format(new Date(), 'MMMM yyyy')}`} />
                <Kpi label="Renewals in 30 days" value={fmt0(expected)} unit="QAR" hint={`${dueNext30.length} licenses end soon`} />
                <Kpi label="Overdue" value={atRisk.length} tone={atRisk.length ? 'bad' : undefined} hint={atRisk.length ? `${fmt0(atRisk.reduce((s, t) => s + t.mrr, 0))} QAR a month at risk` : 'Everyone is current'} />
            </div>

            <Tabs value={tab} onChange={setTab} tabs={[{ id: 'renewals', label: 'Renewals' }, { id: 'payments', label: `Payments (${ledger.length})` }]} />

            {tab === 'renewals' ? (
                <Panel title="Licenses" subtitle="Sorted by the date each license ends. Recording a payment extends the date.">
                    <Table rows={renewals.map(t => ({ id: t.company.id, t }))} empty="No approved tenants yet." cols={[
                        { key: 'c', header: 'Company', render: ({ t }) => <div><b style={{ fontWeight: 600 }}>{t.company.name}</b><div className="tiny">{t.owner?.email}</div></div> },
                        { key: 'p', header: 'Plan', render: ({ t }) => `${PLAN_LABEL[t.plan]}, ${fmt0(t.mrr)} QAR` },
                        { key: 'e', header: 'License ends', render: ({ t }) => t.licenseUntil ? dayLabel(t.licenseUntil) : '-' },
                        { key: 'l', header: '', render: ({ t }) => <LicensePill t={t} /> },
                        { key: 'lp', header: 'Last payment', render: ({ t }) => t.lastPayment ? `${dayLabel(t.lastPayment.date)}, ${fmt0(t.lastPayment.amount)} QAR` : <span className="tiny">Never</span> },
                        { key: 's', header: 'Access', render: ({ t }) => <Pill tone={t.state === 'active' ? 'good' : 'bad'}>{t.state === 'active' ? 'Active' : 'Suspended'}</Pill> },
                        { key: 'a', header: '', align: 'r', render: ({ t }) => <button className="btn btn-secondary btn-sm" onClick={() => setPaying(t.company.id)}>Record payment</button> },
                    ]} />
                </Panel>
            ) : (
                <div className="stack">
                    <div className="kpis">{methodTotals.map(x => <Kpi key={x.m} label={x.m === 'bank' ? 'Bank transfer' : x.m.charAt(0).toUpperCase() + x.m.slice(1)} value={fmt0(x.v)} unit="QAR" />)}</div>
                    <Panel title="Payment ledger" actions={<button className="btn btn-secondary btn-sm" onClick={() => downloadCsv('platform-payments.csv', ledger.map(p => ({
                        Date: p.date, Tenant: nameOf(p.tenantId), Amount: p.amount, Method: p.method, Months: p.months, Reference: p.reference || '', Note: p.note || '',
                    })))}>Export CSV</button>}>
                        {ledger.length === 0 ? <Empty>No payments recorded yet. Use Record payment when a tenant pays you.</Empty> : (
                            <Table rows={ledger} cols={[
                                { key: 'd', header: 'Date', render: p => dayLabel(p.date) }, { key: 't', header: 'Tenant', render: p => nameOf(p.tenantId) },
                                { key: 'a', header: 'Amount', align: 'r', render: p => `${fmt0(p.amount)} QAR` }, { key: 'm', header: 'Method', render: p => p.method },
                                { key: 'mo', header: 'Months', align: 'r', render: p => p.months || '-' }, { key: 'r', header: 'Reference', render: p => p.reference || '-' },
                                { key: 'x', header: '', align: 'r', render: p => <button className="btn btn-ghost btn-sm" onClick={() => { if (confirm('Delete this payment record? The license date is not changed.')) deletePlatformPayment(p.id); }}>Delete</button> },
                            ]} />
                        )}
                    </Panel>
                </div>
            )}
            <PaymentModal open={paying !== undefined} onClose={() => setPaying(undefined)} tenants={payers} tenantId={paying || undefined} />
            <div className="tiny">Today is {dayLabel(today())}. Amounts are what you recorded by hand: nothing here connects to a payment gateway.</div>
        </div>
    );
};
