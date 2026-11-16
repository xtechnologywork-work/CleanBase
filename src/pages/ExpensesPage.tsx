import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { format, subMonths, parseISO } from 'date-fns';
import { dayLabel, downloadCsv, EXPENSE_CATEGORIES, fmt, fmt0, logActivity, pctChange, useCollection } from '../services/erp';
import { CrudTable, Kpi, PageHeader, Panel } from '../components/shared/ui';
import type { FieldDef } from '../components/shared/ui';

const FIELDS: FieldDef[] = [
    { name: 'date', label: 'Date', type: 'date', required: true, half: true },
    { name: 'category', label: 'Category', type: 'select', required: true, half: true, options: EXPENSE_CATEGORIES.map(c => ({ value: c, label: c })) },
    { name: 'description', label: 'Description', required: true },
    { name: 'amount', label: 'Amount (QAR)', type: 'number', required: true, half: true },
    { name: 'vendor', label: 'Vendor or payee', half: true },
];

export const ExpensesPage: React.FC = () => {
    const { user } = useAuth();
    const companyId = user?.companyId || '';
    const { items } = useCollection('expenses', companyId);
    const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));

    const inMonth = items.filter(e => e.date.startsWith(month));
    const prevMonth = format(subMonths(parseISO(`${month}-01`), 1), 'yyyy-MM');
    const total = inMonth.reduce((s, e) => s + e.amount, 0);
    const prevTotal = items.filter(e => e.date.startsWith(prevMonth)).reduce((s, e) => s + e.amount, 0);
    const byCat = EXPENSE_CATEGORIES.map(c => ({ c, v: inMonth.filter(e => e.category === c).reduce((s, e) => s + e.amount, 0) }))
        .filter(x => x.v > 0).sort((a, b) => b.v - a.v);
    const change = pctChange(total, prevTotal);

    return (
        <div className="pg">
            <PageHeader title="Expenses" subtitle="Everything the business spends. Payroll you mark as paid shows up here automatically.">
                <input className="input-field" type="month" value={month} onChange={e => setMonth(e.target.value)} aria-label="Month" />
                <button className="btn btn-secondary" onClick={() => downloadCsv(`expenses-${month}.csv`, inMonth.map(e => ({
                    Date: e.date, Category: e.category, Description: e.description, Vendor: e.vendor || '', Amount: e.amount,
                })))}>Export CSV</button>
            </PageHeader>

            <div className="kpis">
                <Kpi label="Spent this month" value={fmt0(total)} unit="QAR" hint={<span className={change <= 0 ? 'tone-good' : 'tone-bad'}>{change >= 0 ? '+' : ''}{change.toFixed(1)}% vs last month</span>} />
                <Kpi label="Largest category" value={byCat[0]?.c || 'None'} hint={byCat[0] ? `${fmt0(byCat[0].v)} QAR` : undefined} />
                <Kpi label="Entries" value={inMonth.length} />
                <Kpi label="Average per entry" value={fmt(inMonth.length ? total / inMonth.length : 0, 0)} unit="QAR" />
            </div>

            <div className="grid2">
                <Panel title="All expenses" subtitle={format(parseISO(`${month}-01`), 'MMMM yyyy')}>
                    <CrudTable
                        collection="expenses" companyId={companyId} noun="expense" addLabel="Add expense" fields={FIELDS}
                        defaults={{ date: format(new Date(), 'yyyy-MM-dd'), category: 'Supplies' }}
                        filter={e => e.date.startsWith(month)} empty="No expenses in this month."
                        onChange={(a, r) => logActivity(companyId, user?.name || 'Owner', `${a === 'add' ? 'Added' : a === 'delete' ? 'Deleted' : 'Edited'} expense`, (r as { description: string }).description)}
                        cols={[
                            { key: 'date', header: 'Date', render: r => dayLabel(r.date) },
                            { key: 'category', header: 'Category' },
                            { key: 'description', header: 'Description' },
                            { key: 'vendor', header: 'Vendor' },
                            { key: 'amount', header: 'Amount', align: 'r', render: r => `${fmt(r.amount)} QAR` },
                        ]}
                    />
                </Panel>
                <Panel title="By category">
                    {byCat.length === 0 ? <div className="empty">No spending yet.</div> : byCat.map(x => (
                        <div key={x.c} style={{ marginBottom: 14 }}>
                            <div className="row" style={{ padding: 0, border: 0, marginBottom: 4 }}><span>{x.c}</span><span className="muted">{fmt0(x.v)} QAR</span></div>
                            <div className="bar"><i style={{ width: `${(x.v / total) * 100}%` }} /></div>
                        </div>
                    ))}
                </Panel>
            </div>
        </div>
    );
};
