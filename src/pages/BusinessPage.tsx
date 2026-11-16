import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Check } from 'lucide-react';
import { DEFAULT_REVIEW_TEMPLATE, useSettings } from '../services/erp';
import type { BizSettings } from '../services/erp';
import { ALL_PAGES, ROLE_PAGES } from '../services/permissions';
import { roleLabel } from '../services/erp';
import { Field, PageHeader, Panel } from '../components/shared/ui';
import { isCloud } from '../services/backend';
import { exportCompany, importLegacyCompany, listLegacyCompanies } from '../services/dataTransfer';
import type { UserRole } from '../types';

export const BusinessPage: React.FC = () => {
    const { user } = useAuth();
    const companyId = user?.companyId || '';
    const { settings, save } = useSettings(companyId);
    const [f, setF] = useState<BizSettings>(settings);
    const [saved, setSaved] = useState(false);
    const stamp = JSON.stringify(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { setF(settings); }, [stamp]);

    const set = <K extends keyof BizSettings>(k: K, v: BizSettings[K]) => { setF({ ...f, [k]: v }); setSaved(false); };
    const roles: UserRole[] = ['companyadmin', 'manager', 'dispatcher', 'accountant', 'cleaner'];
    const [legacyPick, setLegacyPick] = useState('');
    const [importMsg, setImportMsg] = useState('');
    const legacy = listLegacyCompanies();
    const origin = window.location.origin;
    const bookingLink = `${origin}/book?c=${companyId}`;
    const portalLink = `${origin}/portal?c=${companyId}`;

    return (
        <div className="pg">
            <PageHeader title="Business rules" subtitle="Invoice details, booking rules, message templates and who can see what.">
                <button className="btn btn-primary" onClick={() => { const { id: _i, companyId: _c, createdAt: _t, ...rest } = f; void _i; void _c; void _t; save(rest); setSaved(true); }}>
                    {saved ? 'Saved' : 'Save changes'}
                </button>
            </PageHeader>

            <div className="grid2e">
                <Panel title="Invoices and tax" subtitle="Printed on every invoice">
                    <div className="frow">
                        <Field label="Legal business name"><input value={f.legalName} onChange={e => set('legalName', e.target.value)} /></Field>
                        <Field label="Tax or commercial registration no." half><input value={f.taxId} onChange={e => set('taxId', e.target.value)} /></Field>
                        <Field label="Tax rate (%)" half hint="Use 0 if you do not charge tax"><input type="number" step="any" value={f.taxRate} onChange={e => set('taxRate', Number(e.target.value))} /></Field>
                        <Field label="Invoice prefix" half><input value={f.invoicePrefix} onChange={e => set('invoicePrefix', e.target.value)} /></Field>
                        <Field label="Payment terms (days)" half><input type="number" value={f.paymentTermsDays} onChange={e => set('paymentTermsDays', Number(e.target.value))} /></Field>
                        <Field label="Bank details"><textarea value={f.bankDetails} placeholder="Bank, account name, IBAN" onChange={e => set('bankDetails', e.target.value)} /></Field>
                        <Field label="Invoice footer"><input value={f.invoiceFooter} onChange={e => set('invoiceFooter', e.target.value)} /></Field>
                    </div>
                </Panel>
                <Panel title="Booking rules" subtitle="Working hours and notice periods your team follows">
                    <div className="frow">
                        <Field label="Day starts" half><input type="time" value={f.workStart} onChange={e => set('workStart', e.target.value)} /></Field>
                        <Field label="Day ends" half><input type="time" value={f.workEnd} onChange={e => set('workEnd', e.target.value)} /></Field>
                        <Field label="Minimum notice (hours)" half><input type="number" value={f.minNoticeHours} onChange={e => set('minNoticeHours', Number(e.target.value))} /></Field>
                        <Field label="Free cancellation until (hours before)" half><input type="number" value={f.cancellationHours} onChange={e => set('cancellationHours', Number(e.target.value))} /></Field>
                        <Field label="Currency" half><input value={f.currency} onChange={e => set('currency', e.target.value)} /></Field>
                        <Field label="Time zone" half hint="Used by the booking store, for example Asia/Qatar"><input value={f.timezone ?? 'Asia/Qatar'} list="tz-list" onChange={e => set('timezone', e.target.value)} />
                            <datalist id="tz-list">{['Asia/Qatar', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Kuwait', 'Asia/Bahrain', 'Asia/Muscat', 'Africa/Casablanca', 'Africa/Cairo', 'Europe/London'].map(z => <option key={z} value={z} />)}</datalist></Field>
                        <Field label="Clients can book up to (days ahead)" half><input type="number" min="1" max="365" value={f.bookingDays ?? 60} onChange={e => set('bookingDays', Number(e.target.value))} /></Field>
                    </div>
                </Panel>
            </div>

            <Panel title="Message templates" subtitle="Used when you share an invoice or booking by WhatsApp. Placeholders: {name} {service} {date} {time} {number} {amount} {due}">
                <div className="frow">
                    <Field label="Booking confirmation"><textarea value={f.tplConfirmation} onChange={e => set('tplConfirmation', e.target.value)} /></Field>
                    <Field label="Reminder"><textarea value={f.tplReminder} onChange={e => set('tplReminder', e.target.value)} /></Field>
                    <Field label="Invoice"><textarea value={f.tplInvoice} onChange={e => set('tplInvoice', e.target.value)} /></Field>
                    <Field label="Review request" hint="Sent with the private review link. Placeholders: {name} {company} {service} {date} {link}"><textarea value={f.tplReview ?? DEFAULT_REVIEW_TEMPLATE} onChange={e => set('tplReview', e.target.value)} /></Field>
                </div>
            </Panel>

            <Panel title="Booking links and your data" subtitle="Share the links with clients. Export a full copy of your company data at any time.">
                <div className="stack">
                    <div className="row">
                        <div><b style={{ fontWeight: 600 }}>Booking store</b><div className="sub" style={{ wordBreak: 'break-all' }}>{bookingLink}</div></div>
                        <button className="btn btn-secondary btn-sm" onClick={() => { void navigator.clipboard.writeText(bookingLink); }}>Copy link</button>
                    </div>
                    <div className="row">
                        <div><b style={{ fontWeight: 600 }}>Client portal</b><div className="sub" style={{ wordBreak: 'break-all' }}>{portalLink}</div></div>
                        <button className="btn btn-secondary btn-sm" onClick={() => { void navigator.clipboard.writeText(portalLink); }}>Copy link</button>
                    </div>
                    <div className="row">
                        <div><b style={{ fontWeight: 600 }}>Export company data</b><div className="sub">Everything in one JSON file: clients, bookings, invoices, payroll and more.</div></div>
                        <button className="btn btn-secondary btn-sm" onClick={() => { void exportCompany(companyId); }}>Download export</button>
                    </div>
                    {isCloud && legacy.length > 0 && (
                        <div style={{ background: 'var(--color-bg-body)', padding: '1rem', borderRadius: 14 }}>
                            <b style={{ fontWeight: 600 }}>Bring in data from this browser</b>
                            <div className="sub" style={{ margin: '4px 0 10px' }}>Data you entered before the online version is still in this browser. Choose a company to copy into your account. Nothing is deleted here.</div>
                            <div className="toolbar">
                                <select className="input-field" value={legacyPick} onChange={e => setLegacyPick(e.target.value)}>
                                    <option value="">Choose a company</option>
                                    {legacy.map(l => <option key={l.id} value={l.id}>{l.name} ({l.bookings} bookings, {l.clients} clients, {l.staff} staff)</option>)}
                                </select>
                                <button className="btn btn-primary btn-sm" disabled={!legacyPick} onClick={() => {
                                    if (!confirm('Copy this company data into your account?')) return;
                                    const r = importLegacyCompany(legacyPick, companyId);
                                    setImportMsg(`Imported ${r.imported} records (${r.skipped} skipped). Team members must sign up with their email to log in.`);
                                }}>Import</button>
                            </div>
                            {importMsg && <div className="tiny" style={{ marginTop: 8 }} role="status">{importMsg}</div>}
                        </div>
                    )}
                </div>
            </Panel>

            <Panel title="Roles and permissions" subtitle="Add people and choose their role under Settings, then team. This is what each role can open.">
                <div className="tbl-wrap">
                    <table className="tbl">
                        <thead><tr><th>Page</th>{roles.map(r => <th key={r} style={{ textAlign: 'center' }}>{roleLabel(r)}</th>)}</tr></thead>
                        <tbody>
                            {ALL_PAGES.map(p => (
                                <tr key={p.key}>
                                    <td>{p.label}</td>
                                    {roles.map(r => <td key={r} style={{ textAlign: 'center' }}>{(ROLE_PAGES[r] || []).includes(p.key) ? <Check size={16} color="var(--color-success)" aria-label="Allowed" /> : <span className="tiny" aria-label="Not allowed">-</span>}</td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Panel>
        </div>
    );
};
