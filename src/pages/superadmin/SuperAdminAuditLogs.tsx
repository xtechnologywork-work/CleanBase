import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { addDays, format, parseISO } from 'date-fns';
import { getDB, saveDB, logAudit } from '../../services/mockDb';
import { downloadCsv, useDB } from '../../services/erp';
import { Empty, Kpi, PageHeader, Panel, Pill, Table } from '../../components/shared/ui';

type Kind = 'all' | 'security' | 'success' | 'warning' | 'info';
const TONE = { security: 'info', success: 'good', warning: 'warn', info: undefined } as const;

export const SuperAdminAuditLogs: React.FC = () => {
    const db = useDB();
    const [q, setQ] = useState('');
    const [kind, setKind] = useState<Kind>('all');
    const [days, setDays] = useState('all');
    const [limit, setLimit] = useState(50);
    const [dayAgo] = useState(() => new Date(Date.now() - 864e5).toISOString());

    const all = useMemo(() => db.auditLogs || [], [db.auditLogs]);
    const rows = useMemo(() => {
        const cutoff = days === 'all' ? '' : format(addDays(new Date(), -Number(days)), 'yyyy-MM-dd');
        return all.filter(l => (kind === 'all' || l.type === kind)
            && (!cutoff || l.timestamp.slice(0, 10) >= cutoff)
            && (!q || `${l.actor} ${l.action} ${l.target || ''}`.toLowerCase().includes(q.toLowerCase())));
    }, [all, q, kind, days]);

    const prune = () => {
        const cutoff = format(addDays(new Date(), -90), 'yyyy-MM-dd');
        const old = all.filter(l => l.timestamp.slice(0, 10) < cutoff).length;
        if (!old) return alert('There are no entries older than 90 days.');
        if (!confirm(`Delete ${old} entries older than 90 days? This cannot be undone.`)) return;
        const d = getDB();
        d.auditLogs = (d.auditLogs || []).filter(l => l.timestamp.slice(0, 10) >= cutoff);
        saveDB(d);
        logAudit(`Deleted ${old} audit entries older than 90 days`, 'Audit log', 'warning');
    };

    return (
        <div className="pg">
            <PageHeader title="Audit log" subtitle="Every approval, plan change, payment and workspace visit, with who did it and when.">
                <button className="btn btn-secondary" onClick={() => downloadCsv('audit-log.csv', rows.map(l => ({ When: l.timestamp, Type: l.type, Who: l.actor, Action: l.action, Target: l.target || '' })))}>Export CSV</button>
                <button className="btn btn-secondary" onClick={prune}>Delete entries older than 90 days</button>
            </PageHeader>

            <div className="kpis">
                <Kpi label="Entries" value={all.length} hint="The latest 500 are kept" />
                <Kpi label="Security" value={all.filter(l => l.type === 'security').length} />
                <Kpi label="Warnings" value={all.filter(l => l.type === 'warning').length} tone={all.some(l => l.type === 'warning') ? 'warn' : undefined} />
                <Kpi label="Last 24 hours" value={all.filter(l => l.timestamp >= dayAgo).length} />
            </div>

            <Panel actions={<>
                <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--color-text-tertiary)' }} />
                    <input className="input-field" style={{ paddingLeft: 30 }} placeholder="Search who, what or which tenant" value={q} onChange={e => { setQ(e.target.value); setLimit(50); }} aria-label="Search the audit log" />
                </div>
                <select className="input-field" value={kind} onChange={e => { setKind(e.target.value as Kind); setLimit(50); }} aria-label="Type">
                    <option value="all">All types</option><option value="security">Security</option><option value="success">Success</option><option value="warning">Warnings</option><option value="info">Info</option>
                </select>
                <select className="input-field" value={days} onChange={e => { setDays(e.target.value); setLimit(50); }} aria-label="Period">
                    <option value="all">All time</option><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option>
                </select>
            </>}>
                {rows.length === 0 ? <Empty>{all.length ? 'No entries match these filters.' : 'Nothing logged yet. Approvals, plan changes, payments and workspace visits will appear here.'}</Empty> : (
                    <>
                        <Table rows={rows.slice(0, limit)} cols={[
                            { key: 't', header: 'When', render: l => <span style={{ whiteSpace: 'nowrap' }}>{format(parseISO(l.timestamp), 'd MMM yyyy, HH:mm')}</span> },
                            { key: 'k', header: 'Type', render: l => <Pill tone={TONE[l.type]}>{l.type}</Pill> },
                            { key: 'w', header: 'Who', render: l => l.actor },
                            { key: 'a', header: 'What happened', render: l => l.action },
                            { key: 'g', header: 'Tenant or target', render: l => l.target || '-' },
                        ]} />
                        {rows.length > limit && <div style={{ textAlign: 'center', marginTop: 12 }}><button className="btn btn-secondary" onClick={() => setLimit(limit + 50)}>Show more ({rows.length - limit} left)</button></div>}
                    </>
                )}
            </Panel>
        </div>
    );
};
