import React, { useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { getDB } from '../services/mockDb';
import {
    addItem, dayLabel, fmt, fmt0, logActivity, mutateDB, nextNumber, removeItem, staffName, updateItem, useCollection, useDB,
} from '../services/erp';
import type { Contract, ContractTemplate, Installment, PayMethod } from '../services/erp';
import {
    buildSchedule, CANCEL_REASONS, CONTRACT_FIELDS, contractBadge, contractValues, FREQUENCY_LABEL, fillContract, installmentState, isMonthlyPlan, monthlyValue, printContract, priceUnit,
    scheduleStats, stamp, termsChanged, termsOf,
} from '../services/contracts';
import type { Subscription } from '../types';
import { Field, Kpi, Modal, PageHeader, Panel, Pill, Table, Tabs } from '../components/shared/ui';

type Tab = 'subs' | 'payments' | 'contracts' | 'templates';
const METHODS: { value: PayMethod; label: string }[] = [{ value: 'cash', label: 'Cash' }, { value: 'card', label: 'Card' }, { value: 'bank', label: 'Bank transfer' }, { value: 'online', label: 'Online' }];
const round2 = (n: number) => Math.round(n * 100) / 100;
const FREQS = Object.keys(FREQUENCY_LABEL) as Subscription['frequency'][];
const statusTone = (s: Subscription['status']) => (s === 'active' ? 'good' : s === 'paused' ? 'warn' : 'bad');
const iso = (d: string) => `${d}T00:00:00.000Z`;
const todayStr = () => format(new Date(), 'yyyy-MM-dd');

interface SubForm { clientId: string; serviceId: string; cleanerId: string; frequency: Subscription['frequency']; price: string; startDate: string; endDate: string; status: Subscription['status']; notes: string }
const blankForm = (): SubForm => ({ clientId: '', serviceId: '', cleanerId: '', frequency: 'weekly', price: '', startDate: todayStr(), endDate: '', status: 'active', notes: '' });

export const SubscriptionsPage: React.FC = () => {
    const { user } = useAuth();
    const companyId = user?.companyId || '';
    const actor = user?.name || 'Owner';
    const db = useDB();
    const { items: contracts } = useCollection('contracts', companyId);
    const { items: templates } = useCollection('contractTemplates', companyId);
    const [tab, setTab] = useState<Tab>('subs');
    const [detailId, setDetailId] = useState<string | null>(null);
    const [form, setForm] = useState<'new' | Subscription | null>(null);
    const [contractId, setContractId] = useState<string | null>(null);
    const [tplEditing, setTplEditing] = useState<ContractTemplate | 'new' | null>(null);
    const [payFor, setPayFor] = useState<{ contractId: string; n: number } | null>(null);
    const [payFilter, setPayFilter] = useState<'open' | 'paid'>('open');
    const [cancelId, setCancelId] = useState<string | null>(null);

    const subs = useMemo(() => db.subscriptions.filter(s => s.companyId === companyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db.subscriptions, companyId]);
    const clients = db.clients.filter(c => c.companyId === companyId);
    const services = db.services.filter(s => s.companyId === companyId);
    const staff = db.staff.filter(s => s.companyId === companyId);
    const clientName = (id: string) => clients.find(c => c.id === id)?.name || 'Deleted client';
    const serviceName = (id: string) => services.find(s => s.id === id)?.name || 'Deleted service';
    const subOf = (id: string) => subs.find(s => s.id === id);

    // The contract a subscription is running on now: not ended and not cancelled
    const contractFor = (subId: string): Contract | undefined =>
        contracts.filter(c => c.subscriptionId === subId && c.status !== 'ended' && c.status !== 'cancelled').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    // The newest contract of any kind, for showing history
    const latestFor = (subId: string): Contract | undefined =>
        contracts.filter(c => c.subscriptionId === subId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    const active = subs.filter(s => s.status === 'active');
    const mrr = active.reduce((a, s) => a + monthlyValue(s), 0);
    const signedActive = active.filter(s => contractFor(s.id)?.status === 'signed').length;

    // Every monthly payment. Only signed (active) contracts are still expected to pay; the paid ones of cancelled or ended contracts stay as history.
    const everyPayment = contracts.flatMap(c => (c.installments || []).map(i => ({ id: `${c.id}:${i.n}`, c, i })));
    const plan = everyPayment.filter(r => r.c.status === 'signed');
    const late = plan.filter(r => installmentState(r.i) === 'overdue');
    const lateAmount = late.reduce((a, r) => a + r.i.amount, 0);
    const collected = plan.filter(r => r.i.paidOn).reduce((a, r) => a + (r.i.paidAmount ?? r.i.amount), 0);
    const expected = plan.filter(r => !r.i.paidOn).reduce((a, r) => a + r.i.amount, 0);
    const contractValue = collected + expected;
    const arr = mrr * 12;
    const payRow = payFor ? plan.find(r => r.id === `${payFor.contractId}:${payFor.n}`) : undefined;

    const detail = detailId ? subOf(detailId) : undefined;
    const cancelling = cancelId ? subOf(cancelId) : undefined;
    const openContract = contracts.find(c => c.id === contractId);

    /* ---------------------------- subscription actions ---------------------------- */

    const saveSub = (f: SubForm, existing?: Subscription) => {
        mutateDB(d => {
            const base = {
                clientId: f.clientId, serviceId: f.serviceId, cleanerId: f.cleanerId || undefined, frequency: f.frequency,
                status: f.status, pricePerVisit: Number(f.price), startDate: iso(f.startDate), endDate: f.endDate ? iso(f.endDate) : undefined, notes: f.notes.trim() || undefined,
            };
            if (existing) {
                const i = d.subscriptions.findIndex(s => s.id === existing.id);
                if (i >= 0) d.subscriptions[i] = { ...d.subscriptions[i], ...base };
            } else {
                d.subscriptions.push({ id: `sub-${Date.now()}`, companyId, createdAt: new Date().toISOString(), ...base });
            }
        });
        logActivity(companyId, actor, existing ? 'Updated a subscription' : 'Created a subscription', clientName(f.clientId));
        setForm(null);
    };

    const setStatus = (s: Subscription, status: Subscription['status']) => {
        mutateDB(d => { const x = d.subscriptions.find(r => r.id === s.id); if (x) x.status = status; });
        logActivity(companyId, actor, status === 'paused' ? 'Paused a subscription' : 'Resumed a subscription', clientName(s.clientId));
    };

    const cancelSub = (s: Subscription, reason: string, note: string) => {
        const at = new Date().toISOString();
        mutateDB(d => {
            const x = d.subscriptions.find(r => r.id === s.id);
            if (x) { x.status = 'cancelled'; x.cancelledAt = at; x.cancelReason = reason; x.cancelNote = note || undefined; x.cancelledBy = actor; }
        });
        // The contract that was running is cancelled at the same moment
        contracts.filter(c => c.subscriptionId === s.id && (c.status === 'draft' || c.status === 'signed')).forEach(c =>
            updateItem('contracts', c.id, { status: 'cancelled', cancelledAt: at, cancelReason: reason, cancelNote: note || undefined, cancelledBy: actor }));
        logActivity(companyId, actor, 'Cancelled a subscription', `${clientName(s.clientId)}: ${reason}`);
        setCancelId(null);
    };

    const reactivate = (s: Subscription) => {
        if (!confirm(`Reactivate this subscription for ${clientName(s.clientId)}? Its cancelled contract stays cancelled, so you will create a new contract.`)) return;
        mutateDB(d => {
            const x = d.subscriptions.find(r => r.id === s.id);
            if (x) { x.status = 'active'; delete x.cancelledAt; delete x.cancelReason; delete x.cancelNote; delete x.cancelledBy; }
        });
        logActivity(companyId, actor, 'Reactivated a subscription', clientName(s.clientId));
    };

    const deleteSub = (s: Subscription) => {
        const mine = contracts.filter(c => c.subscriptionId === s.id);
        const drafts = mine.filter(c => c.status === 'draft').length, signed = mine.filter(c => c.status === 'signed').length;
        const note = mine.length ? `\n\nIt has ${mine.length} contract${mine.length === 1 ? '' : 's'}. ${drafts ? `${drafts} draft${drafts === 1 ? '' : 's'} will be deleted. ` : ''}${signed ? `${signed} signed contract${signed === 1 ? ' is' : 's are'} kept and marked as ended.` : ''}` : '';
        if (!confirm(`Delete this subscription for ${clientName(s.clientId)}?${note}`)) return;
        mine.forEach(c => {
            if (c.status === 'draft') removeItem('contracts', c.id);
            else if (c.status === 'signed') updateItem('contracts', c.id, { status: 'ended', endedAt: new Date().toISOString() });
        });
        mutateDB(d => { d.subscriptions = d.subscriptions.filter(r => r.id !== s.id); });
        logActivity(companyId, actor, 'Deleted a subscription', clientName(s.clientId));
        setDetailId(null);
    };

    /* ----------------------------- contract actions ------------------------------ */

    const setPlan = (c: Contract, list: Installment[]) => updateItem('contracts', c.id, { installments: list });
    const markPaid = (c: Contract, n: number, v: { date: string; amount: number; method: PayMethod }) => {
        const inst = (c.installments || []).find(i => i.n === n);
        if (!inst || inst.paidOn) return;
        const pay = addItem('payments', companyId, { clientId: c.terms.clientId, amount: v.amount, method: v.method, date: v.date, reference: `${c.number}, month ${n}`, kind: 'payment' });
        setPlan(c, (c.installments || []).map(i => (i.n === n ? { ...i, paidOn: v.date, paidAmount: v.amount, method: v.method, paymentId: pay.id } : i)));
        logActivity(companyId, actor, `Recorded month ${n} payment of ${fmt(v.amount)} QAR`, `${c.number} ${clientName(c.terms.clientId)}`);
        setPayFor(null);
    };
    const undoPaid = (c: Contract, n: number) => {
        const inst = (c.installments || []).find(i => i.n === n);
        if (!inst?.paidOn || !confirm(`Undo the payment for month ${n}? The payment is also removed from your payments ledger.`)) return;
        if (inst.paymentId) removeItem('payments', inst.paymentId);
        setPlan(c, (c.installments || []).map(i => (i.n === n ? { n: i.n, due: i.due, amount: i.amount } : i)));
        logActivity(companyId, actor, `Undid month ${n} payment`, `${c.number} ${clientName(c.terms.clientId)}`);
    };
    const startPlan = (c: Contract, sub: Subscription, months: number) => {
        if (!c.signedAt) return;
        setPlan(c, buildSchedule(sub, c.signedAt, months));
        logActivity(companyId, actor, `Started a ${months}-month payment plan`, `${c.number} ${clientName(c.terms.clientId)}`);
    };
    const reprice = (c: Contract, sub: Subscription) => {
        const amount = round2(monthlyValue(sub));
        setPlan(c, (c.installments || []).map(i => (i.paidOn ? i : { ...i, amount })));
        logActivity(companyId, actor, 'Updated unpaid months to the current price', `${c.number} ${clientName(c.terms.clientId)}`);
    };

    const createContract = (sub: Subscription, template?: ContractTemplate) => {
        const number = nextNumber('CTR', contracts.map(c => c.number));
        const values = contractValues(getDB(), sub, number);
        const row = addItem('contracts', companyId, {
            number, subscriptionId: sub.id, clientId: sub.clientId, templateId: template?.id,
            title: template ? fillContract(template.title, values) : 'Service agreement',
            body: template ? fillContract(template.body, values) : '', source: template ? template.body : '',
            status: 'draft', terms: termsOf(sub),
        });
        logActivity(companyId, actor, 'Created a contract', `${number} ${clientName(sub.clientId)}`);
        setDetailId(null);
        setContractId(row.id);
    };

    /* ----------------------------------- render ----------------------------------- */

    return (
        <div className="pg">
            <PageHeader title="Contracts" subtitle="Recurring clients, the contract for each one, and your own contract templates.">
                {tab === 'templates'
                    ? <button className="btn btn-primary" onClick={() => setTplEditing('new')}><Plus size={15} /> New template</button>
                    : <button className="btn btn-primary" onClick={() => setForm('new')}><Plus size={15} /> New subscription</button>}
            </PageHeader>

            <div className="kpis">
                <Kpi label="Active subscriptions" value={active.length} hint={`${subs.length} in total`} />
                <Kpi label="Monthly value" value={fmt0(mrr)} unit="QAR" hint="What active subscriptions bring in each month" />
                <Kpi label="Late payments" value={late.length} tone={late.length ? 'bad' : undefined} hint={late.length ? `${fmt0(lateAmount)} QAR waiting to be collected` : 'Nobody is behind'} />
                <Kpi label="Contracts signed" value={`${signedActive} / ${active.length}`} tone={active.length > signedActive ? 'warn' : undefined} hint={active.length > signedActive ? `${active.length - signedActive} active without a signed contract` : 'Every active subscription is covered'} />
            </div>
            <div className="kpis">
                <Kpi label="Expected per year (ARR)" value={fmt0(arr)} unit="QAR" hint="Monthly value x 12, if every active subscription continues" />
                <Kpi label="Value of signed contracts" value={fmt0(contractValue)} unit="QAR" hint={`${plan.length} monthly payments in total`} />
                <Kpi label="Collected so far" value={fmt0(collected)} unit="QAR" tone={collected ? 'good' : undefined} hint={contractValue ? `${Math.round((collected / contractValue) * 100)}% of signed contracts` : 'Nothing collected yet'} />
                <Kpi label="Still expected" value={fmt0(expected)} unit="QAR" hint={lateAmount ? `${fmt0(lateAmount)} QAR of it is overdue` : 'All on schedule'} />
            </div>

            <Tabs value={tab} onChange={setTab} tabs={[
                { id: 'subs', label: 'Subscriptions' }, { id: 'payments', label: late.length ? `Payments (${late.length} late)` : 'Payments' },
                { id: 'contracts', label: `Contracts (${contracts.length})` }, { id: 'templates', label: 'Templates' },
            ]} />

            {tab === 'subs' && (
                <Panel title="Subscriptions" subtitle="Click one to see its details and its contract">
                    <Table rows={subs} onRowClick={s => setDetailId(s.id)}
                        empty="No subscriptions yet. Add a recurring client with their service, price and dates."
                        cols={[
                            { key: 'c', header: 'Client', render: s => <b style={{ fontWeight: 600 }}>{clientName(s.clientId)}</b> },
                            { key: 's', header: 'Service', render: s => serviceName(s.serviceId) },
                            { key: 'w', header: 'Cleaner', render: s => staffName(db, s.cleanerId) || <span className="tiny">Not assigned</span> },
                            { key: 'f', header: 'How often', render: s => FREQUENCY_LABEL[s.frequency] },
                            { key: 'p', header: 'Price', render: s => <span>{fmt(s.pricePerVisit)} QAR <span className="tiny">{priceUnit(s.frequency)}</span></span> },
                            { key: 'd', header: 'Period', render: s => <span>{dayLabel(s.startDate.slice(0, 10))}<div className="tiny">{s.endDate ? `to ${dayLabel(s.endDate.slice(0, 10))}` : 'No end date'}</div></span> },
                            { key: 'st', header: 'Status', render: s => <span><Pill tone={statusTone(s.status)}>{s.status}</Pill>{s.status === 'cancelled' && s.cancelledAt && <div className="tiny">{stamp(s.cancelledAt)}</div>}</span> },
                            { key: 'm', header: 'Monthly payments', render: s => {
                                const c = contractFor(s.id);
                                if (c?.status !== 'signed' || !c.installments?.length) return <span className="tiny">-</span>;
                                const st = scheduleStats(c.installments);
                                return <span>{st.paid} / {st.total} paid{st.late > 0 && <> <Pill tone="bad">{st.late} late</Pill></>}</span>;
                            } },
                            { key: 'k', header: 'Contract', render: s => {
                                const c = latestFor(s.id);
                                if (!c) return <span className="tiny">None</span>;
                                const b = contractBadge(c, termsChanged(c, s));
                                return <Pill tone={b.tone}>{b.label}</Pill>;
                            } },
                        ]} />
                </Panel>
            )}

            {tab === 'payments' && (
                <Panel title="Monthly payments" subtitle="One payment each month, starting on the day the contract was signed"
                    actions={<Tabs value={payFilter} onChange={setPayFilter} tabs={[{ id: 'open', label: 'To collect' }, { id: 'paid', label: 'Paid' }]} />}>
                    <Table
                        rows={(payFilter === 'open' ? plan.filter(r => !r.i.paidOn).sort((a, b) => a.i.due.localeCompare(b.i.due)) : everyPayment.filter(r => r.i.paidOn).sort((a, b) => (b.i.paidOn || '').localeCompare(a.i.paidOn || '')))}
                        empty={payFilter === 'open' ? 'Nothing to collect. Payments appear here once a contract is signed.' : 'No monthly payment has been recorded yet.'}
                        cols={[
                            { key: 'd', header: payFilter === 'open' ? 'Due' : 'Paid on', render: r => dayLabel(payFilter === 'open' ? r.i.due : r.i.paidOn || r.i.due) },
                            { key: 'c', header: 'Client', render: r => <b style={{ fontWeight: 600 }}>{clientName(r.c.terms.clientId)}</b> },
                            { key: 'k', header: 'Contract', render: r => r.c.number },
                            { key: 'n', header: 'Month', render: r => `${r.i.n} of ${r.c.installments?.length}` },
                            { key: 'a', header: 'Amount', align: 'r', render: r => `${fmt(r.i.paidAmount ?? r.i.amount)} QAR` },
                            { key: 's', header: 'Status', render: r => <InstallmentPill i={r.i} /> },
                            { key: 'x', header: '', align: 'r', render: r => r.c.status !== 'signed' ? null : r.i.paidOn
                                ? <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); undoPaid(r.c, r.i.n); }}>Undo</button>
                                : <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); setPayFor({ contractId: r.c.id, n: r.i.n }); }}>Mark paid</button> },
                        ]} />
                </Panel>
            )}

            {tab === 'contracts' && (
                <Panel title="All contracts" subtitle="Active means signed and running. Drafts can still be edited. Signed and cancelled contracts are locked.">
                    <Table rows={[...contracts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))} onRowClick={c => setContractId(c.id)}
                        empty="No contracts yet. Open a subscription and choose Create contract."
                        cols={[
                            { key: 'n', header: 'Number', render: c => <b style={{ fontWeight: 600 }}>{c.number}</b> },
                            { key: 'c', header: 'Client', render: c => clientName(c.terms.clientId) },
                            { key: 's', header: 'Service', render: c => serviceName(c.terms.serviceId) },
                            { key: 'p', header: 'Period', render: c => `${dayLabel(c.terms.startDate)}${c.terms.endDate ? ` to ${dayLabel(c.terms.endDate)}` : ''}` },
                            { key: 'st', header: 'Status', render: c => { const b = contractBadge(c, termsChanged(c, subOf(c.subscriptionId))); return <Pill tone={b.tone}>{b.label}</Pill>; } },
                            { key: 'g', header: 'Signed', render: c => (c.signedAt ? dayLabel(c.signedAt.slice(0, 10)) : '-') },
                            { key: 'x', header: 'Cancelled', render: c => c.status === 'cancelled' ? <span>{stamp(c.cancelledAt)}<div className="tiny">{c.cancelReason}</div></span> : '-' },
                        ]} />
                </Panel>
            )}

            {tab === 'templates' && (
                <Panel title="Contract templates" subtitle="Write the terms once. Each contract fills in the client, service, price and dates for you.">
                    <Table rows={templates} onRowClick={t => setTplEditing(t)}
                        empty="No templates yet. Write your first contract: your clauses, your wording."
                        cols={[
                            { key: 'n', header: 'Name', render: t => <b style={{ fontWeight: 600 }}>{t.name}</b> },
                            { key: 't', header: 'Contract title', render: t => t.title },
                            { key: 'l', header: 'Length', render: t => `${t.body.trim().split(/\s+/).filter(Boolean).length} words` },
                            { key: 'd', header: '', render: t => (t.isDefault ? <Pill tone="info">Default</Pill> : null) },
                        ]} />
                </Panel>
            )}

            {detail && (
                <SubscriptionDetail
                    sub={detail} db={db} clientName={clientName(detail.clientId)} serviceName={serviceName(detail.serviceId)}
                    contract={contractFor(detail.id)} lastContract={latestFor(detail.id)} templates={templates}
                    onClose={() => setDetailId(null)} onEdit={() => { setDetailId(null); setForm(detail); }}
                    onToggle={() => setStatus(detail, detail.status === 'active' ? 'paused' : 'active')}
                    onDelete={() => deleteSub(detail)} onCancel={() => { setDetailId(null); setCancelId(detail.id); }} onReactivate={() => reactivate(detail)} onOpenContract={id => { setDetailId(null); setContractId(id); }}
                    onCreateContract={t => createContract(detail, t)}
                    onPay={(c, n) => setPayFor({ contractId: c.id, n })} onUndo={undoPaid} onStart={startPlan} onReprice={reprice}
                />
            )}

            {form && (
                <SubscriptionForm
                    key={form === 'new' ? 'new' : form.id} existing={form === 'new' ? undefined : form}
                    clients={clients} services={services} staff={staff.map(s => ({ id: s.id, name: staffName(db, s.id) }))}
                    onClose={() => setForm(null)} onSave={f => saveSub(f, form === 'new' ? undefined : form)}
                />
            )}

            {openContract && (
                <ContractModal
                    key={openContract.id} contract={openContract} sub={subOf(openContract.subscriptionId)} db={db}
                    companyName={db.companies.find(c => c.id === companyId)?.name || ''}
                    clientName={clientName(openContract.terms.clientId)}
                    onClose={() => setContractId(null)} actor={actor}
                />
            )}

            {cancelling && (
                <CancelModal
                    key={cancelling.id} sub={cancelling} clientName={clientName(cancelling.clientId)} contract={contractFor(cancelling.id)}
                    onClose={() => setCancelId(null)} onConfirm={(r, n) => cancelSub(cancelling, r, n)}
                />
            )}

            {payRow && (
                <PayModal key={payRow.id} contract={payRow.c} inst={payRow.i} clientName={clientName(payRow.c.terms.clientId)} onClose={() => setPayFor(null)} onConfirm={v => markPaid(payRow.c, payRow.i.n, v)} />
            )}

            {tplEditing && (
                <TemplateEditor
                    key={tplEditing === 'new' ? 'new' : tplEditing.id} template={tplEditing === 'new' ? undefined : tplEditing}
                    sample={subs[0] ? contractValues(db, subs[0], 'CTR-0000') : undefined} others={templates}
                    onClose={() => setTplEditing(null)} companyId={companyId} actor={actor}
                />
            )}
        </div>
    );
};

/* ----------------------------- subscription detail ----------------------------- */

const Row: React.FC<{ k: string; children: React.ReactNode }> = ({ k, children }) => (
    <div className="row"><span className="tiny">{k}</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{children}</span></div>
);

const SubscriptionDetail: React.FC<{
    sub: Subscription; db: ReturnType<typeof useDB>; clientName: string; serviceName: string; contract?: Contract; lastContract?: Contract; templates: ContractTemplate[];
    onClose: () => void; onEdit: () => void; onToggle: () => void; onDelete: () => void; onCancel: () => void; onReactivate: () => void; onOpenContract: (id: string) => void; onCreateContract: (t?: ContractTemplate) => void;
    onPay: (c: Contract, n: number) => void; onUndo: (c: Contract, n: number) => void; onStart: (c: Contract, s: Subscription, months: number) => void; onReprice: (c: Contract, s: Subscription) => void;
}> = ({ sub, db, clientName, serviceName, contract: current, lastContract, templates, onClose, onEdit, onToggle, onDelete, onCancel, onReactivate, onOpenContract, onCreateContract, onPay, onUndo, onStart, onReprice }) => {
    const client = db.clients.find(c => c.id === sub.clientId);
    const [pick, setPick] = useState(templates.find(t => t.isDefault)?.id || templates[0]?.id || '');
    // Show the running contract; if there is none, show the last cancelled or ended one as history
    const contract = current || lastContract;
    const canCreate = !current && sub.status !== 'cancelled';
    const stale = contract ? termsChanged(contract, sub) : false;
    return (
        <Modal open title={clientName} onClose={onClose} footer={
            <>
                <button className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--color-danger)' }} onClick={onDelete}>Delete</button>
                {sub.status !== 'cancelled' && <button className="btn btn-secondary" style={{ color: 'var(--color-danger)' }} onClick={onCancel}>Cancel subscription</button>}
                {sub.status !== 'cancelled' && <button className="btn btn-secondary" onClick={onToggle}>{sub.status === 'active' ? 'Pause' : 'Resume'}</button>}
                {sub.status === 'cancelled' && <button className="btn btn-secondary" onClick={onReactivate}>Reactivate</button>}
                <button className="btn btn-primary" onClick={onEdit}>Edit</button>
            </>
        }>
            <div className="stack">
                {sub.status === 'cancelled' && (
                    <div className="issue high">
                        <b>Cancelled on {stamp(sub.cancelledAt) || 'an unknown date'}</b>
                        <div className="fix">Reason: {sub.cancelReason || 'not recorded'}{sub.cancelNote ? `. ${sub.cancelNote}` : ''}{sub.cancelledBy ? ` (by ${sub.cancelledBy})` : ''}</div>
                    </div>
                )}
                <Panel title="Subscription">
                    <Row k="Status"><Pill tone={statusTone(sub.status)}>{sub.status}</Pill></Row>
                    <Row k="Service">{serviceName}</Row>
                    <Row k="How often">{FREQUENCY_LABEL[sub.frequency]}</Row>
                    <Row k="Price">{fmt(sub.pricePerVisit)} QAR {priceUnit(sub.frequency)}</Row>
                    {!isMonthlyPlan(sub.frequency) && <Row k="Per month, about">{fmt0(monthlyValue(sub))} QAR</Row>}
                    <Row k="Starts">{dayLabel(sub.startDate.slice(0, 10))}</Row>
                    <Row k="Ends">{sub.endDate ? dayLabel(sub.endDate.slice(0, 10)) : 'No end date'}</Row>
                    <Row k="Cleaner">{staffName(db, sub.cleanerId) || 'Not assigned'}</Row>
                    <Row k="Phone">{client?.phone || '-'}</Row>
                    <Row k="Address">{client?.address || '-'}</Row>
                    {sub.notes && <div className="tiny" style={{ marginTop: 8 }}>{sub.notes}</div>}
                </Panel>

                <Panel title="Contract">
                    {contract ? (
                        <div className="stack">
                            <div className="row">
                                <div><b style={{ fontWeight: 600 }}>{contract.number}</b><div className="tiny">{contract.title}</div></div>
                                {(() => { const b = contractBadge(contract, stale); return <Pill tone={b.tone}>{b.label}</Pill>; })()}
                            </div>
                            {stale && <div className="tiny">The subscription changed after this contract was written. Open it to update the text.</div>}
                            {contract.status === 'cancelled' && <div className="tiny">Cancelled on {stamp(contract.cancelledAt)}. Reason: {contract.cancelReason}</div>}
                            <div className="toolbar"><button className="btn btn-secondary btn-sm" onClick={() => onOpenContract(contract.id)}>Open contract</button></div>
                        </div>
                    ) : null}
                    {canCreate ? (
                        <div className="stack">
                            <div className="tiny">No contract for this subscription yet. Pick one of your templates, or write one from scratch.</div>
                            <div className="toolbar">
                                <select className="input-field" value={pick} onChange={e => setPick(e.target.value)} aria-label="Template">
                                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (default)' : ''}</option>)}
                                    <option value="">Write from scratch</option>
                                </select>
                                <button className="btn btn-primary btn-sm" onClick={() => onCreateContract(templates.find(t => t.id === pick))}>Create contract</button>
                            </div>
                        </div>
                    ) : sub.status === 'cancelled' && !contract ? <div className="tiny">This subscription was cancelled before a contract was made.</div> : null}
                </Panel>

                <MonthlyPayments sub={sub} contract={contract} onPay={onPay} onUndo={onUndo} onStart={onStart} onReprice={onReprice} />
            </div>
        </Modal>
    );
};

const InstallmentPill: React.FC<{ i: Installment; closed?: Contract['status'] }> = ({ i, closed }) => {
    const st = installmentState(i);
    if (st !== 'paid' && closed === 'cancelled') return <Pill tone="bad">Cancelled</Pill>;
    if (st !== 'paid' && closed === 'ended') return <Pill>Ended</Pill>;
    return st === 'paid' ? <Pill tone="good">Paid {dayLabel(i.paidOn!)}</Pill> : st === 'overdue' ? <Pill tone="bad">Overdue</Pill> : st === 'due-soon' ? <Pill tone="warn">Due soon</Pill> : <Pill>Upcoming</Pill>;
};

const MonthlyPayments: React.FC<{
    sub: Subscription; contract?: Contract; onPay: (c: Contract, n: number) => void; onUndo: (c: Contract, n: number) => void;
    onStart: (c: Contract, s: Subscription, months: number) => void; onReprice: (c: Contract, s: Subscription) => void;
}> = ({ sub, contract, onPay, onUndo, onStart, onReprice }) => {
    const [months, setMonths] = useState('12');
    if (!contract || contract.status === 'draft') {
        return <Panel title="Monthly payments"><div className="tiny">The payment plan starts when the contract is signed. The first payment is due on the day it is signed, then one every month.</div></Panel>;
    }
    const list = contract.installments;
    if (!list?.length) {
        return (
            <Panel title="Monthly payments">
                <div className="stack">
                    <div className="tiny">No payment plan yet. It starts from the signing date, {dayLabel((contract.signedAt || '').slice(0, 10))}.</div>
                    <div className="toolbar">
                        <input className="input-field" type="number" min="1" max="60" value={months} onChange={e => setMonths(e.target.value)} aria-label="Number of months" style={{ minWidth: 0, width: 90 }} />
                        <span className="tiny">months</span>
                        <button className="btn btn-primary btn-sm" disabled={!(Number(months) >= 1)} onClick={() => onStart(contract, sub, Number(months))}>Start monthly payments</button>
                    </div>
                </div>
            </Panel>
        );
    }
    const st = scheduleStats(list);
    const open = contract.status === 'signed';
    const closedNote = contract.status === 'cancelled' ? 'This contract was cancelled, so unpaid months are no longer expected.' : contract.status === 'ended' ? 'This contract has ended.' : '';
    const current = round2(monthlyValue(sub));
    const outdated = list.some(i => !i.paidOn && i.amount !== current);
    return (
        <Panel title="Monthly payments" subtitle={`${st.paid} of ${st.total} paid. ${fmt0(st.collected)} QAR collected, ${fmt0(st.remaining)} QAR to go.`}>
            <div className="stack">
                {closedNote && <div className="tiny">{closedNote}</div>}
                {open && st.late > 0 && <div className="issue high"><b>{st.late} payment{st.late === 1 ? ' is' : 's are'} late</b><div className="fix">{fmt0(st.lateAmount)} QAR is waiting to be collected.</div></div>}
                {open && outdated && (
                    <div className="issue medium">
                        <b>The price changed</b>
                        <div className="fix">Unpaid months still show an old amount. Paid months are never changed.</div>
                        <div><button className="btn btn-secondary btn-sm" onClick={() => onReprice(contract, sub)}>Use {fmt(current)} QAR for unpaid months</button></div>
                    </div>
                )}
                <Table rows={list.map(i => ({ ...i, id: String(i.n) }))} cols={[
                    { key: 'n', header: 'Month', render: i => i.n },
                    { key: 'd', header: 'Due', render: i => dayLabel(i.due) },
                    { key: 'a', header: 'Amount', render: i => `${fmt(i.paidAmount ?? i.amount)} QAR` },
                    { key: 's', header: 'Status', render: i => <InstallmentPill i={i} closed={contract.status} /> },
                    { key: 'x', header: '', align: 'r', render: i => !open ? null : i.paidOn
                        ? <button className="btn btn-ghost btn-sm" onClick={() => onUndo(contract, i.n)}>Undo</button>
                        : <button className="btn btn-primary btn-sm" onClick={() => onPay(contract, i.n)}>Mark paid</button> },
                ]} />
            </div>
        </Panel>
    );
};

/* ------------------------------ subscription form ------------------------------ */

const SubscriptionForm: React.FC<{
    existing?: Subscription; clients: { id: string; name: string }[]; services: { id: string; name: string; price: number }[]; staff: { id: string; name: string }[];
    onClose: () => void; onSave: (f: SubForm) => void;
}> = ({ existing, clients, services, staff, onClose, onSave }) => {
    const [f, setF] = useState<SubForm>(() => existing ? {
        clientId: existing.clientId, serviceId: existing.serviceId, cleanerId: existing.cleanerId || '', frequency: existing.frequency,
        price: String(existing.pricePerVisit), startDate: existing.startDate.slice(0, 10), endDate: existing.endDate ? existing.endDate.slice(0, 10) : '',
        status: existing.status, notes: existing.notes || '',
    } : blankForm());
    const [err, setErr] = useState('');

    const pickService = (serviceId: string) => {
        const old = services.find(s => s.id === f.serviceId), next = services.find(s => s.id === serviceId);
        // Fill in the service price unless the owner already typed a different price
        const untouched = f.price === '' || (old && Number(f.price) === old.price);
        setF({ ...f, serviceId, price: next && untouched ? String(next.price) : f.price });
    };
    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!f.clientId || !f.serviceId) return setErr('Choose a client and a service.');
        const p = Number(f.price);
        if (f.price === '' || !Number.isFinite(p) || p < 0) return setErr('Enter the price, for example 150.');
        if (!f.startDate) return setErr('Choose the start date.');
        if (f.endDate && f.endDate < f.startDate) return setErr('The end date cannot be before the start date.');
        setErr(''); onSave(f);
    };
    return (
        <Modal open title={existing ? 'Edit subscription' : 'New subscription'} onClose={onClose}>
            <form className="stack" onSubmit={submit}>
                <div className="frow">
                    <Field label="Client"><select value={f.clientId} required onChange={e => setF({ ...f, clientId: e.target.value })}>
                        <option value="" disabled>Choose a client</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
                    <Field label="Service"><select value={f.serviceId} required onChange={e => pickService(e.target.value)}>
                        <option value="" disabled>Choose a service</option>{services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
                    <Field label="How often" half><select value={f.frequency} onChange={e => setF({ ...f, frequency: e.target.value as Subscription['frequency'] })}>
                        {FREQS.map(q => <option key={q} value={q}>{FREQUENCY_LABEL[q]}</option>)}</select></Field>
                    <Field label={`Price, QAR ${priceUnit(f.frequency)}`} half hint="Filled from the service. Type your own price if you agreed a different one.">
                        <input type="number" min="0" step="any" value={f.price} required onChange={e => setF({ ...f, price: e.target.value })} /></Field>
                    <Field label="Start date" half><input type="date" value={f.startDate} required onChange={e => setF({ ...f, startDate: e.target.value })} /></Field>
                    <Field label="End date" half hint="Leave empty if it continues until someone ends it."><input type="date" value={f.endDate} min={f.startDate} onChange={e => setF({ ...f, endDate: e.target.value })} /></Field>
                    <Field label="Cleaner" half><select value={f.cleanerId} onChange={e => setF({ ...f, cleanerId: e.target.value })}>
                        <option value="">Not assigned</option>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
                    {existing && existing.status !== 'cancelled' && <Field label="Status" half hint="To cancel, use Cancel subscription so the reason is recorded."><select value={f.status} onChange={e => setF({ ...f, status: e.target.value as Subscription['status'] })}>
                        <option value="active">Active</option><option value="paused">Paused</option></select></Field>}
                    <Field label="Notes"><textarea value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="Access, keys, special requests" /></Field>
                </div>
                {err && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.9375rem' }}>{err}</p>}
                <div className="modal-f" style={{ padding: 0 }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn-primary">Save</button>
                </div>
            </form>
        </Modal>
    );
};

/* ---------------------------------- contract ---------------------------------- */

const ContractModal: React.FC<{
    contract: Contract; sub?: Subscription; db: ReturnType<typeof useDB>; companyName: string; clientName: string; actor: string; onClose: () => void;
}> = ({ contract: c, sub, db, companyName, clientName, actor, onClose }) => {
    const [title, setTitle] = useState(c.title);
    const [body, setBody] = useState(c.body);
    const [signDate, setSignDate] = useState(todayStr());
    const [planMonths, setPlanMonths] = useState('12');
    const [msg, setMsg] = useState('');
    const draft = c.status === 'draft';
    const dirty = title !== c.title || body !== c.body;
    const stale = termsChanged(c, sub);
    const log = (a: string) => logActivity(c.companyId, actor, a, `${c.number} ${clientName}`);

    const save = () => { updateItem('contracts', c.id, { title: title.trim() || 'Service agreement', body }); log('Edited a contract'); setMsg('Saved.'); };
    const regenerate = () => {
        if (!sub) return;
        const values = contractValues(getDB(), sub, c.number);
        const nb = fillContract(c.source, values);
        setBody(nb);
        updateItem('contracts', c.id, { body: nb, terms: termsOf(sub) });
        log('Regenerated a contract'); setMsg('The contract now uses the current subscription.');
    };
    const acceptTerms = () => { if (!sub) return; updateItem('contracts', c.id, { terms: termsOf(sub) }); setMsg('Marked as up to date.'); };
    const sign = () => {
        if (!body.trim()) return setMsg('Write the contract text before signing.');
        if (stale) return setMsg('The subscription changed. Regenerate the contract, or mark it as up to date, then sign.');
        const m = Math.floor(Number(planMonths));
        if (!Number.isFinite(m) || m < 0 || m > 60) return setMsg('Months of payments must be between 0 and 60.');
        updateItem('contracts', c.id, {
            title: title.trim() || 'Service agreement', body, status: 'signed', signedAt: iso(signDate),
            installments: sub && m > 0 ? buildSchedule(sub, signDate, m) : [],
        });
        log('Marked a contract as signed'); setMsg('');
    };
    const end = () => { if (!confirm('End this contract? It stays on record and can still be printed.')) return; updateItem('contracts', c.id, { status: 'ended', endedAt: new Date().toISOString() }); log('Ended a contract'); };
    const remove = () => { if (!confirm('Delete this draft contract?')) return; removeItem('contracts', c.id); log('Deleted a draft contract'); onClose(); };
    const print = (copies: 1 | 2) => printContract({ ...c, title, body }, companyName, copies);

    return (
        <Modal open title={`${c.number}, ${clientName}`} onClose={onClose} footer={
            <>
                {draft && <button className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--color-danger)' }} onClick={remove}>Delete draft</button>}
                <button className="btn btn-secondary" onClick={() => print(1)}><Printer size={15} /> Print</button>
                <button className="btn btn-secondary" onClick={() => print(2)}><Printer size={15} /> Print 2 copies</button>
                {draft && <button className="btn btn-secondary" onClick={save} disabled={!dirty}>Save</button>}
                {draft && <button className="btn btn-primary" onClick={sign}>Mark as signed</button>}
                {c.status === 'signed' && <button className="btn btn-secondary" onClick={end}>End contract</button>}
            </>
        }>
            <div className="stack">
                <div className="row">
                    <span className="tiny">{serviceLine(db, c)}</span>
                    {(() => { const b = contractBadge(c, stale); return <Pill tone={b.tone}>{b.label}</Pill>; })()}
                </div>
                {c.status === 'cancelled' && (
                    <div className="issue high">
                        <b>Cancelled on {stamp(c.cancelledAt)}</b>
                        <div className="fix">Reason: {c.cancelReason || 'not recorded'}{c.cancelNote ? `. ${c.cancelNote}` : ''}{c.cancelledBy ? ` (by ${c.cancelledBy})` : ''}</div>
                    </div>
                )}
                {stale && (
                    <div className="issue medium">
                        <b>The subscription changed after this contract was written</b>
                        <div className="fix">Update the contract so it matches what you agreed now.</div>
                        <div className="toolbar">
                            {c.source && <button className="btn btn-primary btn-sm" onClick={regenerate}>Regenerate from template</button>}
                            <button className="btn btn-secondary btn-sm" onClick={acceptTerms}>Keep my text, mark as up to date</button>
                        </div>
                    </div>
                )}
                {draft ? (
                    <>
                        <Field label="Title"><input value={title} onChange={e => setTitle(e.target.value)} dir="auto" /></Field>
                        <Field label="Contract text" hint="Edit anything here. This text is what gets printed."><textarea value={body} onChange={e => setBody(e.target.value)} dir="auto" style={{ minHeight: 320 }} placeholder="Write the contract here." /></Field>
                        <Field label="Signing date" half hint="The first payment is due on this day."><input type="date" value={signDate} onChange={e => setSignDate(e.target.value)} /></Field>
                        <Field label="Months of payments" half hint="One payment each month. Use 0 for no payment plan."><input type="number" min="0" max="60" value={planMonths} onChange={e => setPlanMonths(e.target.value)} /></Field>
                    </>
                ) : (
                    <Panel title={c.title}>
                        <div dir="auto" style={{ whiteSpace: 'pre-wrap', fontSize: '0.9375rem', lineHeight: 1.7 }}>{c.body}</div>
                        {c.signedAt && <div className="tiny" style={{ marginTop: 12 }}>Signed on {dayLabel(c.signedAt.slice(0, 10))}</div>}
                        {c.status === 'ended' && c.endedAt && <div className="tiny">Ended on {stamp(c.endedAt)}</div>}
                    </Panel>
                )}
                {msg && <p role="status" className="tiny">{msg}</p>}
            </div>
        </Modal>
    );
};
const serviceLine = (db: ReturnType<typeof useDB>, c: Contract) =>
    `${db.services.find(s => s.id === c.terms.serviceId)?.name || 'Service'} · ${fmt(c.terms.price)} QAR ${priceUnit(c.terms.frequency as Subscription['frequency'])} · from ${dayLabel(c.terms.startDate)}${c.terms.endDate ? ` to ${dayLabel(c.terms.endDate)}` : ''}`;

/* --------------------------------- templates --------------------------------- */

const TemplateEditor: React.FC<{
    template?: ContractTemplate; sample?: Record<string, string>; others: ContractTemplate[]; companyId: string; actor: string; onClose: () => void;
}> = ({ template, sample, others, companyId, actor, onClose }) => {
    const [name, setName] = useState(template?.name || '');
    const [title, setTitle] = useState(template?.title || '');
    const [body, setBody] = useState(template?.body || '');
    const [isDefault, setIsDefault] = useState(template?.isDefault ?? others.length === 0);
    const [err, setErr] = useState('');
    const area = useRef<HTMLTextAreaElement>(null);

    // Shown in the preview when there is no subscription yet to take real values from
    const demo: Record<string, string> = sample || {
        client_name: 'Client name', client_phone: '+974 0000 0000', client_address: 'Client address', service: 'Service name', frequency: 'Every week',
        price: '0.00 QAR per visit', start_date: '1 January 2027', end_date: 'Open-ended (until either side ends it)', cleaner: 'Cleaner name',
        company_name: 'Your company', contract_number: 'CTR-0000', today: format(new Date(), 'd MMMM yyyy'),
    };
    const insert = (key: string) => {
        const el = area.current, tag = `{${key}}`;
        if (!el) { setBody(b => b + tag); return; }
        const a = el.selectionStart ?? body.length, z = el.selectionEnd ?? body.length;
        setBody(body.slice(0, a) + tag + body.slice(z));
        requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + tag.length, a + tag.length); });
    };
    const unknown = [...new Set([...(title + body).matchAll(/\{(\w+)\}/g)].map(m => m[1]))].filter(k => !CONTRACT_FIELDS.some(f => f.key === k));

    const save = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !title.trim() || !body.trim()) return setErr('Give the template a name, a title and some text.');
        const data = { name: name.trim(), title: title.trim(), body, isDefault };
        if (isDefault) others.filter(t => t.id !== template?.id && t.isDefault).forEach(t => updateItem('contractTemplates', t.id, { isDefault: false }));
        if (template) updateItem('contractTemplates', template.id, data); else addItem('contractTemplates', companyId, data);
        logActivity(companyId, actor, template ? 'Updated a contract template' : 'Created a contract template', data.name);
        onClose();
    };
    const remove = () => {
        if (!template || !confirm('Delete this template? Contracts already made from it are not changed.')) return;
        removeItem('contractTemplates', template.id); logActivity(companyId, actor, 'Deleted a contract template', template.name); onClose();
    };

    return (
        <Modal open title={template ? 'Edit template' : 'New template'} onClose={onClose} width={760}>
            <form className="stack" onSubmit={save}>
                <div className="frow">
                    <Field label="Template name" half hint="Only you see this, for example Weekly cleaning"><input value={name} onChange={e => setName(e.target.value)} required /></Field>
                    <Field label="Contract title" half hint="Printed at the top. You can use fields here too."><input value={title} onChange={e => setTitle(e.target.value)} required dir="auto" /></Field>
                </div>
                <div className="stack" style={{ gap: 8 }}>
                    <b style={{ fontWeight: 600, fontSize: '0.8125rem' }}>Insert a field</b>
                    <div className="toolbar">{CONTRACT_FIELDS.map(f => <button key={f.key} type="button" className="btn btn-secondary btn-sm" onClick={() => insert(f.key)}>{f.label}</button>)}</div>
                </div>
                <div className="fld">
                    <label htmlFor="tpl-body">Contract text</label>
                    <textarea id="tpl-body" ref={area} value={body} onChange={e => setBody(e.target.value)} dir="auto" required style={{ minHeight: 280 }}
                        placeholder={'Write your clauses here. Add fields like {client_name} or {price} where the real value should appear.'} />
                    {unknown.length > 0 && <small style={{ color: 'var(--color-danger)' }}>Unknown field: {unknown.map(k => `{${k}}`).join(', ')}. It will print as it is.</small>}
                </div>
                <Panel title="Preview" subtitle={sample ? 'With your first subscription' : 'With example values'}>
                    <div dir="auto" style={{ whiteSpace: 'pre-wrap', fontSize: '0.9375rem', lineHeight: 1.7 }}>
                        <b style={{ fontWeight: 600 }}>{fillContract(title, demo) || 'Title'}</b>{'\n\n'}{fillContract(body, demo) || <span className="tiny">Your text appears here.</span>}
                    </div>
                </Panel>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.9375rem' }}>
                    <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} /> Use this template first when creating contracts
                </label>
                {err && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.9375rem' }}>{err}</p>}
                <div className="modal-f" style={{ padding: 0 }}>
                    {template && <button type="button" className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--color-danger)' }} onClick={remove}>Delete</button>}
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn-primary">Save template</button>
                </div>
            </form>
        </Modal>
    );
};


/* ------------------------------- record a payment ------------------------------- */

const PayModal: React.FC<{
    contract: Contract; inst: Installment; clientName: string; onClose: () => void; onConfirm: (v: { date: string; amount: number; method: PayMethod }) => void;
}> = ({ contract, inst, clientName, onClose, onConfirm }) => {
    const [date, setDate] = useState(todayStr());
    const [amount, setAmount] = useState(String(inst.amount));
    const [method, setMethod] = useState<PayMethod>('cash');
    const [err, setErr] = useState('');
    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const a = Number(amount);
        if (!date) return setErr('Choose the date of the payment.');
        if (amount === '' || !Number.isFinite(a) || a <= 0) return setErr('Enter the amount that was paid.');
        onConfirm({ date, amount: round2(a), method });
    };
    return (
        <Modal open title={`Month ${inst.n} payment`} onClose={onClose}>
            <form className="stack" onSubmit={submit}>
                <div className="tiny">{clientName}, {contract.number}. Due {dayLabel(inst.due)}.</div>
                <div className="frow">
                    <Field label="Amount paid, QAR" half><input type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)} required autoFocus /></Field>
                    <Field label="Date paid" half><input type="date" value={date} onChange={e => setDate(e.target.value)} required /></Field>
                    <Field label="How they paid"><select value={method} onChange={e => setMethod(e.target.value as PayMethod)}>{METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
                </div>
                <div className="tiny">This is also added to your payments ledger and to what this client has paid.</div>
                {err && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.9375rem' }}>{err}</p>}
                <div className="modal-f" style={{ padding: 0 }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn-primary">Record payment</button>
                </div>
            </form>
        </Modal>
    );
};

/* ------------------------------ cancel a subscription ------------------------------ */

const CancelModal: React.FC<{
    sub: Subscription; clientName: string; contract?: Contract; onClose: () => void; onConfirm: (reason: string, note: string) => void;
}> = ({ sub, clientName, contract, onClose, onConfirm }) => {
    const [reason, setReason] = useState('');
    const [note, setNote] = useState('');
    const [err, setErr] = useState('');
    const unpaid = (contract?.status === 'signed' ? contract.installments || [] : []).filter(i => !i.paidOn);
    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!reason) return setErr('Choose why this subscription is cancelled.');
        if (reason === 'Other' && !note.trim()) return setErr('Please write the reason.');
        onConfirm(reason, note.trim());
    };
    return (
        <Modal open title="Cancel subscription" onClose={onClose}>
            <form className="stack" onSubmit={submit}>
                <div className="tiny">{clientName}, {fmt(sub.pricePerVisit)} QAR {priceUnit(sub.frequency)}. The cancellation is saved with today's date and the exact time.</div>
                <div className="frow">
                    <Field label="Why is it cancelled?"><select value={reason} required onChange={e => setReason(e.target.value)}>
                        <option value="" disabled>Choose a reason</option>{CANCEL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select></Field>
                    <Field label={reason === 'Other' ? 'Reason' : 'Note (optional)'}><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Anything worth remembering" /></Field>
                </div>
                <div className="issue medium">
                    <b>What happens</b>
                    <div className="fix">
                        {contract ? `Contract ${contract.number} is cancelled too. ` : 'There is no contract to cancel. '}
                        {unpaid.length ? `${unpaid.length} unpaid monthly payment${unpaid.length === 1 ? '' : 's'} (${fmt0(unpaid.reduce((a, i) => a + i.amount, 0))} QAR) will no longer be expected. ` : ''}
                        Payments already received are kept.
                    </div>
                </div>
                {err && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.9375rem' }}>{err}</p>}
                <div className="modal-f" style={{ padding: 0 }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Keep subscription</button>
                    <button type="submit" className="btn btn-primary" style={{ background: 'var(--color-danger)' }}>Cancel subscription</button>
                </div>
            </form>
        </Modal>
    );
};
