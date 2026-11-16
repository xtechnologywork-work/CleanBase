import React, { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Copy, MessageCircle, Star } from 'lucide-react';
import { format, subDays } from 'date-fns';
import {
    addItem, dayLabel, getSettings, logActivity, mutateDB, newReviewToken, reviewLink, staffName, updateItem, useCollection, useDB, waDigits,
    DEFAULT_REVIEW_TEMPLATE,
} from '../services/erp';
import type { ReviewRequest } from '../services/erp';
import { Empty, Kpi, Panel, Pill, Table, Tabs } from '../components/shared/ui';
import { ReviewsPage } from './ReviewsPage';

type Tab = 'ask' | 'approve' | 'published';

const Stars: React.FC<{ n: number }> = ({ n }) => (
    <span aria-label={`${n} out of 5 stars`} style={{ display: 'inline-flex', gap: 2 }}>
        {[1, 2, 3, 4, 5].map(i => <Star key={i} size={16} fill={i <= n ? 'var(--color-warning)' : 'none'} color={i <= n ? 'var(--color-warning)' : '#c7c7cc'} />)}
    </span>
);

const STATE: Record<ReviewRequest['status'] | 'none', { label: string; tone?: 'good' | 'bad' | 'warn' | 'info' }> = {
    none: { label: 'Not asked yet' }, sent: { label: 'Link sent, waiting', tone: 'info' }, submitted: { label: 'Waiting for your approval', tone: 'warn' },
    accepted: { label: 'Published', tone: 'good' }, rejected: { label: 'Not published', tone: 'bad' },
};

/** Ask customers for reviews, approve what they write, and see what is published. */
export const ReviewsHub: React.FC = () => {
    const { user } = useAuth();
    const companyId = user?.companyId || '';
    const db = useDB();
    const { items: requests } = useCollection('reviewRequests', companyId);
    const [tab, setTab] = useState<Tab>('ask');
    const [copied, setCopied] = useState('');

    const company = db.companies.find(c => c.id === companyId);
    const settings = getSettings(companyId);
    const waiting = requests.filter(r => r.status === 'submitted');

    // Last finished jobs, newest first
    const since = format(subDays(new Date(), 45), 'yyyy-MM-dd');
    const jobs = useMemo(() => db.bookings
        .filter(b => b.companyId === companyId && b.status === 'completed' && b.date >= since)
        .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
        .slice(0, 40),
        [db.bookings, companyId, since]);

    const requestFor = (bookingId: string) => requests.find(r => r.bookingId === bookingId);
    const actor = user?.name || 'Owner';

    const ensureRequest = (bookingId: string): ReviewRequest | null => {
        const existing = requestFor(bookingId);
        if (existing) return existing;
        const b = db.bookings.find(x => x.id === bookingId);
        if (!b) return null;
        return addItem('reviewRequests', companyId, {
            bookingId: b.id, clientId: b.clientId, cleanerId: b.cleanerId, token: newReviewToken(), status: 'sent',
            clientName: db.clients.find(c => c.id === b.clientId)?.name || 'Client',
            serviceName: db.services.find(s => s.id === b.serviceId)?.name || 'Cleaning',
            serviceDate: b.date, cleanerName: b.cleanerId ? (staffName(db, b.cleanerId) || '').split(' ')[0] : undefined,
            sentAt: new Date().toISOString(),
        });
    };

    const message = (r: ReviewRequest, name: string) =>
        (settings.tplReview || DEFAULT_REVIEW_TEMPLATE)
            .replace('{name}', name).replace('{company}', company?.name || 'us').replace('{service}', r.serviceName)
            .replace('{date}', dayLabel(r.serviceDate)).replace('{link}', reviewLink(r.token));

    const sendWhatsApp = (bookingId: string) => {
        const b = db.bookings.find(x => x.id === bookingId);
        const client = db.clients.find(c => c.id === b?.clientId);
        const digits = waDigits(client?.phone || '');
        if (!digits) return alert('This client has no phone number saved.');
        const r = ensureRequest(bookingId);
        if (!r) return;
        window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message(r, client?.name || ''))}`, '_blank', 'noopener');
        logActivity(companyId, actor, 'Sent a review request', `${client?.name} ${r.serviceDate}`);
    };
    const copyLink = (bookingId: string) => {
        const r = ensureRequest(bookingId);
        if (!r) return;
        void navigator.clipboard.writeText(reviewLink(r.token));
        setCopied(bookingId); setTimeout(() => setCopied(''), 1500);
    };

    const accept = (r: ReviewRequest) => {
        mutateDB(d => {
            d.reviews = d.reviews || [];
            if (!d.reviews.some(x => x.bookingId === r.bookingId && x.clientId === r.clientId)) {
                d.reviews.push({
                    id: `rv-${r.id}`, companyId, bookingId: r.bookingId, clientId: r.clientId, cleanerId: r.cleanerId || '',
                    rating: r.rating || 5, comment: r.comment || undefined, createdAt: new Date().toISOString(),
                });
            }
        });
        updateItem('reviewRequests', r.id, { status: 'accepted', decidedAt: new Date().toISOString() });
        logActivity(companyId, actor, 'Published a customer review', r.clientName);
    };
    const reject = (r: ReviewRequest) => {
        if (!confirm('Do not publish this review? The customer is not notified.')) return;
        updateItem('reviewRequests', r.id, { status: 'rejected', decidedAt: new Date().toISOString() });
        logActivity(companyId, actor, 'Declined a customer review', r.clientName);
    };

    return (
        <div className="stack">
            <div className="kpis">
                <Kpi label="Requests sent" value={requests.length} hint={`${requests.filter(r => r.status !== 'sent').length} answered`} />
                <Kpi label="Waiting for approval" value={waiting.length} tone={waiting.length ? 'warn' : undefined} hint="Nothing is public until you accept it" />
                <Kpi label="Published" value={requests.filter(r => r.status === 'accepted').length} tone="good" />
            </div>

            <Tabs value={tab} onChange={setTab} tabs={[
                { id: 'ask', label: 'Ask for reviews' }, { id: 'approve', label: `To approve (${waiting.length})` }, { id: 'published', label: 'Published' },
            ]} />

            {tab === 'ask' && (
                <Panel title="Latest finished jobs" subtitle="Send the customer a private link on WhatsApp. They rate the job there, and you decide what gets published.">
                    <Table
                        rows={jobs}
                        empty="No finished jobs in the last 45 days. Once a job is marked finished it appears here."
                        cols={[
                            { key: 'd', header: 'Job', render: b => <div><b style={{ fontWeight: 600 }}>{db.clients.find(c => c.id === b.clientId)?.name || 'Client'}</b><div className="tiny">{db.services.find(s => s.id === b.serviceId)?.name || 'Cleaning'} · {dayLabel(b.date)}</div></div> },
                            { key: 'c', header: 'Cleaner', render: b => (b.cleanerId ? staffName(db, b.cleanerId) : '') || '-' },
                            { key: 's', header: 'Review', render: b => { const st = requestFor(b.id)?.status || 'none'; return <Pill tone={STATE[st].tone}>{STATE[st].label}</Pill>; } },
                            { key: 'a', header: '', align: 'r', render: b => {
                                const r = requestFor(b.id);
                                const phone = db.clients.find(c => c.id === b.clientId)?.phone;
                                if (r && r.status !== 'sent') return <span className="tiny">{r.status === 'submitted' ? 'Open To approve' : 'Done'}</span>;
                                return (
                                    <span style={{ display: 'inline-flex', gap: 4 }}>
                                        <button className="btn btn-primary btn-sm" onClick={() => sendWhatsApp(b.id)} disabled={!phone} title={phone ? undefined : 'No phone number saved for this client'}>
                                            <MessageCircle size={14} /> {r ? 'Send again' : 'Send on WhatsApp'}
                                        </button>
                                        <button className="btn btn-secondary btn-sm" onClick={() => copyLink(b.id)} aria-label="Copy the review link"><Copy size={14} /> {copied === b.id ? 'Copied' : 'Copy link'}</button>
                                    </span>
                                );
                            } },
                        ]}
                    />
                </Panel>
            )}

            {tab === 'approve' && (
                <Panel title="Waiting for your approval" subtitle="Real answers from real links. Only reviews you accept are published and counted in ratings.">
                    {waiting.length === 0 ? <Empty>No reviews are waiting. When a customer answers a link it appears here.</Empty> : (
                        <div className="stack">
                            {waiting.map(r => (
                                <div key={r.id} className="issue low" style={{ gap: '0.6rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                        <div><b>{r.clientName}</b><div className="tiny">{r.serviceName} · {dayLabel(r.serviceDate)}{r.cleanerName ? ` · with ${r.cleanerName}` : ''}</div></div>
                                        <Stars n={r.rating || 0} />
                                    </div>
                                    {r.comment ? <p style={{ fontStyle: 'italic', fontSize: '0.9375rem' }}>{r.comment}</p> : <p className="tiny">The customer left no note.</p>}
                                    <div className="toolbar">
                                        <button className="btn btn-primary btn-sm" onClick={() => accept(r)}>Accept and publish</button>
                                        <button className="btn btn-secondary btn-sm" onClick={() => reject(r)}>Do not publish</button>
                                        <span className="tiny">Answered {r.submittedAt ? dayLabel(r.submittedAt.slice(0, 10)) : ''}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Panel>
            )}

            {tab === 'published' && <ReviewsPage />}
        </div>
    );
};
