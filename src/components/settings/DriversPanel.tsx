import React, { useMemo, useState } from 'react';
import { Check, Copy, Eye, EyeOff, ExternalLink, MessageCircle, Plus, Shuffle, Trash2 } from 'lucide-react';
import { useDB } from '../../services/erp';
import { generatePassword } from '../../services/adminAuth';
import { createDriver, deleteDriver, setDriverPassword } from '../../services/driverAdmin';
import { DRIVER_PASSWORD_MIN, driverDigits, driverLoginUrl, driverWelcomeMessage, prettyPhone } from '../../services/driverAccounts';
import { whatsappUrl } from '../../services/bookingMessages';
import { Modal } from '../shared/ui';
import type { User } from '../../types';

/** What the owner sends to a driver after creating the account or changing the password. */
interface Credentials { name: string; phone: string; password: string; title: string }

const err: React.CSSProperties = { color: 'var(--color-danger)', fontSize: '0.875rem', margin: '4px 0 0' };

/** Settings tab: the company's drivers. Each driver signs in with a phone number and a password on this company's own driver page. */
export const DriversPanel: React.FC<{ companyId: string; companyName: string; actor: string }> = ({ companyId, companyName, actor }) => {
    const db = useDB();
    const drivers = useMemo(() => db.users.filter(u => u.companyId === companyId && u.role === 'driver')
        .map(u => ({ user: u, phone: db.staff.find(s => s.userId === u.id)?.phone || '' }))
        .sort((a, b) => a.user.name.localeCompare(b.user.name)), [db, companyId]);

    const link = driverLoginUrl(companyId);
    const [copied, setCopied] = useState('');
    const copy = (key: string, text: string) => { void navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1600); };

    const [adding, setAdding] = useState(false);
    const [pwFor, setPwFor] = useState<User | null>(null);
    const [creds, setCreds] = useState<Credentials | null>(null);
    const [notice, setNotice] = useState('');
    const [busyId, setBusyId] = useState('');

    const remove = async (u: User) => {
        if (!window.confirm(`Remove ${u.name}? Their login stops working and their rides are deleted.`)) return;
        setBusyId(u.id);
        const r = await deleteDriver(companyId, u.id, actor);
        setBusyId('');
        setNotice(r.ok ? `${u.name} was removed.` : r.error || 'Could not remove the driver.');
        setTimeout(() => setNotice(''), 4000);
    };

    return (
        <div className="stack">
            <div className="card" style={{ padding: '1.75rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>Driver login page</h2>
                <p style={{ margin: '0.2rem 0 1rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                    This page belongs to your company only. Your drivers open it on their phone, sign in with their phone number and password, and see only the driver app.
                </p>
                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                    <code style={{ flex: 1, minWidth: 220, wordBreak: 'break-all', fontSize: '0.8125rem', background: 'var(--color-bg-subtle)', padding: '0.55rem 0.75rem', borderRadius: 10 }}>{link}</code>
                    <span className="toolbar">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy('link', link)}>{copied === 'link' ? <Check size={14} /> : <Copy size={14} />} {copied === 'link' ? 'Copied' : 'Copy link'}</button>
                        <a className="btn btn-secondary btn-sm" href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open</a>
                    </span>
                </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid var(--color-border)' }}>
                    <div>
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>Drivers ({drivers.length})</h2>
                        <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Add as many drivers as you need. Each one gets their own phone number and password.</p>
                    </div>
                    <button className="btn btn-primary" onClick={() => setAdding(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', padding: '0.45rem 0.85rem' }}>
                        <Plus size={14} /> <span>Add driver</span>
                    </button>
                </div>
                {notice && <div role="status" style={{ padding: '0.6rem 1.5rem', fontSize: '0.8125rem', background: 'var(--color-bg-subtle)' }}>{notice}</div>}
                {drivers.length === 0 ? (
                    <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                        No drivers yet. Press Add driver, type the name, the phone number and a password.
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'start', fontSize: '0.8125rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-subtle)' }}>
                                    <th style={{ padding: '0.75rem 1.25rem', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Driver</th>
                                    <th style={{ padding: '0.75rem 1.25rem', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Phone (login)</th>
                                    <th style={{ padding: '0.75rem 1.25rem', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'end' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {drivers.map(({ user: u, phone }) => (
                                    <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <td style={{ padding: '0.875rem 1.25rem', fontWeight: 600 }}>{u.name}</td>
                                        <td style={{ padding: '0.875rem 1.25rem', color: 'var(--color-text-secondary)' }} dir="ltr">{prettyPhone(driverDigits(phone)) || phone || '-'}</td>
                                        <td style={{ padding: '0.875rem 1.25rem', textAlign: 'end' }}>
                                            <span className="toolbar" style={{ justifyContent: 'flex-end' }}>
                                                <button className="btn btn-secondary btn-sm" onClick={() => setPwFor(u)} disabled={busyId === u.id}>Set password</button>
                                                <button className="btn btn-secondary btn-sm" onClick={() => void remove(u)} disabled={busyId === u.id} aria-label={`Remove ${u.name}`} style={{ color: '#d70015' }}><Trash2 size={13} /></button>
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {adding && <AddDriver companyId={companyId} actor={actor} onClose={() => setAdding(false)}
                onDone={c => { setAdding(false); setCreds(c); }} />}
            {pwFor && <PasswordForm companyId={companyId} actor={actor} person={pwFor} onClose={() => setPwFor(null)}
                onDone={c => { setPwFor(null); setCreds(c); }} />}
            {creds && <CredentialsView creds={creds} companyName={companyName} link={link} onClose={() => setCreds(null)} />}
        </div>
    );
};

/* ------------------------------ add a driver ------------------------------ */

const PasswordField: React.FC<{ value: string; onChange: (v: string) => void; id: string }> = ({ value, onChange, id }) => {
    const [show, setShow] = useState(true);
    return (
        <div className="toolbar" style={{ flexWrap: 'nowrap' }}>
            <input id={id} type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} autoComplete="new-password" required minLength={DRIVER_PASSWORD_MIN} maxLength={72} style={{ flex: 1 }} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={14} /> : <Eye size={14} />}</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { onChange(generatePassword(8)); setShow(true); }} aria-label="Generate a password"><Shuffle size={14} /></button>
        </div>
    );
};

const AddDriver: React.FC<{ companyId: string; actor: string; onClose: () => void; onDone: (c: Credentials) => void }> = ({ companyId, actor, onClose, onDone }) => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState(() => generatePassword(8));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    // +974 is already in front, so a local driver types only the 8 digits. A number typed with + (or with more digits) is used as it is.
    const international = phone.trim().startsWith('+') || phone.replace(/\D/g, '').length > 8;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true); setError('');
        const r = await createDriver({ companyId, name, phone, password, actor });
        setBusy(false);
        if (!r.ok) { setError(r.error || 'Could not add the driver.'); return; }
        onDone({ name: name.trim(), phone: prettyPhone(driverDigits(phone)), password, title: 'Driver added' });
    };

    return (
        <Modal open title="Add a driver" onClose={() => { if (!busy) onClose(); }} width={520}>
            <form onSubmit={submit} className="stack">
                <div className="frow">
                    <div className="fld"><label htmlFor="drv-name">Full name</label>
                        <input id="drv-name" value={name} onChange={e => { setName(e.target.value); setError(''); }} required maxLength={80} autoComplete="off" placeholder="e.g. Omar Hassan" /></div>
                    <div className="fld"><label htmlFor="drv-phone">Phone number (the login)</label>
                        <div style={{ display: 'flex', alignItems: 'stretch', direction: 'ltr' }}>
                            {!international && <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 0.75rem', border: '1px solid var(--color-border-hover)', borderInlineEnd: 0, borderRadius: '12px 0 0 12px', background: 'var(--color-bg-subtle)', fontWeight: 600 }}>+974</span>}
                            <input id="drv-phone" type="tel" inputMode="tel" autoComplete="off" required value={phone} style={{ flex: 1, ...(international ? {} : { borderRadius: '0 12px 12px 0' }) }}
                                placeholder={international ? '+44 7911 123456' : '5512 3456'} onChange={e => { setPhone(e.target.value); setError(''); }} />
                        </div>
                        <small>The driver types this number to sign in. A number from another country: start with + and the country code.</small></div>
                    <div className="fld"><label htmlFor="drv-pass">Password</label>
                        <PasswordField id="drv-pass" value={password} onChange={v => { setPassword(v); setError(''); }} />
                        <small>At least {DRIVER_PASSWORD_MIN} characters. You can send it to the driver on WhatsApp in the next step.</small></div>
                </div>
                {error && <p role="alert" style={err}>{error}</p>}
                <div className="modal-f" style={{ padding: 0 }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={busy || password.length < DRIVER_PASSWORD_MIN}>{busy ? 'Adding...' : 'Add driver'}</button>
                </div>
            </form>
        </Modal>
    );
};

const PasswordForm: React.FC<{ companyId: string; actor: string; person: User; onClose: () => void; onDone: (c: Credentials) => void }> = ({ companyId, actor, person, onClose, onDone }) => {
    const db = useDB();
    const phone = db.staff.find(s => s.userId === person.id)?.phone || '';
    const [password, setPassword] = useState(() => generatePassword(8));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true); setError('');
        const r = await setDriverPassword(companyId, person.id, password, actor);
        setBusy(false);
        if (!r.ok) { setError(r.error || 'Could not change the password.'); return; }
        onDone({ name: person.name, phone: prettyPhone(driverDigits(phone)) || phone, password, title: 'Password changed' });
    };
    return (
        <Modal open title={`New password for ${person.name}`} onClose={() => { if (!busy) onClose(); }} width={480}>
            <form onSubmit={submit} className="stack">
                <div className="tiny" style={{ background: 'var(--color-bg-body)', padding: '0.75rem 1rem', borderRadius: 12 }}>
                    The old password stops working at once. The current password can never be shown: set a new one and give it to the driver.
                </div>
                <div className="fld"><label htmlFor="drv-newpass">New password</label><PasswordField id="drv-newpass" value={password} onChange={v => { setPassword(v); setError(''); }} /></div>
                {error && <p role="alert" style={err}>{error}</p>}
                <div className="modal-f" style={{ padding: 0 }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={busy || password.length < DRIVER_PASSWORD_MIN}>{busy ? 'Saving...' : 'Set password'}</button>
                </div>
            </form>
        </Modal>
    );
};

/** After the account is ready: the details to give the driver, once. The password is not shown again after this window closes. */
const CredentialsView: React.FC<{ creds: Credentials; companyName: string; link: string; onClose: () => void }> = ({ creds, companyName, link, onClose }) => {
    const [copied, setCopied] = useState(false);
    const text = driverWelcomeMessage({ name: creds.name, company: companyName, link, phone: creds.phone, password: creds.password });
    const digits = driverDigits(creds.phone);
    return (
        <Modal open title={creds.title} onClose={onClose} width={520}>
            <div className="stack">
                <div className="stack" style={{ background: 'var(--color-success-bg)', padding: '1rem', borderRadius: 14 }}>
                    <b className="tone-good" style={{ fontWeight: 600 }}>{creds.name} can sign in now</b>
                    <div className="tiny" style={{ color: 'var(--color-text-secondary)' }}>Give these details to the driver. For safety the password is not shown again after you close this window.</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', alignItems: 'center', fontSize: '0.9375rem' }}>
                        <span className="tiny">Page</span><code style={{ wordBreak: 'break-all' }}>{link}</code>
                        <span className="tiny">Phone</span><code dir="ltr" style={{ justifySelf: 'start' }}>{creds.phone}</code>
                        <span className="tiny">Password</span><code style={{ justifySelf: 'start', fontSize: '1.0625rem', fontWeight: 600 }}>{creds.password}</code>
                    </div>
                </div>
                <div className="toolbar">
                    {digits && <a className="btn btn-primary" href={whatsappUrl(digits, text)} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} /> Send on WhatsApp</a>}
                    <button type="button" className="btn btn-secondary" onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>
                        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy the message'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Done</button>
                </div>
            </div>
        </Modal>
    );
};
