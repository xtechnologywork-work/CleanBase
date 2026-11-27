import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Pencil, Trash2 } from 'lucide-react';
import { addItem, removeItem, updateItem, useCollection } from '../../services/erp';
import type { Base, Collections, CollectionName, NewItem } from '../../services/erp';
import { isPdfRef, uploadDocument } from '../../services/documents';
import { DocThumb } from './DocThumb';
import { PhotoImg } from './PhotoImg';
import '../../erp.css';

export const PageHeader: React.FC<{ title: string; subtitle?: string; children?: React.ReactNode }> = ({ title, subtitle, children }) => (
    <div className="pg-head">
        <div>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
        </div>
        {children && <div className="pg-actions">{children}</div>}
    </div>
);

export const Kpi: React.FC<{
    label: string; value: React.ReactNode; unit?: string; hint?: React.ReactNode; tone?: 'good' | 'bad' | 'warn'; icon?: React.ReactNode;
}> = ({ label, value, unit, hint, tone, icon }) => (
    <div className="kpi">
        <div className="kpi-l"><span>{label}</span>{icon}</div>
        <div className={`kpi-v ${tone ? 'tone-' + tone : ''}`}>{value}{unit && <small>{unit}</small>}</div>
        {hint && <div className="kpi-h">{hint}</div>}
    </div>
);

export const Panel: React.FC<{ title?: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, subtitle, actions, children, className }) => (
    <section className={`panel ${className || ''}`}>
        {(title || actions) && (
            <div className="panel-h">
                <div>{title && <h3>{title}</h3>}{subtitle && <p>{subtitle}</p>}</div>
                {actions && <div className="toolbar">{actions}</div>}
            </div>
        )}
        {children}
    </section>
);

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
    return (
        <div className="tabs" role="tablist">
            {tabs.map(t => (
                <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>{t.label}</button>
            ))}
        </div>
    );
}

export const Pill: React.FC<{ tone?: 'good' | 'bad' | 'warn' | 'info'; children: React.ReactNode }> = ({ tone, children }) => (
    <span className={`pill ${tone || ''}`}>{children}</span>
);

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="empty">{children}</div>;

/** Open pages, oldest first. Only the top-most one reacts to Escape. */
const openSheets: object[] = [];

/**
 * A page for adding or editing something. It replaces the content area (the sidebar and header stay visible),
 * with no floating frame, no dark overlay and no blur.
 * It is rendered next to the page, not inside it, so a page opened from another page (for example Set password
 * from the details of a company) always appears on top and in view, wherever the first page is scrolled to.
 */
export const Modal: React.FC<{
    open: boolean; title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; width?: number;
}> = ({ open, title, onClose, children, footer, width = 560 }) => {
    const closeRef = useRef(onClose);
    useEffect(() => { closeRef.current = onClose; });
    useEffect(() => {
        if (!open) return;
        const token = {};
        openSheets.push(token);
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && openSheets[openSheets.length - 1] === token) closeRef.current(); };
        window.addEventListener('keydown', h);
        return () => {
            window.removeEventListener('keydown', h);
            const i = openSheets.indexOf(token);
            if (i >= 0) openSheets.splice(i, 1);
        };
    }, [open]);
    if (!open) return null;
    const sheet = (
        <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
            <div className="sheet-col" style={{ maxWidth: Math.max(width, 720) }}>
                <div className="sheet-head">
                    <h1>{title}</h1>
                    <button type="button" className="sheet-x" onClick={() => closeRef.current()} aria-label="Close"><X size={18} /></button>
                </div>
                <div className="sheet-body">{children}</div>
                {footer && <div className="sheet-foot">{footer}</div>}
            </div>
        </div>
    );
    return createPortal(sheet, document.querySelector('main') ?? document.body);
};

/* ---------------- tables ---------------- */

export interface Col<T> { key: string; header: string; render?: (row: T) => React.ReactNode; align?: 'r'; width?: number }

export function Table<T extends { id: string }>({ cols, rows, empty = 'Nothing here yet.', onRowClick }: {
    cols: Col<T>[]; rows: T[]; empty?: string; onRowClick?: (row: T) => void;
}) {
    if (!rows.length) return <Empty>{empty}</Empty>;
    return (
        <div className="tbl-wrap">
            <table className="tbl">
                <thead><tr>{cols.map(c => <th key={c.key} className={c.align} style={c.width ? { width: c.width } : undefined}>{c.header}</th>)}</tr></thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={r.id} className={onRowClick ? 'click' : ''} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                            {cols.map(c => (
                                <td key={c.key} className={c.align}>
                                    {c.render ? c.render(r) : String((r as unknown as Record<string, unknown>)[c.key] ?? '')}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/* ---------------- forms ---------------- */

export interface FieldDef {
    name: string; label: string; type?: 'text' | 'number' | 'date' | 'time' | 'select' | 'textarea' | 'tel' | 'email' | 'photo';
    options?: { value: string; label: string }[]; required?: boolean; placeholder?: string; half?: boolean; hint?: string; step?: string; min?: string;
}

export const Field: React.FC<{ label: string; half?: boolean; hint?: string; children: React.ReactNode }> = ({ label, half, hint, children }) => (
    <div className={`fld ${half ? 'half' : ''}`}>
        <label>{label}</label>
        {children}
        {hint && <small>{hint}</small>}
    </div>
);

/** A document: a photo (gallery or phone camera) or a PDF, stored in the private bucket. */
function PhotoField({ value, companyId, onChange }: { value: string; companyId: string; onChange: (v: string) => void }) {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setBusy(true); setErr('');
        try { onChange(await uploadDocument(file, companyId)); } catch (x) { setErr(x instanceof Error ? x.message : 'Could not upload the file. Try again.'); }
        setBusy(false);
    };
    return (
        <div className="stack">
            {value && (isPdfRef(value)
                ? <div><DocThumb file={value} size={72} /></div>
                : <div><PhotoImg src={value} alt="Document" style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 12, objectFit: 'contain', background: 'var(--color-bg-body)' }} /></div>)}
            <div className="toolbar">
                <label className="btn btn-secondary btn-sm" style={{ cursor: busy ? 'wait' : 'pointer' }}>
                    {busy ? 'Uploading...' : value ? 'Replace file' : 'Upload photo or PDF'}
                    <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={pick} disabled={busy} />
                </label>
                {value && !busy && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange('')}>Remove</button>}
            </div>
            {err && <small role="alert" style={{ color: 'var(--color-danger)' }}>{err}</small>}
        </div>
    );
}

export function FormModal({ open, title, fields, initial, onSubmit, onClose, submitLabel = 'Save', width, companyId }: {
    companyId?: string; open: boolean; title: string; fields: FieldDef[]; initial: Record<string, unknown>;
    onSubmit: (values: Record<string, string>) => void; onClose: () => void; submitLabel?: string; width?: number;
}) {
    const [vals, setVals] = useState<Record<string, string>>({});
    useEffect(() => {
        if (open) {
            const v: Record<string, string> = {};
            fields.forEach(f => { v[f.name] = initial[f.name] === undefined || initial[f.name] === null ? '' : String(initial[f.name]); });
            setVals(v); setFormError('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);
    const [formError, setFormError] = useState('');
    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const missing = fields.find(f => f.type === 'photo' && f.required && !vals[f.name]);
        if (missing) { setFormError(`Please add the file: ${missing.label}.`); return; }
        setFormError(''); onSubmit(vals);
    };
    return (
        <Modal open={open} title={title} onClose={onClose} width={width}>
            <form onSubmit={submit} className="stack">
                <div className="frow">
                    {fields.map(f => (
                        <Field key={f.name} label={f.label} half={f.half} hint={f.hint}>
                            {f.type === 'photo' ? (
                                <PhotoField value={vals[f.name] ?? ''} companyId={companyId || ''} onChange={v => setVals(s => ({ ...s, [f.name]: v }))} />
                            ) : f.type === 'select' ? (
                                <select value={vals[f.name] ?? ''} required={f.required} onChange={e => setVals({ ...vals, [f.name]: e.target.value })}>
                                    {!f.required && <option value="">None</option>}
                                    {(f.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            ) : f.type === 'textarea' ? (
                                <textarea value={vals[f.name] ?? ''} required={f.required} placeholder={f.placeholder} onChange={e => setVals({ ...vals, [f.name]: e.target.value })} />
                            ) : (
                                <input
                                    type={f.type || 'text'} step={f.step || (f.type === 'number' ? 'any' : undefined)} min={f.min ?? (f.type === 'number' ? '0' : undefined)} value={vals[f.name] ?? ''}
                                    required={f.required} placeholder={f.placeholder} onChange={e => setVals({ ...vals, [f.name]: e.target.value })}
                                />
                            )}
                        </Field>
                    ))}
                </div>
                {formError && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.9375rem' }}>{formError}</p>}
                <div className="modal-f" style={{ padding: 0 }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn btn-primary">{submitLabel}</button>
                </div>
            </form>
        </Modal>
    );
}

/* Cast helper: form values (strings) to a collection row, converting numbers. */
function coerce(fields: FieldDef[], values: Record<string, string>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    fields.forEach(f => {
        const v = values[f.name];
        if (f.type === 'number') out[f.name] = v === '' || v === undefined ? 0 : Number(v);
        else if (v === '' && !f.required) out[f.name] = undefined;
        else out[f.name] = v;
    });
    return out;
}

/* ---------------- generic CRUD table over an ERP collection ---------------- */

export function CrudTable<K extends CollectionName>({
    collection, companyId, fields, cols, defaults, addLabel, noun, empty, filter, extraRow, onChange, canEdit = true,
}: {
    collection: K; companyId: string; fields: FieldDef[]; cols: Col<Collections[K]>[]; defaults?: Record<string, unknown>;
    addLabel: string; noun: string; empty?: string; filter?: (r: Collections[K]) => boolean;
    extraRow?: (r: Collections[K]) => React.ReactNode; onChange?: (action: string, row: Collections[K]) => void; canEdit?: boolean;
}) {
    const { items } = useCollection(collection, companyId);
    const [editing, setEditing] = useState<Collections[K] | 'new' | null>(null);
    const rows = filter ? items.filter(filter) : items;
    const base: Record<string, unknown> = editing && editing !== 'new' ? (editing as unknown as Record<string, unknown>) : { ...defaults };
    const actionCol: Col<Collections[K]> = {
        key: '_a', header: '', align: 'r', render: r => (
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                {extraRow?.(r)}
                {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => setEditing(r)} aria-label={`Edit ${noun}`}><Pencil size={14} /></button>}
                {canEdit && <button className="btn btn-ghost btn-sm" aria-label={`Delete ${noun}`} onClick={() => {
                    if (confirm(`Delete this ${noun}?`)) { removeItem(collection, r.id); onChange?.('delete', r); }
                }}><Trash2 size={14} /></button>}
            </span>
        ),
    };
    return (
        <div className="stack">
            {canEdit && (
                <div><button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={15} /> {addLabel}</button></div>
            )}
            <Table cols={[...cols, actionCol]} rows={rows} empty={empty || `No ${noun}s yet.`} />
            <FormModal
                open={editing !== null}
                title={editing === 'new' ? addLabel : `Edit ${noun}`}
                fields={fields}
                companyId={companyId}
                initial={base}
                onClose={() => setEditing(null)}
                onSubmit={vals => {
                    const data = coerce(fields, vals);
                    if (editing === 'new') {
                        const row = addItem(collection, companyId, { ...defaults, ...data } as unknown as NewItem<Collections[K]>);
                        onChange?.('add', row);
                    } else if (editing) {
                        updateItem(collection, (editing as Base).id, data as Partial<Collections[K]>);
                        onChange?.('update', editing);
                    }
                    setEditing(null);
                }}
            />
        </div>
    );
}
