import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Search } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { downloadCsv, useCollection } from '../services/erp';
import { Empty, PageHeader, Panel } from '../components/shared/ui';

export const ActivityPage: React.FC = () => {
    const { user } = useAuth();
    const companyId = user?.companyId || '';
    const { items } = useCollection('activity', companyId);
    const [q, setQ] = useState('');
    const rows = items
        .filter(a => !q || `${a.actor} ${a.action} ${a.target || ''}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return (
        <div className="pg">
            <PageHeader title="Activity log" subtitle="Who changed what and when: invoices, payments, assignments, payroll and more.">
                <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--color-text-tertiary)' }} />
                    <input className="input-field" style={{ paddingLeft: 30 }} placeholder="Search activity" value={q} onChange={e => setQ(e.target.value)} />
                </div>
                <button className="btn btn-secondary" onClick={() => downloadCsv('activity.csv', rows.map(a => ({ When: a.createdAt, Who: a.actor, Action: a.action, Target: a.target || '' })))}>Export CSV</button>
            </PageHeader>
            <Panel>
                {rows.length === 0 ? <Empty>No activity recorded yet. Actions like creating invoices or assigning cleaners appear here.</Empty> : rows.slice(0, 200).map(a => (
                    <div className="row" key={a.id}>
                        <div><b style={{ fontWeight: 600 }}>{a.actor}</b> {a.action.charAt(0).toLowerCase() + a.action.slice(1)}{a.target ? <span className="muted"> · {a.target}</span> : null}</div>
                        <span className="tiny">{format(parseISO(a.createdAt), 'd MMM, HH:mm')}</span>
                    </div>
                ))}
            </Panel>
        </div>
    );
};
