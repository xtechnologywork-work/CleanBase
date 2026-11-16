import React, { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Banknote, MessageCircle, Plus, Printer, Search } from 'lucide-react';
import { addDays, format, parseISO } from 'date-fns';
import {
    addItem, dayLabel, downloadCsv, fmt, invoicePaid, invoiceState, invoiceSubtotal, invoiceTax, invoiceTotal, logActivity,
    mutateDB, nextNumber, printHtml, readCollection, removeItem, today, updateItem, useCollection, useDB, useSettings,
} from '../services/erp';
import type { Invoice, InvoiceItem, InvoiceState, PayMethod } from '../services/erp';
import { Empty, Field, Kpi, Modal, Panel, PageHeader, Pill, Table, Tabs } from '../components/shared/ui';

const STATE_TONE: Record<InvoiceState, 'good' | 'bad' | 'warn' | 'info' | undefined> = {
    draft: undefined, sent: 'info', partial: 'warn', paid: 'good', overdue: 'bad', cancelled: undefined,
};
const STATE_LABEL: Record<InvoiceState, string> = {
    draft: 'Draft', sent: 'Sent', partial: 'Part paid', paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled',
};
const METHODS: { value: PayMethod; label: string }[] = [
    { value: 'cash', label: 'Cash' }, { value: 'card', label: 'Card' }, { value: 'bank', label: 'Bank transfer' }, { value: 'online', label: 'Online' },
];

export const InvoicesPage: React.FC = () => {
    const { user } = useAuth();
    const companyId = user?.companyId || '';
    const db = useDB();
    const { settings } = useSettings(companyId);
    const { items: invoices } = useCollection('invoices', companyId);
    const { items: payments } = useCollection('payments', companyId);
    const { items: promos } = useCollection('promos', companyId);

    const [tab, setTab] = useState<'invoices' | 'payments'>('invoices');
    const [filter, setFilter] = useState<'all' | InvoiceState>('all');
    const [q, setQ] = useState('');
    const [openId, setOpenId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    const client = (id: string) => db.clients.find(c => c.id === id);
    const rows = useMemo(() => invoices
        .map(inv => ({ inv, state: invoiceState(inv, payments), total: invoiceTotal(inv), paid: invoicePaid(inv, payments) }))
        .filter(r => filter === 'all' || r.state === filter)
        .filter(r => !q || (client(r.inv.clientId)?.name || '').toLowerCase().includes(q.toLowerCase()) || r.inv.number.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.inv.issueDate.localeCompare(a.inv.issueDate)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [invoices, payments, filter, q, db]);

    const all = invoices.map(inv => ({ state: invoiceState(inv, payments), total: invoiceTotal(inv), paid: invoicePaid(inv, payments) }));
    const open = all.filter(x => ['sent', 'partial', 'overdue'].includes(x.state));
    const openBalance = open.reduce((s, x) => s + x.total - x.paid, 0);
    const overdueBalance = all.filter(x => x.state === 'overdue').reduce((s, x) => s + x.total - x.paid, 0);
    const monthStart = format(new Date(), 'yyyy-MM-01');
    const paidThisMonth = payments.filter(p => p.date >= monthStart).reduce((s, p) => s + (p.kind === 'refund' ? -p.amount : p.amount), 0);

    const selected = invoices.find(i => i.id === openId) || null;

    const syncBookings = (inv: Invoice) => {
        const state = invoiceState(inv, readCollection('payments', companyId));
        mutateDB(d => {
            d.bookings.forEach(b => { if (inv.bookingIds.includes(b.id)) b.paymentStatus = state === 'paid' ? 'paid' : 'unpaid'; });
        });
    };

    const whatsapp = (inv: Invoice) => {
        const c = client(inv.clientId);
        const text = settings.tplInvoice
            .replace('{name}', c?.name || '').replace('{number}', inv.number)
            .replace('{amount}', `${fmt(invoiceTotal(inv))} ${settings.currency}`).replace('{due}', dayLabel(inv.dueDate));
        window.open(`https://wa.me/${(c?.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(text)}`, '_blank');
    };

    const print = (inv: Invoice) => {
        const c = client(inv.clientId);
        const co = db.companies.find(x => x.id === companyId);
        const paid = invoicePaid(inv, payments);
        printHtml(`Invoice ${inv.number}`, `
            <h1>${settings.legalName || co?.name || 'Invoice'}</h1>
            <div class="muted">${settings.taxId ? 'Tax ID ' + settings.taxId : ''}</div>
            <p><b>Invoice ${inv.number}</b><br>Issued ${dayLabel(inv.issueDate)} · Due ${dayLabel(inv.dueDate)}</p>
            <p><b>Bill to</b><br>${c?.name || ''}<br>${c?.address || ''}<br>${c?.phone || ''}</p>
            <table><tr><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr>
            ${inv.items.map(i => `<tr><td>${i.description}</td><td class="r">${i.qty}</td><td class="r">${fmt(i.price)}</td><td class="r">${fmt(i.qty * i.price)}</td></tr>`).join('')}</table>
            <div class="tot"><span>Subtotal</span><span>${fmt(invoiceSubtotal(inv))}</span></div>
            ${inv.discount ? `<div class="tot"><span>Discount</span><span>-${fmt(inv.discount)}</span></div>` : ''}
            ${inv.taxRate ? `<div class="tot"><span>Tax ${inv.taxRate}%</span><span>${fmt(invoiceTax(inv))}</span></div>` : ''}
            <div class="tot big"><span>Total ${settings.currency}</span><span>${fmt(invoiceTotal(inv))}</span></div>
            <div class="tot"><span>Paid</span><span>${fmt(paid)}</span></div>
            <div class="tot big"><span>Balance</span><span>${fmt(invoiceTotal(inv) - paid)}</span></div>
            ${settings.bankDetails ? `<p class="muted"><b>Bank details</b><br>${settings.bankDetails.replace(/\n/g, '<br>')}</p>` : ''}
            <p class="muted">${settings.invoiceFooter}</p>`);
    };

    return (
        <div className="pg">
            <PageHeader title="Invoices and payments" subtitle="Bill clients, record what they pay, and see who still owes you.">
                <button className="btn btn-secondary" onClick={() => downloadCsv('invoices.csv', rows.map(r => ({
                    Number: r.inv.number, Client: client(r.inv.clientId)?.name || '', Issued: r.inv.issueDate, Due: r.inv.dueDate,
                    Total: r.total.toFixed(2), Paid: r.paid.toFixed(2), Status: STATE_LABEL[r.state],
                })))}>Export CSV</button>
                <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={15} /> New invoice</button>
            </PageHeader>

            <div className="kpis">
                <Kpi label="Open balance" value={fmt(openBalance, 0)} unit="QAR" hint={`${open.length} unpaid invoices`} />
                <Kpi label="Overdue" value={fmt(overdueBalance, 0)} unit="QAR" tone={overdueBalance > 0 ? 'bad' : undefined} hint={`${all.filter(x => x.state === 'overdue').length} invoices past due`} />
                <Kpi label="Collected this month" value={fmt(paidThisMonth, 0)} unit="QAR" icon={<Banknote size={16} />} />
                <Kpi label="Invoices issued" value={invoices.length} hint={`${all.filter(x => x.state === 'paid').length} fully paid`} />
            </div>

            <Tabs value={tab} onChange={setTab} tabs={[{ id: 'invoices', label: 'Invoices' }, { id: 'payments', label: 'Payments ledger' }]} />

            {tab === 'invoices' ? (
                <Panel actions={<>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--color-text-tertiary)' }} />
                        <input className="input-field" style={{ paddingLeft: 30 }} placeholder="Search client or number" value={q} onChange={e => setQ(e.target.value)} />
                    </div>
                    <select className="input-field" value={filter} onChange={e => setFilter(e.target.value as typeof filter)}>
                        <option value="all">All statuses</option>
                        {(Object.keys(STATE_LABEL) as InvoiceState[]).map(s => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
                    </select>
                </>}>
                    <Table
                        rows={rows.map(r => ({ id: r.inv.id, ...r }))}
                        empty="No invoices yet. Create one from completed jobs."
                        onRowClick={r => setOpenId(r.id)}
                        cols={[
                            { key: 'n', header: 'Invoice', render: r => <b style={{ fontWeight: 600 }}>{r.inv.number}</b> },
                            { key: 'c', header: 'Client', render: r => client(r.inv.clientId)?.name || 'Unknown' },
                            { key: 'i', header: 'Issued', render: r => dayLabel(r.inv.issueDate) },
                            { key: 'd', header: 'Due', render: r => dayLabel(r.inv.dueDate) },
                            { key: 't', header: 'Total', align: 'r', render: r => `${fmt(r.total)} QAR` },
                            { key: 'b', header: 'Balance', align: 'r', render: r => `${fmt(Math.max(0, r.total - r.paid))} QAR` },
                            { key: 's', header: 'Status', render: r => <Pill tone={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}</Pill> },
                        ]}
                    />
                </Panel>
            ) : (
                <PaymentsLedger companyId={companyId} />
            )}

            <CreateInvoice open={creating} onClose={() => setCreating(false)} companyId={companyId}
                onCreated={id => { setCreating(false); setOpenId(id); }} promos={promos} />

            <Modal open={!!selected} onClose={() => setOpenId(null)} title={selected ? `Invoice ${selected.number}` : ''} width={680}
                footer={selected && (
                    <>
                        {selected.status === 'draft' && <button className="btn btn-secondary" onClick={() => { updateItem('invoices', selected.id, { status: 'sent' }); logActivity(companyId, user?.name || 'Owner', 'Marked invoice as sent', selected.number); }}>Mark as sent</button>}
                        <button className="btn btn-secondary" onClick={() => whatsapp(selected)}><MessageCircle size={15} /> WhatsApp</button>
                        <button className="btn btn-secondary" onClick={() => print(selected)}><Printer size={15} /> Print</button>
                        {selected.status !== 'cancelled' && invoicePaid(selected, payments) === 0 && (
                            <button className="btn btn-secondary" onClick={() => { if (confirm('Cancel this invoice?')) { updateItem('invoices', selected.id, { status: 'cancelled' }); syncBookings({ ...selected, status: 'cancelled' }); logActivity(companyId, user?.name || 'Owner', 'Cancelled invoice', selected.number); } }}>Cancel invoice</button>
                        )}
                        {invoicePaid(selected, payments) === 0 && (
                            <button className="btn btn-danger" onClick={() => { if (confirm('Delete this invoice for good?')) { removeItem('invoices', selected.id); setOpenId(null); } }}>Delete</button>
                        )}
                    </>
                )}>
                {selected && (
                    <InvoiceDetail inv={selected} payments={payments} clientName={client(selected.clientId)?.name || 'Unknown'}
                        onPay={(amount, method, date, reference, kind) => {
                            addItem('payments', companyId, { invoiceId: selected.id, clientId: selected.clientId, amount, method, date, reference, kind });
                            // Re-read so the state reflects the new payment.
                            setTimeout(() => syncBookings(selected), 0);
                            logActivity(companyId, user?.name || 'Owner', kind === 'refund' ? `Refunded ${fmt(amount)} QAR` : `Recorded payment of ${fmt(amount)} QAR`, selected.number);
                        }} />
                )}
            </Modal>
        </div>
    );
};

/* ------------------------ invoice detail ------------------------ */

const InvoiceDetail: React.FC<{
    inv: Invoice; payments: ReturnType<typeof readCollection<'payments'>>; clientName: string;
    onPay: (amount: number, method: PayMethod, date: string, reference: string, kind: 'payment' | 'refund') => void;
}> = ({ inv, payments, clientName, onPay }) => {
    const total = invoiceTotal(inv), paid = invoicePaid(inv, payments), balance = total - paid;
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState<PayMethod>('cash');
    const [date, setDate] = useState(today());
    const [ref, setRef] = useState('');
    const list = payments.filter(p => p.invoiceId === inv.id).sort((a, b) => a.date.localeCompare(b.date));
    const state = invoiceState(inv, payments);
    return (
        <div className="stack">
            <div className="row" style={{ border: 0, padding: 0 }}>
                <div><b style={{ fontWeight: 600 }}>{clientName}</b><div className="sub">Issued {dayLabel(inv.issueDate)} · Due {dayLabel(inv.dueDate)}</div></div>
                <Pill tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Pill>
            </div>
            <Table rows={inv.items.map((i, n) => ({ id: String(n), ...i }))} cols={[
                { key: 'description', header: 'Description' },
                { key: 'qty', header: 'Qty', align: 'r' },
                { key: 'price', header: 'Price', align: 'r', render: r => fmt(r.price) },
                { key: 'a', header: 'Amount', align: 'r', render: r => fmt(r.qty * r.price) },
            ]} />
            <div style={{ marginLeft: 'auto', minWidth: 240 }}>
                <div className="row"><span className="muted">Subtotal</span><span>{fmt(invoiceSubtotal(inv))}</span></div>
                {inv.discount > 0 && <div className="row"><span className="muted">Discount</span><span>-{fmt(inv.discount)}</span></div>}
                {inv.taxRate > 0 && <div className="row"><span className="muted">Tax {inv.taxRate}%</span><span>{fmt(invoiceTax(inv))}</span></div>}
                <div className="row"><b style={{ fontWeight: 600 }}>Total</b><b style={{ fontWeight: 600 }}>{fmt(total)} QAR</b></div>
                <div className="row"><span className="muted">Paid</span><span>{fmt(paid)}</span></div>
                <div className="row"><b style={{ fontWeight: 600 }}>Balance</b><b className={balance > 0.005 ? 'tone-warn' : 'tone-good'} style={{ fontWeight: 600 }}>{fmt(balance)} QAR</b></div>
            </div>

            {list.length > 0 && (
                <div>
                    <b style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Payments</b>
                    {list.map(p => (
                        <div className="row" key={p.id}>
                            <span>{dayLabel(p.date)} · {METHODS.find(m => m.value === p.method)?.label}{p.reference ? ` · ${p.reference}` : ''}</span>
                            <span className={p.kind === 'refund' ? 'tone-bad' : ''}>{p.kind === 'refund' ? '-' : ''}{fmt(p.amount)} QAR</span>
                        </div>
                    ))}
                </div>
            )}

            {inv.status !== 'cancelled' && inv.status !== 'draft' && (
                <div className="stack" style={{ background: 'var(--color-bg-body)', padding: '1rem', borderRadius: 14 }}>
                    <b style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Record a payment or refund</b>
                    <div className="frow">
                        <Field label="Amount (QAR)" half><input type="number" step="any" value={amount} placeholder={balance > 0 ? balance.toFixed(2) : '0.00'} onChange={e => setAmount(e.target.value)} /></Field>
                        <Field label="Method" half><select value={method} onChange={e => setMethod(e.target.value as PayMethod)}>{METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
                        <Field label="Date" half><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
                        <Field label="Reference" half><input value={ref} placeholder="Receipt or transfer no." onChange={e => setRef(e.target.value)} /></Field>
                    </div>
                    <div className="toolbar">
                        <button className="btn btn-primary" onClick={() => {
                            const a = Number(amount || balance);
                            if (!(a > 0)) return alert('Enter an amount above zero.');
                            onPay(a, method, date, ref, 'payment'); setAmount(''); setRef('');
                        }}>Record payment</button>
                        {paid > 0 && <button className="btn btn-secondary" onClick={() => {
                            const a = Number(amount);
                            if (!(a > 0) || a > paid) return alert('Enter a refund amount up to what was paid.');
                            onPay(a, method, date, ref, 'refund'); setAmount(''); setRef('');
                        }}>Refund</button>}
                    </div>
                </div>
            )}
            {inv.status === 'draft' && <div className="tiny">This is a draft. Mark it as sent to start recording payments.</div>}
        </div>
    );
};

/* ------------------------ ledger ------------------------ */

const PaymentsLedger: React.FC<{ companyId: string }> = ({ companyId }) => {
    const { items } = useCollection('payments', companyId);
    const { items: invoices } = useCollection('invoices', companyId);
    const db = useDB();
    const rows = [...items].sort((a, b) => b.date.localeCompare(a.date));
    const byMethod = METHODS.map(m => ({ ...m, total: items.filter(p => p.method === m.value).reduce((s, p) => s + (p.kind === 'refund' ? -p.amount : p.amount), 0) }));
    return (
        <div className="stack">
            <div className="kpis">{byMethod.map(m => <Kpi key={m.value} label={m.label} value={fmt(m.total, 0)} unit="QAR" />)}</div>
            <Panel title="All payments" actions={<button className="btn btn-secondary btn-sm" onClick={() => downloadCsv('payments.csv', rows.map(p => ({
                Date: p.date, Type: p.kind, Method: p.method, Amount: p.amount, Invoice: invoices.find(i => i.id === p.invoiceId)?.number || p.reference || '', Client: db.clients.find(c => c.id === p.clientId)?.name || '', Reference: p.reference || '',
            })))}>Export CSV</button>}>
                {rows.length === 0 ? <Empty>No payments recorded yet.</Empty> : (
                    <Table rows={rows} cols={[
                        { key: 'd', header: 'Date', render: p => dayLabel(p.date) },
                        { key: 'i', header: 'Invoice or contract', render: p => invoices.find(i => i.id === p.invoiceId)?.number || p.reference || '-' },
                        { key: 'c', header: 'Client', render: p => db.clients.find(c => c.id === p.clientId)?.name || '-' },
                        { key: 'm', header: 'Method', render: p => METHODS.find(m => m.value === p.method)?.label },
                        { key: 'k', header: 'Type', render: p => <Pill tone={p.kind === 'refund' ? 'bad' : 'good'}>{p.kind === 'refund' ? 'Refund' : 'Payment'}</Pill> },
                        { key: 'a', header: 'Amount', align: 'r', render: p => `${p.kind === 'refund' ? '-' : ''}${fmt(p.amount)} QAR` },
                    ]} />
                )}
            </Panel>
        </div>
    );
};

/* ------------------------ create invoice ------------------------ */

const CreateInvoice: React.FC<{
    open: boolean; onClose: () => void; companyId: string; onCreated: (id: string) => void;
    promos: ReturnType<typeof readCollection<'promos'>>;
}> = ({ open, onClose, companyId, onCreated, promos }) => {
    const db = useDB();
    const { settings } = useSettings(companyId);
    const { items: invoices } = useCollection('invoices', companyId);
    const [clientId, setClientId] = useState('');
    const [picked, setPicked] = useState<string[]>([]);
    const [custom, setCustom] = useState<InvoiceItem[]>([]);
    const [discount, setDiscount] = useState('0');
    const [promo, setPromo] = useState('');
    const [due, setDue] = useState('');
    const [notes, setNotes] = useState('');

    const invoiced = new Set(invoices.filter(i => i.status !== 'cancelled').flatMap(i => i.bookingIds));
    const available = db.bookings.filter(b => b.companyId === companyId && b.clientId === clientId && b.status === 'completed' && !invoiced.has(b.id));
    const svc = (id: string) => db.services.find(s => s.id === id)?.name || 'Cleaning';

    const reset = () => { setClientId(''); setPicked([]); setCustom([]); setDiscount('0'); setPromo(''); setDue(''); setNotes(''); };
    const items: InvoiceItem[] = [
        ...available.filter(b => picked.includes(b.id)).map(b => ({ description: `${svc(b.serviceId)} on ${dayLabel(b.date)}`, qty: 1, price: b.price })),
        ...custom.filter(c => c.description),
    ];
    const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
    const code = promos.find(p => p.code.toLowerCase() === promo.trim().toLowerCase() && String(p.active) !== 'false' && p.expiry >= today() && p.used < p.maxUses);
    const promoValue = code ? (code.type === 'percent' ? subtotal * code.value / 100 : code.value) : 0;
    const totalDiscount = Math.min(subtotal, Number(discount || 0) + promoValue);

    const create = (status: 'draft' | 'sent') => {
        if (!clientId) return alert('Choose a client.');
        if (!items.length) return alert('Add at least one job or line item.');
        const issue = today();
        const inv = addItem('invoices', companyId, {
            number: nextNumber(settings.invoicePrefix, invoices.map(i => i.number)), clientId, bookingIds: picked.filter(id => available.some(b => b.id === id)),
            issueDate: issue, dueDate: due || format(addDays(parseISO(issue), settings.paymentTermsDays), 'yyyy-MM-dd'),
            items, discount: totalDiscount, taxRate: settings.taxRate, notes, status,
        });
        if (code) updateItem('promos', code.id, { used: code.used + 1 });
        logActivity(companyId, 'Owner', 'Created invoice', inv.number);
        reset();
        onCreated(inv.id);
    };

    return (
        <Modal open={open} onClose={() => { reset(); onClose(); }} title="New invoice" width={640}
            footer={<>
                <button className="btn btn-secondary" onClick={() => create('draft')}>Save as draft</button>
                <button className="btn btn-primary" onClick={() => create('sent')}>Create and send</button>
            </>}>
            <div className="frow">
                <Field label="Client">
                    <select value={clientId} onChange={e => { setClientId(e.target.value); setPicked([]); }}>
                        <option value="">Choose a client</option>
                        {db.clients.filter(c => c.companyId === companyId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </Field>
            </div>
            {clientId && (
                <div>
                    <b style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Completed jobs not yet invoiced</b>
                    {available.length === 0 ? <div className="tiny" style={{ marginTop: 6 }}>No uninvoiced completed jobs for this client. Add a custom line below.</div> : available.map(b => (
                        <label className="check" key={b.id}>
                            <input type="checkbox" checked={picked.includes(b.id)} onChange={e => setPicked(e.target.checked ? [...picked, b.id] : picked.filter(x => x !== b.id))} />
                            <span style={{ flex: 1 }}>{svc(b.serviceId)} · {dayLabel(b.date)}</span><span>{fmt(b.price)} QAR</span>
                        </label>
                    ))}
                </div>
            )}
            <div>
                <b style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Custom lines</b>
                {custom.map((c, i) => (
                    <div className="frow" key={i} style={{ marginTop: 8, flexWrap: 'nowrap' }}>
                        <input className="input-field" style={{ flex: 3 }} placeholder="Description" value={c.description} onChange={e => setCustom(custom.map((x, n) => n === i ? { ...x, description: e.target.value } : x))} />
                        <input className="input-field" style={{ flex: 1 }} type="number" min={1} value={c.qty} onChange={e => setCustom(custom.map((x, n) => n === i ? { ...x, qty: Number(e.target.value) } : x))} />
                        <input className="input-field" style={{ flex: 1 }} type="number" step="any" value={c.price} onChange={e => setCustom(custom.map((x, n) => n === i ? { ...x, price: Number(e.target.value) } : x))} />
                        <button className="btn btn-ghost btn-sm" onClick={() => setCustom(custom.filter((_, n) => n !== i))} aria-label="Remove line">×</button>
                    </div>
                ))}
                <div style={{ marginTop: 8 }}><button className="btn btn-secondary btn-sm" onClick={() => setCustom([...custom, { description: '', qty: 1, price: 0 }])}><Plus size={13} /> Add line</button></div>
            </div>
            <div className="frow">
                <Field label="Discount (QAR)" half><input type="number" step="any" value={discount} onChange={e => setDiscount(e.target.value)} /></Field>
                <Field label="Promo code" half hint={promo ? (code ? `Applies ${fmt(promoValue)} QAR off` : 'Code not valid') : undefined}><input value={promo} onChange={e => setPromo(e.target.value)} placeholder="e.g. WELCOME10" /></Field>
                <Field label="Due date" half hint={`Default: ${settings.paymentTermsDays} days from today`}><input type="date" value={due} onChange={e => setDue(e.target.value)} /></Field>
                <Field label="Notes" half><input value={notes} onChange={e => setNotes(e.target.value)} /></Field>
            </div>
            <div style={{ marginLeft: 'auto', minWidth: 240 }}>
                <div className="row"><span className="muted">Subtotal</span><span>{fmt(subtotal)}</span></div>
                <div className="row"><span className="muted">Discount</span><span>-{fmt(totalDiscount)}</span></div>
                {settings.taxRate > 0 && <div className="row"><span className="muted">Tax {settings.taxRate}%</span><span>{fmt((subtotal - totalDiscount) * settings.taxRate / 100)}</span></div>}
                <div className="row"><b style={{ fontWeight: 600 }}>Total</b><b style={{ fontWeight: 600 }}>{fmt((subtotal - totalDiscount) * (1 + settings.taxRate / 100))} QAR</b></div>
            </div>
        </Modal>
    );
};
