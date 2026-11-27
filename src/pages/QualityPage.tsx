import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { dayLabel, logActivity, staffName, updateItem, useCollection, useDB } from '../services/erp';
import { CrudTable, Kpi, PageHeader, Panel, Pill, Tabs } from '../components/shared/ui';
import type { FieldDef } from '../components/shared/ui';
import { ReviewsHub } from './ReviewsHub';

export const QualityPage: React.FC = () => {
    const { user } = useAuth();
    const companyId = user?.companyId || '';
    const db = useDB();
    const [tab, setTab] = useState<'complaints' | 'reviews'>('complaints');
    const { items } = useCollection('complaints', companyId);
    const reviews = db.reviews.filter(r => r.companyId === companyId);
    const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

    const fields: FieldDef[] = [
        { name: 'clientId', label: 'Client', type: 'select', required: true, options: db.clients.filter(c => c.companyId === companyId).map(c => ({ value: c.id, label: c.name })) },
        { name: 'cleanerId', label: 'Cleaner involved', type: 'select', half: true, options: db.staff.filter(s => s.companyId === companyId).map(s => ({ value: s.id, label: staffName(db, s.id) })) },
        { name: 'severity', label: 'Severity', type: 'select', required: true, half: true, options: [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }] },
        { name: 'subject', label: 'Subject', required: true },
        { name: 'details', label: 'What happened', type: 'textarea', required: true },
        { name: 'status', label: 'Status', type: 'select', required: true, half: true, options: [{ value: 'open', label: 'Open' }, { value: 'investigating', label: 'Investigating' }, { value: 'resolved', label: 'Resolved' }] },
        { name: 'resolution', label: 'Resolution', type: 'textarea' },
    ];

    return (
        <div className="pg">
            <PageHeader title="Quality" subtitle="Complaints and reviews in one place, so a bad job becomes a fixed problem." />
            <div className="kpis">
                <Kpi label="Open complaints" value={items.filter(c => c.status === 'open').length} tone={items.some(c => c.status === 'open') ? 'bad' : undefined} />
                <Kpi label="Investigating" value={items.filter(c => c.status === 'investigating').length} />
                <Kpi label="Resolved" value={items.filter(c => c.status === 'resolved').length} />
                <Kpi label="Average rating" value={reviews.length ? avg.toFixed(1) : 'No reviews'} unit={reviews.length ? '/ 5' : undefined} hint={`${reviews.length} review${reviews.length === 1 ? '' : 's'}`} />
            </div>
            <Tabs value={tab} onChange={setTab} tabs={[{ id: 'complaints', label: 'Complaints' }, { id: 'reviews', label: 'Reviews' }]} />
            {tab === 'complaints' ? (
                <Panel title="Complaint log">
                    <CrudTable collection="complaints" companyId={companyId} noun="complaint" addLabel="Log complaint" fields={fields} defaults={{ severity: 'medium', status: 'open' }}
                        onChange={(a, r) => logActivity(companyId, user?.name || 'Owner', `${a === 'add' ? 'Logged' : 'Updated'} complaint`, (r as { subject: string }).subject)}
                        extraRow={c => c.status !== 'resolved' ? <button className="btn btn-primary btn-sm" onClick={() => {
                            const res = prompt('How was it resolved?', c.resolution || '');
                            if (res !== null) { updateItem('complaints', c.id, { status: 'resolved', resolution: res }); logActivity(companyId, user?.name || 'Owner', 'Resolved complaint', c.subject); }
                        }}>Resolve</button> : null}
                        cols={[
                            { key: 'd', header: 'Logged', render: c => dayLabel(c.createdAt.slice(0, 10)) },
                            { key: 'c', header: 'Client', render: c => db.clients.find(x => x.id === c.clientId)?.name || 'Unknown' },
                            { key: 'subject', header: 'Subject', render: c => <span><b style={{ fontWeight: 600 }}>{c.subject}</b><div className="tiny">{c.details}</div></span> },
                            { key: 'w', header: 'Cleaner', render: c => staffName(db, c.cleanerId) || '-' },
                            { key: 'sev', header: 'Severity', render: c => <Pill tone={c.severity === 'high' ? 'bad' : c.severity === 'medium' ? 'warn' : undefined}>{c.severity}</Pill> },
                            { key: 'st', header: 'Status', render: c => <Pill tone={c.status === 'resolved' ? 'good' : c.status === 'open' ? 'bad' : 'warn'}>{c.status}</Pill> },
                        ]} />
                </Panel>
            ) : <ReviewsHub />}
        </div>
    );
};
