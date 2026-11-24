import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, Save } from 'lucide-react';
import { sameWeek, useSettings, WEEKDAY_NAMES } from '../../services/erp';
import type { DayHours } from '../../services/erp';
import { toMin } from '../../services/store';

const hoursLabel = (d: DayHours) => {
    const m = toMin(d.end) - toMin(d.start);
    if (m <= 0) return '';
    return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''} open`;
};
const valid = (d: DayHours) => !d.open || (/^\d{2}:\d{2}$/.test(d.start) && /^\d{2}:\d{2}$/.test(d.end) && toMin(d.end) > toMin(d.start));

/** Settings tab: when the company opens and closes on each weekday. The booking page only offers times inside these hours. */
export const WorkingHoursPanel: React.FC<{ companyId: string }> = ({ companyId }) => {
    const { settings, save } = useSettings(companyId);
    const saved = useMemo<DayHours[]>(
        () => (Array.isArray(settings.weekHours) && settings.weekHours.length === 7 ? settings.weekHours : sameWeek(settings.workStart || '07:00', settings.workEnd || '19:00')),
        [settings.weekHours, settings.workStart, settings.workEnd]);
    const stamp = JSON.stringify(saved);
    const [week, setWeek] = useState<DayHours[]>(saved);
    const [message, setMessage] = useState('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { setWeek(saved); }, [stamp]);

    const dirty = JSON.stringify(week) !== stamp;
    const allValid = week.every(valid);
    const anyOpen = week.some(d => d.open);
    const [bulk, setBulk] = useState({ start: '08:00', end: '18:00' });

    const edit = (i: number, patch: Partial<DayHours>) => { setWeek(w => w.map((d, k) => (k === i ? { ...d, ...patch } : d))); setMessage(''); };
    const applyToAll = (from: { start: string; end: string }) => { setWeek(w => w.map(d => (d.open ? { ...d, ...from } : d))); setMessage(''); };

    const onSave = () => {
        if (!allValid) { setMessage('Check the times: closing must be after opening.'); return; }
        if (!anyOpen) { setMessage('Keep at least one day open, or clients cannot book.'); return; }
        const open = week.filter(d => d.open);
        // workStart and workEnd stay as the earliest opening and latest closing, so anything that only knows one range keeps working
        const workStart = open.map(d => d.start).sort()[0];
        const workEnd = open.map(d => d.end).sort().slice(-1)[0];
        save({ weekHours: week, workStart, workEnd });
        setMessage('Working hours saved');
        setTimeout(() => setMessage(''), 3000);
    };

    const timeInput: React.CSSProperties = { fontSize: '0.8125rem', width: 120 };
    return (
        <div className="card" style={{ padding: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: '1.25rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--color-border)' }}>
                <div>
                    <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>Working hours</h2>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                        Choose the days you work and when you open and close. Your booking page only offers times inside these hours, and a service must finish before closing.
                    </p>
                </div>
                {message && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', fontWeight: 500, padding: '0.4rem 0.75rem', borderRadius: 6,
                        color: message.startsWith('Working') ? '#248a3d' : '#d70015', background: message.startsWith('Working') ? 'rgba(36,138,61,.1)' : 'rgba(215,0,21,.08)' }}>
                        {message.startsWith('Working') && <CheckCircle2 size={15} />}<span>{message}</span>
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
                {week.map((d, i) => {
                    const bad = !valid(d);
                    return (
                        <div key={WEEKDAY_NAMES[i]} className="wh-row">
                            <b style={{ fontWeight: 600, fontSize: '0.875rem', color: d.open ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>{WEEKDAY_NAMES[i]}</b>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem', cursor: 'pointer', color: d.open ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>
                                <input type="checkbox" checked={d.open} onChange={e => edit(i, { open: e.target.checked })} aria-label={`${WEEKDAY_NAMES[i]} open`} />
                                {d.open ? 'Open' : 'Closed'}
                            </label>
                            {d.open ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <input type="time" className="input-field" style={{ ...timeInput, borderColor: bad ? '#d70015' : undefined }} value={d.start} onChange={e => edit(i, { start: e.target.value })} aria-label={`${WEEKDAY_NAMES[i]} opens`} />
                                    <span style={{ color: 'var(--color-text-tertiary)' }}>to</span>
                                    <input type="time" className="input-field" style={{ ...timeInput, borderColor: bad ? '#d70015' : undefined }} value={d.end} onChange={e => edit(i, { end: e.target.value })} aria-label={`${WEEKDAY_NAMES[i]} closes`} />
                                    <span style={{ fontSize: '0.75rem', color: bad ? '#d70015' : 'var(--color-text-tertiary)' }}>{bad ? 'Closing must be after opening' : hoursLabel(d)}</span>
                                    {i > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit(i, { start: week[i - 1].start, end: week[i - 1].end })} title={`Same as ${WEEKDAY_NAMES[i - 1]}`}
                                        style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Copy size={12} /> Same as above</button>}
                                </div>
                            ) : <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-tertiary)' }}>No bookings on this day</span>}
                        </div>
                    );
                })}
            </div>

            <div style={{ marginTop: '1.25rem', padding: '0.875rem', borderRadius: 10, background: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Quick fill</span>
                <input type="time" className="input-field" style={timeInput} value={bulk.start} onChange={e => setBulk({ ...bulk, start: e.target.value })} aria-label="Opening time for all days" />
                <span style={{ color: 'var(--color-text-tertiary)' }}>to</span>
                <input type="time" className="input-field" style={timeInput} value={bulk.end} onChange={e => setBulk({ ...bulk, end: e.target.value })} aria-label="Closing time for all days" />
                <button type="button" className="btn btn-secondary btn-sm" disabled={toMin(bulk.end) <= toMin(bulk.start)} onClick={() => applyToAll(bulk)}>Apply to all open days</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                {dirty && <button type="button" className="btn btn-secondary" onClick={() => { setWeek(saved); setMessage(''); }} style={{ fontSize: '0.8125rem' }}>Discard changes</button>}
                <button type="button" className="btn btn-primary" onClick={onSave} disabled={!dirty} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', padding: '0.55rem 1rem' }}>
                    <Save size={15} /> <span>Save working hours</span>
                </button>
            </div>
        </div>
    );
};
