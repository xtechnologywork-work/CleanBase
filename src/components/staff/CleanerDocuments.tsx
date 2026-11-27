import React, { useMemo, useRef, useState } from 'react';
import { ExternalLink, Loader2, Trash2, Upload } from 'lucide-react';
import { addItem, dayLabel, logActivity, removeItem, useCollection } from '../../services/erp';
import type { StaffDoc } from '../../services/erp';
import { checkDocument, DOC_TYPES, docState, isPdfRef, openDocument, uploadDocument } from '../../services/documents';
import { deletePhoto } from '../../services/photos';
import { Modal, Pill } from '../shared/ui';
import { DocThumb } from '../shared/DocThumb';
import { PhotoImg } from '../shared/PhotoImg';

/** One cleaner's documents: see them, add a new one (photo or PDF), delete one. Same data as Team hub, Documents. */
export const CleanerDocuments: React.FC<{ staffId: string; name: string; companyId: string; actor: string; onClose: () => void }> = ({ staffId, name, companyId, actor, onClose }) => {
    const { items } = useCollection('staffDocs', companyId);
    const mine = useMemo(() => items.filter(d => d.staffId === staffId).sort((a, b) => a.expiry.localeCompare(b.expiry)), [items, staffId]);
    const input = useRef<HTMLInputElement>(null);
    const [form, setForm] = useState({ type: 'QID', number: '', expiry: '' });
    const [file, setFile] = useState('');                 // stored reference of the file picked for the new document
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [viewing, setViewing] = useState<StaffDoc | null>(null);

    const pick = async (f?: File | null) => {
        if (!f) return;
        setError('');
        const problem = checkDocument(f);
        if (problem) { setError(problem); return; }
        setBusy(true);
        try {
            const ref = await uploadDocument(f, companyId);
            if (file) await deletePhoto(file).catch(() => undefined);          // an earlier pick that was never saved
            setFile(ref);
        } catch (e) { setError(e instanceof Error ? e.message : 'Could not upload the file. Try again.'); }
        setBusy(false);
    };
    const discardPick = async () => { if (file) await deletePhoto(file).catch(() => undefined); setFile(''); };

    const add = (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) { setError(current => current || 'Add the file first: a photo or a PDF of the document.'); return; }
        if (!form.expiry) { setError('Choose the expiry date.'); return; }
        addItem('staffDocs', companyId, { staffId, type: form.type, number: form.number.trim(), expiry: form.expiry, photo: file });
        logActivity(companyId, actor, 'Added a staff document', `${name}: ${form.type}`);
        setForm({ type: 'QID', number: '', expiry: '' }); setFile(''); setError('');
    };
    const remove = (d: StaffDoc) => {
        if (!window.confirm(`Delete ${d.type} of ${name}? The file is deleted too.`)) return;
        removeItem('staffDocs', d.id);
        if (d.photo) void deletePhoto(d.photo).catch(() => undefined);
        logActivity(companyId, actor, 'Deleted a staff document', `${name}: ${d.type}`);
    };
    // Closing with a file picked but not saved removes that file, so nothing is left behind
    const close = () => { if (busy) return; if (file) void deletePhoto(file).catch(() => undefined); onClose(); };

    const open = (d: StaffDoc) => { if (!d.photo) return; if (isPdfRef(d.photo)) void openDocument(d.photo); else setViewing(d); };

    return (
        <>
            <Modal open title={`Documents, ${name}`} onClose={close} width={620}>
                <div className="stack">
                    {mine.length === 0 ? <div className="tiny" style={{ padding: '0.5rem 0' }}>No documents yet. Add the first one below.</div> : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {mine.map(d => {
                                const st = docState(d.expiry);
                                return (
                                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.7rem 0', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
                                        {d.photo
                                            ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => open(d)} aria-label={`Open ${d.type}`} style={{ padding: 0 }}><DocThumb file={d.photo} size={48} /></button>
                                            : <span className="tiny">No file</span>}
                                        <div style={{ flex: 1, minWidth: 160 }}>
                                            <b style={{ fontWeight: 600 }}>{d.type}</b>{d.number && <span className="tiny"> · {d.number}</span>}
                                            <div className="tiny">Expires {dayLabel(d.expiry)}</div>
                                        </div>
                                        <Pill tone={st === 'expired' ? 'bad' : st === 'soon' ? 'warn' : 'good'}>{st === 'expired' ? 'Expired' : st === 'soon' ? 'Expiring soon' : 'Valid'}</Pill>
                                        {d.photo && <button type="button" className="btn btn-secondary btn-sm" onClick={() => open(d)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ExternalLink size={12} /> Open</button>}
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => remove(d)} aria-label={`Delete ${d.type}`} style={{ color: '#d70015' }}><Trash2 size={13} /></button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <form onSubmit={add} style={{ marginTop: 8, padding: '1rem', borderRadius: 12, background: 'var(--color-bg-subtle)' }}>
                        <b style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Add a document</b>
                        <div className="frow" style={{ marginTop: 8 }}>
                            <div className="fld half"><label>Document type</label>
                                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                            <div className="fld half"><label>Number</label><input value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} maxLength={60} /></div>
                            <div className="fld half"><label>Expiry date</label><input type="date" required value={form.expiry} onChange={e => setForm({ ...form, expiry: e.target.value })} /></div>
                            <div className="fld half"><label>File</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    {file && <DocThumb file={file} size={40} />}
                                    <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => input.current?.click()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                        {busy ? <Loader2 size={13} className="spin" /> : <Upload size={13} />} {busy ? 'Uploading...' : file ? 'Replace file' : 'Photo or PDF'}
                                    </button>
                                    {file && !busy && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void discardPick()}>Remove</button>}
                                </div>
                                <small>Photo (from your phone camera too) or PDF, up to 10 MB.</small>
                                <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
                            </div>
                        </div>
                        {error && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.875rem', margin: '4px 0 0' }}>{error}</p>}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>Save document</button>
                        </div>
                    </form>
                </div>
            </Modal>
            <Modal open={!!viewing} title={viewing ? `${viewing.type}, ${name}` : ''} onClose={() => setViewing(null)}>
                {viewing?.photo && <PhotoImg src={viewing.photo} alt="Document" style={{ width: '100%', borderRadius: 12 }} />}
            </Modal>
        </>
    );
};
