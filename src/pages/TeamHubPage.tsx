import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { addDays, format, parseISO } from 'date-fns';
import {
    addItem, dayLabel, downloadCsv, escHtml, fmt, fmt0, inRange, logActivity, printHtml, staffName, today, updateItem, useCollection, useDB,
} from '../services/erp';
import type { Attendance, StaffMeta } from '../services/erp';
import { CrudTable, Empty, FormModal, Kpi, PageHeader, Panel, Pill, Table, Tabs } from '../components/shared/ui';
import type { FieldDef } from '../components/shared/ui';
import { Modal } from '../components/shared/ui';
import { PhotoImg } from '../components/shared/PhotoImg';
import { DocThumb } from '../components/shared/DocThumb';
import { isPdfRef, openDocument } from '../services/documents';
import { deletePhoto } from '../services/photos';
import type { StaffDoc } from '../services/erp';

type Tab = 'docs' | 'attendance' | 'leave' | 'payroll' | 'performance';
const hoursBetween = (a?: string, b?: string) => {
    if (!a || !b) return 0;
    const [h1, m1] = a.split(':').map(Number), [h2, m2] = b.split(':').map(Number);
    return Math.max(0, (h2 * 60 + m2 - (h1 * 60 + m1)) / 60);
};

export const TeamHubPage: React.FC = () => {
    const { user } = useAuth();
    const companyId = user?.companyId || '';
    const [tab, setTab] = useState<Tab>('attendance');
    return (
        <div className="pg">
            <PageHeader title="Team hub" subtitle="Documents, attendance, leave, payroll and performance for every cleaner and driver." />
            <Tabs value={tab} onChange={setTab} tabs={[
                { id: 'attendance', label: 'Attendance' }, { id: 'docs', label: 'Documents' }, { id: 'leave', label: 'Leave' },
                { id: 'payroll', label: 'Payroll' }, { id: 'performance', label: 'Performance' },
            ]} />
            {tab === 'attendance' && <AttendanceTab companyId={companyId} />}
            {tab === 'docs' && <DocsTab companyId={companyId} />}
            {tab === 'leave' && <LeaveTab companyId={companyId} />}
            {tab === 'payroll' && <PayrollTab companyId={companyId} />}
            {tab === 'performance' && <PerformanceTab companyId={companyId} />}
        </div>
    );
};

/* ------------------------------ attendance ------------------------------ */

const AttendanceTab: React.FC<{ companyId: string }> = ({ companyId }) => {
    const db = useDB();
    const { items } = useCollection('attendance', companyId);
    const [date, setDate] = useState(today());
    const staff = db.staff.filter(s => s.companyId === companyId);
    const rec = (id: string) => items.find(a => a.staffId === id && a.date === date);
    const upsert = (staffId: string, patch: Partial<Attendance>) => {
        const r = rec(staffId);
        if (r) updateItem('attendance', r.id, patch); else addItem('attendance', companyId, { staffId, date, status: 'present', ...patch });
    };
    const nowT = () => format(new Date(), 'HH:mm');
    const day = items.filter(a => a.date === date);
    return (
        <div className="stack">
            <div className="kpis">
                <Kpi label="Present" value={day.filter(a => a.status === 'present' || a.status === 'late').length} hint={`of ${staff.length} staff`} />
                <Kpi label="Late" value={day.filter(a => a.status === 'late').length} tone={day.some(a => a.status === 'late') ? 'warn' : undefined} />
                <Kpi label="Absent" value={day.filter(a => a.status === 'absent').length} tone={day.some(a => a.status === 'absent') ? 'bad' : undefined} />
                <Kpi label="Hours logged" value={day.reduce((s, a) => s + hoursBetween(a.checkIn, a.checkOut), 0).toFixed(1)} />
            </div>
            <Panel title="Daily register" actions={<input className="input-field" type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="Date" />}>
                {staff.length === 0 ? <Empty>No staff yet. Add cleaners first.</Empty> : (
                    <Table rows={staff} cols={[
                        { key: 'n', header: 'Staff', render: s => <b style={{ fontWeight: 600 }}>{staffName(db, s.id)}</b> },
                        { key: 'st', header: 'Status', render: s => (
                            <select className="input-field" value={rec(s.id)?.status || ''} onChange={e => upsert(s.id, { status: e.target.value as Attendance['status'] })}>
                                <option value="" disabled>Not marked</option>
                                <option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="leave">On leave</option>
                            </select>) },
                        { key: 'in', header: 'Check in', render: s => <input className="input-field" type="time" value={rec(s.id)?.checkIn || ''} onChange={e => upsert(s.id, { checkIn: e.target.value })} /> },
                        { key: 'out', header: 'Check out', render: s => <input className="input-field" type="time" value={rec(s.id)?.checkOut || ''} onChange={e => upsert(s.id, { checkOut: e.target.value })} /> },
                        { key: 'h', header: 'Hours', align: 'r', render: s => hoursBetween(rec(s.id)?.checkIn, rec(s.id)?.checkOut).toFixed(1) },
                        { key: 'q', header: '', align: 'r', render: s => {
                            const r = rec(s.id);
                            return !r?.checkIn
                                ? <button className="btn btn-primary btn-sm" onClick={() => upsert(s.id, { checkIn: nowT(), status: nowT() > '08:15' ? 'late' : 'present' })}>Check in now</button>
                                : !r.checkOut ? <button className="btn btn-secondary btn-sm" onClick={() => upsert(s.id, { checkOut: nowT() })}>Check out now</button> : <Pill tone="good">Done</Pill>;
                        } },
                    ]} />
                )}
            </Panel>
        </div>
    );
};

/* ------------------------------ documents ------------------------------- */

const DocsTab: React.FC<{ companyId: string }> = ({ companyId }) => {
    const db = useDB();
    const staff = db.staff.filter(s => s.companyId === companyId);
    const { items } = useCollection('staffDocs', companyId);
    const soon = format(addDays(new Date(), 30), 'yyyy-MM-dd');
    const [viewing, setViewing] = useState<StaffDoc | null>(null);
    const fields: FieldDef[] = [
        { name: 'staffId', label: 'Staff member', type: 'select', required: true, options: staff.map(s => ({ value: s.id, label: staffName(db, s.id) })) },
        { name: 'type', label: 'Document type', type: 'select', required: true, half: true, options: ['QID', 'Visa', 'Health card', 'Passport', 'Contract', 'Other'].map(v => ({ value: v, label: v })) },
        { name: 'number', label: 'Number', half: true },
        { name: 'expiry', label: 'Expiry date', type: 'date', required: true },
        { name: 'photo', label: 'Document file', type: 'photo', required: true, hint: 'A clear photo (take it with your phone) or a PDF, up to 10 MB.' },
    ];
    return (
        <div className="stack">
            <div className="kpis">
                <Kpi label="Documents" value={items.length} />
                <Kpi label="Expired" value={items.filter(d => d.expiry < today()).length} tone={items.some(d => d.expiry < today()) ? 'bad' : undefined} />
                <Kpi label="Expiring in 30 days" value={items.filter(d => d.expiry >= today() && d.expiry <= soon).length} tone={items.some(d => d.expiry >= today() && d.expiry <= soon) ? 'warn' : undefined} />
            </div>
            <Panel title="Staff documents" subtitle="Residency, visa and health card dates so nothing lapses">
                <CrudTable collection="staffDocs" companyId={companyId} noun="document" addLabel="Add document" fields={fields} defaults={{ type: 'QID' }}
                    onChange={(a, d) => { if (a === 'delete' && (d as StaffDoc).photo) void deletePhoto((d as StaffDoc).photo!); }}
                    cols={[
                        { key: 's', header: 'Staff', render: d => staffName(db, d.staffId) },
                        { key: 'type', header: 'Type' }, { key: 'number', header: 'Number' },
                        { key: 'ph', header: 'File', render: d => d.photo
                            ? <button className="btn btn-ghost btn-sm" onClick={() => (isPdfRef(d.photo!) ? void openDocument(d.photo!) : setViewing(d))} aria-label="Open document"><DocThumb file={d.photo} /></button>
                            : <span className="tiny">No file</span> },
                        { key: 'exp', header: 'Expires', render: d => dayLabel(d.expiry) },
                        { key: 'st', header: 'Status', render: d => d.expiry < today() ? <Pill tone="bad">Expired</Pill> : d.expiry <= soon ? <Pill tone="warn">Expiring soon</Pill> : <Pill tone="good">Valid</Pill> },
                    ]} />
            </Panel>
            <Modal open={!!viewing} title={viewing ? `${viewing.type}, ${staffName(db, viewing.staffId)}` : ''} onClose={() => setViewing(null)}>
                {viewing?.photo && <PhotoImg src={viewing.photo} alt="Document" style={{ width: '100%', borderRadius: 12 }} />}
            </Modal>
        </div>
    );
};

/* -------------------------------- leave --------------------------------- */

const LeaveTab: React.FC<{ companyId: string }> = ({ companyId }) => {
    const { user } = useAuth();
    const db = useDB();
    const staff = db.staff.filter(s => s.companyId === companyId);
    const { items } = useCollection('leave', companyId);
    const fields: FieldDef[] = [
        { name: 'staffId', label: 'Staff member', type: 'select', required: true, options: staff.map(s => ({ value: s.id, label: staffName(db, s.id) })) },
        { name: 'type', label: 'Type', type: 'select', required: true, options: ['Annual leave', 'Sick leave', 'Unpaid leave', 'Emergency'].map(v => ({ value: v, label: v })) },
        { name: 'start', label: 'From', type: 'date', required: true, half: true },
        { name: 'end', label: 'To', type: 'date', required: true, half: true },
        { name: 'note', label: 'Note', type: 'textarea' },
    ];
    const decide = (id: string, status: 'approved' | 'rejected', name: string) => {
        updateItem('leave', id, { status });
        logActivity(companyId, user?.name || 'Owner', `${status === 'approved' ? 'Approved' : 'Rejected'} leave request`, name);
    };
    return (
        <div className="stack">
            <div className="kpis">
                <Kpi label="Waiting for approval" value={items.filter(l => l.status === 'pending').length} tone={items.some(l => l.status === 'pending') ? 'warn' : undefined} />
                <Kpi label="Away today" value={items.filter(l => l.status === 'approved' && inRange(today(), l.start, l.end)).length} />
                <Kpi label="Upcoming approved" value={items.filter(l => l.status === 'approved' && l.start > today()).length} />
            </div>
            <Panel title="Leave requests" subtitle="Approved leave blocks the cleaner on the calendar planning view">
                <CrudTable collection="leave" companyId={companyId} noun="leave request" addLabel="Add leave" fields={fields} defaults={{ status: 'pending', type: 'Annual leave' }}
                    extraRow={l => l.status === 'pending' ? (<>
                        <button className="btn btn-primary btn-sm" onClick={() => decide(l.id, 'approved', staffName(db, l.staffId))}>Approve</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => decide(l.id, 'rejected', staffName(db, l.staffId))}>Reject</button>
                    </>) : null}
                    cols={[
                        { key: 's', header: 'Staff', render: l => staffName(db, l.staffId) }, { key: 'type', header: 'Type' },
                        { key: 'w', header: 'Dates', render: l => `${dayLabel(l.start)} to ${dayLabel(l.end)}` },
                        { key: 'note', header: 'Note' },
                        { key: 'st', header: 'Status', render: l => <Pill tone={l.status === 'approved' ? 'good' : l.status === 'rejected' ? 'bad' : 'warn'}>{l.status}</Pill> },
                    ]} />
            </Panel>
        </div>
    );
};

/* ------------------------------- payroll -------------------------------- */

const PayrollTab: React.FC<{ companyId: string }> = ({ companyId }) => {
    const { user } = useAuth();
    const db = useDB();
    const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [editMeta, setEditMeta] = useState<string | null>(null);
    const { items: payroll } = useCollection('payroll', companyId);
    const { items: metas } = useCollection('staffMeta', companyId);
    const { items: attendance } = useCollection('attendance', companyId);
    const staff = db.staff.filter(s => s.companyId === companyId);
    const metaOf = (id: string) => metas.find(m => m.staffId === id);
    const rows = payroll.filter(p => p.month === month);
    const total = rows.reduce((s, p) => s + p.net, 0);

    const generate = () => {
        let made = 0;
        staff.forEach(s => {
            if (rows.some(p => p.staffId === s.id)) return;
            const m = metaOf(s.id);
            const base = m?.baseSalary || 0;
            const revenue = db.bookings.filter(b => b.cleanerId === s.id && b.status === 'completed' && b.date.startsWith(month)).reduce((a, b) => a + b.price, 0);
            const commission = Math.round(revenue * ((m?.commissionRate || 0) / 100) * 100) / 100;
            const overtimeHours = attendance.filter(a => a.staffId === s.id && a.date.startsWith(month)).reduce((a, r) => a + Math.max(0, hoursBetween(r.checkIn, r.checkOut) - 8), 0);
            const overtime = Math.round(overtimeHours * (m?.overtimeRate || 0) * 100) / 100;
            addItem('payroll', companyId, { staffId: s.id, month, base, commission, overtime, deductions: 0, net: base + commission + overtime, status: 'draft' });
            made++;
        });
        if (!made) alert('Payroll for this month already exists for every staff member.');
        else logActivity(companyId, user?.name || 'Owner', `Generated payroll for ${month}`, `${made} staff`);
    };
    const setDeductions = (id: string, row: { base: number; commission: number; overtime: number; deductions: number }) => {
        const v = prompt('Deductions for this month (QAR)', String(row.deductions));
        if (v === null) return;
        const d = Math.max(0, Number(v) || 0);
        updateItem('payroll', id, { deductions: d, net: row.base + row.commission + row.overtime - d });
    };
    const pay = (id: string) => {
        const p = payroll.find(x => x.id === id); if (!p) return;
        if (!confirm(`Mark ${staffName(db, p.staffId)} as paid ${fmt(p.net)} QAR? This also records a salary expense.`)) return;
        updateItem('payroll', id, { status: 'paid', paidDate: today() });
        addItem('expenses', companyId, { date: today(), category: 'Salaries', description: `Salary ${month}: ${staffName(db, p.staffId)}`, amount: p.net, payrollId: p.id });
        logActivity(companyId, user?.name || 'Owner', `Paid salary ${fmt(p.net)} QAR`, staffName(db, p.staffId));
    };
    const slip = (id: string) => {
        const p = payroll.find(x => x.id === id); if (!p) return;
        printHtml(`Payslip ${month}`, `<h1>Payslip</h1><p class="muted">${format(parseISO(`${month}-01`), 'MMMM yyyy')} · ${escHtml(db.companies.find(c => c.id === companyId)?.name)}</p>
            <p><b>${escHtml(staffName(db, p.staffId))}</b></p>
            <table><tr><th>Item</th><th class="r">QAR</th></tr><tr><td>Basic salary</td><td class="r">${fmt(p.base)}</td></tr>
            <tr><td>Commission</td><td class="r">${fmt(p.commission)}</td></tr><tr><td>Overtime</td><td class="r">${fmt(p.overtime)}</td></tr>
            <tr><td>Deductions</td><td class="r">-${fmt(p.deductions)}</td></tr><tr><td><b>Net pay</b></td><td class="r"><b>${fmt(p.net)}</b></td></tr></table>`);
    };
    const editing = staff.find(s => s.id === editMeta);
    const metaFields: FieldDef[] = [
        { name: 'baseSalary', label: 'Monthly base salary (QAR)', type: 'number', required: true, half: true },
        { name: 'commissionRate', label: 'Commission on completed jobs (%)', type: 'number', half: true },
        { name: 'overtimeRate', label: 'Overtime per hour (QAR)', type: 'number', half: true, hint: 'Hours beyond 8 per day count as overtime' },
        { name: 'languages', label: 'Languages', half: true },
        { name: 'skills', label: 'Skills' },
    ];

    return (
        <div className="stack">
            <div className="kpis">
                <Kpi label="Payroll this month" value={fmt0(total)} unit="QAR" hint={`${rows.length} staff`} />
                <Kpi label="Paid" value={fmt0(rows.filter(p => p.status === 'paid').reduce((s, p) => s + p.net, 0))} unit="QAR" />
                <Kpi label="Still to pay" value={fmt0(rows.filter(p => p.status === 'draft').reduce((s, p) => s + p.net, 0))} unit="QAR" tone={rows.some(p => p.status === 'draft') ? 'warn' : undefined} />
            </div>
            <Panel title="Monthly payroll" subtitle="Base salary + commission + overtime - deductions"
                actions={<>
                    <input className="input-field" type="month" value={month} onChange={e => setMonth(e.target.value)} aria-label="Month" />
                    <button className="btn btn-primary" onClick={generate}>Generate payroll</button>
                    <button className="btn btn-secondary" onClick={() => downloadCsv(`payroll-${month}.csv`, rows.map(p => ({ Staff: staffName(db, p.staffId), Base: p.base, Commission: p.commission, Overtime: p.overtime, Deductions: p.deductions, Net: p.net, Status: p.status })))}>Export CSV</button>
                </>}>
                <Table rows={rows} empty="No payroll for this month yet. Set pay terms below, then generate." cols={[
                    { key: 's', header: 'Staff', render: p => <b style={{ fontWeight: 600 }}>{staffName(db, p.staffId)}</b> },
                    { key: 'b', header: 'Base', align: 'r', render: p => fmt(p.base) },
                    { key: 'c', header: 'Commission', align: 'r', render: p => fmt(p.commission) },
                    { key: 'o', header: 'Overtime', align: 'r', render: p => fmt(p.overtime) },
                    { key: 'd', header: 'Deductions', align: 'r', render: p => p.status === 'draft' ? <button className="btn btn-ghost btn-sm" onClick={() => setDeductions(p.id, p)}>{fmt(p.deductions)}</button> : fmt(p.deductions) },
                    { key: 'n', header: 'Net pay', align: 'r', render: p => <b style={{ fontWeight: 600 }}>{fmt(p.net)}</b> },
                    { key: 'st', header: 'Status', render: p => <Pill tone={p.status === 'paid' ? 'good' : 'warn'}>{p.status === 'paid' ? `Paid ${dayLabel(p.paidDate || '')}` : 'To pay'}</Pill> },
                    { key: 'a', header: '', align: 'r', render: p => (
                        <span style={{ display: 'inline-flex', gap: 4 }}>
                            {p.status === 'draft' && <button className="btn btn-primary btn-sm" onClick={() => pay(p.id)}>Mark paid</button>}
                            <button className="btn btn-secondary btn-sm" onClick={() => slip(p.id)}>Payslip</button>
                        </span>) },
                ]} />
            </Panel>
            <Panel title="Pay terms" subtitle="Set once per person. Payroll uses these every month.">
                <Table rows={staff} empty="No staff yet." cols={[
                    { key: 'n', header: 'Staff', render: s => staffName(db, s.id) },
                    { key: 'b', header: 'Base salary', align: 'r', render: s => `${fmt(metaOf(s.id)?.baseSalary || 0)} QAR` },
                    { key: 'c', header: 'Commission', align: 'r', render: s => `${metaOf(s.id)?.commissionRate || 0}%` },
                    { key: 'o', header: 'Overtime / hour', align: 'r', render: s => `${fmt(metaOf(s.id)?.overtimeRate || 0)} QAR` },
                    { key: 'k', header: 'Skills', render: s => metaOf(s.id)?.skills || '-' },
                    { key: 'a', header: '', align: 'r', render: s => <button className="btn btn-secondary btn-sm" onClick={() => setEditMeta(s.id)}>Edit</button> },
                ]} />
            </Panel>
            <FormModal open={!!editing} title={editing ? `Pay terms: ${staffName(db, editing.id)}` : ''} fields={metaFields}
                initial={{ ...((editing && metaOf(editing.id)) || { baseSalary: 0, commissionRate: 0, overtimeRate: 0 }) }} onClose={() => setEditMeta(null)}
                onSubmit={v => {
                    if (!editing) return;
                    const data: Partial<StaffMeta> = { baseSalary: Number(v.baseSalary) || 0, commissionRate: Number(v.commissionRate) || 0, overtimeRate: Number(v.overtimeRate) || 0, skills: v.skills || '', languages: v.languages || '' };
                    const m = metaOf(editing.id);
                    if (m) updateItem('staffMeta', m.id, data); else addItem('staffMeta', companyId, { staffId: editing.id, baseSalary: 0, commissionRate: 0, overtimeRate: 0, skills: '', languages: '', ...data });
                    setEditMeta(null);
                }} />
        </div>
    );
};

/* ----------------------------- performance ------------------------------ */

const PerformanceTab: React.FC<{ companyId: string }> = ({ companyId }) => {
    const db = useDB();
    const { items: metas } = useCollection('jobMeta', companyId);
    const { items: complaints } = useCollection('complaints', companyId);
    const { items: attendance } = useCollection('attendance', companyId);
    const from = format(addDays(new Date(), -29), 'yyyy-MM-dd');
    const rows = db.staff.filter(s => s.companyId === companyId).map(s => {
        const jobs = db.bookings.filter(b => b.cleanerId === s.id && b.status === 'completed' && b.date >= from);
        const ratings = db.reviews.filter(r => r.cleanerId === s.id);
        const started = jobs.map(j => ({ j, m: metas.find(m => m.bookingId === j.id) })).filter(x => x.m?.startedAt);
        const onTime = started.filter(x => {
            const sched = new Date(`${x.j.date}T${x.j.time}:00`).getTime();
            return new Date(x.m!.startedAt!).getTime() <= sched + 15 * 60000;
        }).length;
        const days = attendance.filter(a => a.staffId === s.id && a.date >= from && (a.status === 'present' || a.status === 'late')).length;
        return {
            id: s.id, name: staffName(db, s.id), jobs: jobs.length, revenue: jobs.reduce((a, j) => a + j.price, 0),
            rating: ratings.length ? ratings.reduce((a, r) => a + r.rating, 0) / ratings.length : s.rating, reviews: ratings.length,
            complaints: complaints.filter(c => c.cleanerId === s.id).length, onTime: started.length ? Math.round((onTime / started.length) * 100) : null, days,
        };
    }).sort((a, b) => b.revenue - a.revenue);
    return (
        <Panel title="Performance, last 30 days" subtitle="Jobs, revenue, ratings, complaints and punctuality"
            actions={<button className="btn btn-secondary btn-sm" onClick={() => downloadCsv('performance.csv', rows.map(r => ({ Staff: r.name, Jobs: r.jobs, Revenue: r.revenue, Rating: r.rating.toFixed(1), Complaints: r.complaints, OnTimePct: r.onTime ?? '', DaysWorked: r.days })))}>Export CSV</button>}>
            <Table rows={rows} empty="No staff yet." cols={[
                { key: 'n', header: 'Staff', render: r => <b style={{ fontWeight: 600 }}>{r.name}</b> },
                { key: 'j', header: 'Jobs done', align: 'r', render: r => r.jobs },
                { key: 'r', header: 'Revenue', align: 'r', render: r => `${fmt0(r.revenue)} QAR` },
                { key: 'q', header: 'Rating', align: 'r', render: r => `${r.rating.toFixed(1)} (${r.reviews})` },
                { key: 'c', header: 'Complaints', align: 'r', render: r => r.complaints ? <Pill tone="warn">{r.complaints}</Pill> : 0 },
                { key: 'o', header: 'On time', align: 'r', render: r => r.onTime === null ? '-' : <Pill tone={r.onTime >= 85 ? 'good' : r.onTime >= 65 ? 'warn' : 'bad'}>{r.onTime}%</Pill> },
                { key: 'd', header: 'Days worked', align: 'r', render: r => r.days },
            ]} />
        </Panel>
    );
};
