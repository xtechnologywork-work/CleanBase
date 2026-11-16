import React, { useEffect, useState } from 'react';
import { today } from '../../services/erp';
import { PLAN_LABEL, recordPlatformPayment } from '../../services/platform';
import type { Tenant } from '../../services/platform';
import type { PlatformPayment } from '../../types';
import { Field, Modal } from '../shared/ui';

/** Record a subscription payment from a tenant. It can extend the license by the months paid for. */
export const PaymentModal: React.FC<{ open: boolean; onClose: () => void; tenants: Tenant[]; tenantId?: string }> = ({ open, onClose, tenants, tenantId }) => {
    const [tenant, setTenant] = useState('');
    const [months, setMonths] = useState('1');
    const [amount, setAmount] = useState('');
    const [touched, setTouched] = useState(false);
    const [method, setMethod] = useState<PlatformPayment['method']>('bank');
    const [date, setDate] = useState(today());
    const [reference, setReference] = useState('');
    const [note, setNote] = useState('');

    useEffect(() => {
        if (!open) return;
        const id = tenantId || tenants[0]?.company.id || '';
        setTenant(id); setMonths('1'); setTouched(false); setMethod('bank'); setDate(today()); setReference(''); setNote('');
        const t = tenants.find(x => x.company.id === id);
        setAmount(String(t?.mrr ?? 0));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, tenantId]);

    const t = tenants.find(x => x.company.id === tenant);
    const recalc = (nextTenant: string, nextMonths: string) => {
        if (touched) return;
        const tt = tenants.find(x => x.company.id === nextTenant);
        setAmount(String(Math.round((tt?.mrr ?? 0) * (Number(nextMonths) || 0) * 100) / 100));
    };

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const a = Number(amount);
        if (!tenant) return alert('Choose a tenant.');
        if (!(a > 0)) return alert('Enter an amount above zero.');
        recordPlatformPayment({ tenantId: tenant, amount: a, method, date, months: Number(months) || 0, reference: reference || undefined, note: note || undefined });
        onClose();
    };

    return (
        <Modal open={open} onClose={onClose} title="Record a payment" width={520}>
            <form onSubmit={submit} className="stack">
                <div className="frow">
                    <Field label="Tenant">
                        <select value={tenant} onChange={e => { setTenant(e.target.value); recalc(e.target.value, months); }}>
                            {tenants.map(x => <option key={x.company.id} value={x.company.id}>{x.company.name || x.company.id}</option>)}
                        </select>
                    </Field>
                    <Field label="Period paid for" half hint={t ? `${PLAN_LABEL[t.plan]}, ${t.mrr} QAR per month` : undefined}>
                        <select value={months} onChange={e => { setMonths(e.target.value); recalc(tenant, e.target.value); }}>
                            <option value="0">Do not change the license</option>
                            <option value="1">1 month</option><option value="3">3 months</option><option value="6">6 months</option><option value="12">12 months</option>
                        </select>
                    </Field>
                    <Field label="Amount (QAR)" half><input type="number" step="any" value={amount} onChange={e => { setTouched(true); setAmount(e.target.value); }} required /></Field>
                    <Field label="Method" half>
                        <select value={method} onChange={e => setMethod(e.target.value as PlatformPayment['method'])}>
                            <option value="bank">Bank transfer</option><option value="cash">Cash</option><option value="card">Card</option><option value="other">Other</option>
                        </select>
                    </Field>
                    <Field label="Date" half><input type="date" value={date} onChange={e => setDate(e.target.value)} required /></Field>
                    <Field label="Reference"><input value={reference} placeholder="Transfer or receipt number" onChange={e => setReference(e.target.value)} /></Field>
                    <Field label="Note"><input value={note} onChange={e => setNote(e.target.value)} /></Field>
                </div>
                {Number(months) > 0 && t && (
                    <div className="tiny">The license will be extended by {months} month(s) from {t.licenseUntil && t.licenseUntil >= today() ? t.licenseUntil : 'today'}.</div>
                )}
                <div className="modal-f" style={{ padding: 0 }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn-primary">Record payment</button>
                </div>
            </form>
        </Modal>
    );
};
