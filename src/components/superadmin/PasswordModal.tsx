import React, { useState } from 'react';
import { Check, Copy, Eye, EyeOff, Shuffle } from 'lucide-react';
import { isCloud } from '../../services/backend';
import { generatePassword, readDemoPassword, setUserPassword } from '../../services/adminAuth';
import type { User } from '../../types';
import { Field, Modal } from '../shared/ui';

/** Platform admin sets a new password for a person. The old one can never be shown (only a hash is stored). */
/** Keyed by person so every open starts with a fresh suggested password and a clean result. */
export const PasswordModal: React.FC<{ person: User | null; onClose: () => void }> = ({ person, onClose }) =>
    person ? <PasswordForm key={person.id} person={person} onClose={onClose} /> : null;

const PasswordForm: React.FC<{ person: User; onClose: () => void }> = ({ person, onClose }) => {
    const [pw, setPw] = useState(() => generatePassword());
    const [show, setShow] = useState(true);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; message: string; shown?: string } | null>(null);
    const [copied, setCopied] = useState(false);

    const demoCurrent = readDemoPassword(person.id);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        const r = await setUserPassword(person.id, pw, person.email);
        setBusy(false);
        setResult({ ...r, shown: r.ok ? pw : undefined });
    };
    const copy = () => { void navigator.clipboard.writeText(pw); setCopied(true); setTimeout(() => setCopied(false), 1500); };

    return (
        <Modal open onClose={onClose} title={`Set password for ${person.name}`} width={520}>
            <form onSubmit={submit} className="stack">
                <div className="tiny">{person.email}</div>
                {isCloud ? (
                    <div className="tiny" style={{ background: 'var(--color-bg-body)', padding: '0.75rem 1rem', borderRadius: 12 }}>
                        The current password cannot be shown. Supabase stores only a scrambled form of it that nobody can reverse, which is what keeps your customers safe. You can set a new one and give it to them.
                    </div>
                ) : (
                    <div className="tiny" style={{ background: 'var(--color-warning-bg)', padding: '0.75rem 1rem', borderRadius: 12 }}>
                        Demo mode stores passwords in plain text in this browser. Current password: <b>{demoCurrent || 'none set (any password works)'}</b>
                    </div>
                )}

                {result?.ok ? (
                    <div className="stack" style={{ background: 'var(--color-success-bg)', padding: '1rem', borderRadius: 14 }}>
                        <b className="tone-good" style={{ fontWeight: 600 }}>{result.message}</b>
                        <div className="tiny" style={{ color: 'var(--color-text-secondary)' }}>Copy it now and send it to them privately. For safety it is not shown again after you close this window. Ask them to change it from their account.</div>
                        <div className="toolbar">
                            <code style={{ fontSize: '1.0625rem', fontWeight: 600, background: '#fff', padding: '0.4rem 0.75rem', borderRadius: 10 }}>{result.shown}</code>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}</button>
                        </div>
                        <div><button type="button" className="btn btn-primary" onClick={onClose}>Done</button></div>
                    </div>
                ) : (
                    <>
                        <Field label="New password" hint="At least 8 characters. The suggested one is random and strong.">
                            <div className="toolbar" style={{ flexWrap: 'nowrap' }}>
                                <input type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" required minLength={8} style={{ flex: 1 }} />
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setPw(generatePassword()); setShow(true); }} aria-label="Generate a new random password"><Shuffle size={14} /></button>
                            </div>
                        </Field>
                        {result && !result.ok && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.9375rem' }}>{result.message}</p>}
                        <div className="modal-f" style={{ padding: 0 }}>
                            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={busy || pw.length < 8}>{busy ? 'Saving...' : 'Set password'}</button>
                        </div>
                    </>
                )}
            </form>
        </Modal>
    );
};
