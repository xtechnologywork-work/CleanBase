import { addDays, addMonths, format, parseISO } from 'date-fns';
import { fmt, getSettings } from './erp';
import type { Contract, ContractTerms, Installment } from './erp';
import type { Client, Company, MockDatabase, Subscription } from '../types';

/** Why a subscription is cancelled. The owner picks one, and adds a note for "Other". */
export const CANCEL_REASONS = [
    'The client moved', 'Too expensive', 'Not happy with the service', 'Moved to another company',
    'No longer needs cleaning', 'Payment problems', 'Other',
];

/** An exact moment for people to read, for example 16 Nov 2026, 14:32. */
export const stamp = (iso?: string) => { try { return iso ? format(parseISO(iso), 'd MMM yyyy, HH:mm') : ''; } catch { return iso || ''; } };

/** How a contract is shown to the owner: signed contracts are Active. */
export function contractBadge(c: Pick<Contract, 'status'>, outOfDate = false): { label: string; tone?: 'good' | 'bad' | 'warn' | 'info' } {
    if (outOfDate) return { label: 'Out of date', tone: 'warn' };
    switch (c.status) {
        case 'signed': return { label: 'Active', tone: 'good' };
        case 'cancelled': return { label: 'Cancelled', tone: 'bad' };
        case 'ended': return { label: 'Ended' };
        default: return { label: 'Draft', tone: 'info' };
    }
}

/** The placeholders a company can use inside its contract text. They are filled in for each client. */
export const CONTRACT_FIELDS: { key: string; label: string }[] = [
    { key: 'client_name', label: 'Client name' },
    { key: 'client_phone', label: 'Client phone' },
    { key: 'client_address', label: 'Client address' },
    { key: 'service', label: 'Service' },
    { key: 'frequency', label: 'How often' },
    { key: 'price', label: 'Price' },
    { key: 'start_date', label: 'Start date' },
    { key: 'end_date', label: 'End date' },
    { key: 'cleaner', label: 'Cleaner' },
    { key: 'company_name', label: 'Company name' },
    { key: 'contract_number', label: 'Contract number' },
    { key: 'today', label: 'Today' },
];

export const FREQUENCY_LABEL: Record<Subscription['frequency'], string> = {
    weekly: 'Every week', 'bi-weekly': 'Every two weeks', monthly: 'Every month', 'live-in': 'Live-in worker',
};
/** Monthly plans and live-in workers are priced per month, the others per visit. */
export const isMonthlyPlan = (f: Subscription['frequency']) => f === 'monthly' || f === 'live-in';
export const priceUnit = (f: Subscription['frequency']) => (isMonthlyPlan(f) ? 'per month' : 'per visit');

/** What one active subscription brings in per month. 52 weeks and 12 months give 4.33 weekly visits per month. */
export const monthlyValue = (s: Pick<Subscription, 'frequency' | 'pricePerVisit'>) =>
    s.frequency === 'weekly' ? (s.pricePerVisit * 52) / 12
        : s.frequency === 'bi-weekly' ? (s.pricePerVisit * 26) / 12
            : s.pricePerVisit;

const day = (iso?: string) => (iso ? iso.slice(0, 10) : '');
const nice = (iso: string) => { try { return format(parseISO(day(iso)), 'd MMMM yyyy'); } catch { return iso; } };

export const termsOf = (s: Subscription): ContractTerms => ({
    clientId: s.clientId, serviceId: s.serviceId, cleanerId: s.cleanerId || undefined, frequency: s.frequency,
    price: Number(s.pricePerVisit), startDate: day(s.startDate), endDate: day(s.endDate) || undefined,
});

/** The subscription changed after this contract was written. Only drafts are flagged; signed contracts stay as signed. */
export function termsChanged(c: Contract, s: Subscription | undefined): boolean {
    if (!s || c.status !== 'draft') return false;
    const a = c.terms, b = termsOf(s);
    return a.clientId !== b.clientId || a.serviceId !== b.serviceId || (a.cleanerId || '') !== (b.cleanerId || '')
        || a.frequency !== b.frequency || a.price !== b.price || a.startDate !== b.startDate || (a.endDate || '') !== (b.endDate || '');
}

export function contractValues(db: MockDatabase, sub: Subscription, number: string): Record<string, string> {
    const client: Client | undefined = db.clients.find(c => c.id === sub.clientId);
    const company: Company | undefined = db.companies.find(c => c.id === sub.companyId);
    const service = db.services.find(s => s.id === sub.serviceId);
    const staff = db.staff.find(s => s.id === sub.cleanerId);
    const cleanerName = staff ? db.users.find(u => u.id === staff.userId)?.name : undefined;
    const settings = getSettings(sub.companyId);
    return {
        client_name: client?.name || '',
        client_phone: client?.phone || '',
        client_address: client?.address || '',
        service: service?.name || '',
        frequency: FREQUENCY_LABEL[sub.frequency],
        price: `${fmt(Number(sub.pricePerVisit))} ${settings.currency || 'QAR'} ${priceUnit(sub.frequency)}`,
        start_date: nice(sub.startDate),
        end_date: sub.endDate ? nice(sub.endDate) : 'Open-ended (until either side ends it)',
        cleaner: cleanerName || 'To be assigned',
        company_name: settings.legalName || company?.name || '',
        contract_number: number,
        today: format(new Date(), 'd MMMM yyyy'),
    };
}

/** Replace {placeholders} with real values. Unknown placeholders are left as they are so a typo is easy to spot. */
export const fillContract = (text: string, values: Record<string, string>) =>
    text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k] : m));

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Open the print window. Two copies prints one page for the company and one for the client. */
export function printContract(c: Contract, companyName: string, copies: 1 | 2) {
    const w = window.open('', '_blank', 'width=860,height=1000');
    if (!w) { alert('Allow pop-ups to print.'); return; }
    const page = (label: string) => `
    <section class="page">
        <header><div class="co">${esc(companyName)}</div><div class="no">${esc(c.number)}<br><span>${esc(label)}</span></div></header>
        <h1 dir="auto">${esc(c.title)}</h1>
        <div class="body" dir="auto">${esc(c.body)}</div>
        <div class="sign">
            <div><div class="line"></div>${esc(companyName)}<br><span>Name, signature and date</span></div>
            <div><div class="line"></div>The client<br><span>Name, signature and date</span></div>
        </div>
        ${c.signedAt ? `<p class="meta">Signed on ${esc(nice(c.signedAt))}</p>` : ''}
    </section>`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.number)}</title><style>
    @page{size:A4;margin:18mm}
    *{box-sizing:border-box}body{margin:0;font:14px/1.65 -apple-system,"Segoe UI",Inter,system-ui,sans-serif;color:#1d1d1f}
    .page{page-break-after:always;min-height:240mm;display:flex;flex-direction:column}.page:last-child{page-break-after:auto}
    header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1d1d1f;padding-bottom:12px;margin-bottom:24px}
    .co{font-size:18px;font-weight:700}.no{text-align:right;font-weight:600}.no span{font-weight:400;color:#6e6e73;font-size:12px}
    h1{font-size:24px;letter-spacing:-.02em;margin:0 0 18px}.body{white-space:pre-wrap;flex:1}
    .sign{display:flex;gap:48px;margin-top:56px}.sign>div{flex:1;font-weight:600}.sign span{font-weight:400;color:#6e6e73;font-size:12px}
    .line{border-bottom:1px solid #1d1d1f;height:48px;margin-bottom:6px}.meta{color:#6e6e73;font-size:12px;margin-top:20px}
    </style></head><body>${page(copies === 2 ? 'Company copy' : '')}${copies === 2 ? page('Client copy') : ''}<script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
}

/* ------------------------------ monthly payments ------------------------------ */

/** The payment plan: one payment per month, the first on the signing date. Each date counts from the signing date, so 31 January is followed by 28 February and then 31 March. */
export function buildSchedule(sub: Pick<Subscription, 'frequency' | 'pricePerVisit'>, signedOn: string, months: number): Installment[] {
    const start = parseISO(day(signedOn));
    const amount = Math.round(monthlyValue(sub) * 100) / 100;
    return Array.from({ length: Math.max(0, Math.min(60, Math.floor(months))) }, (_, i) => ({ n: i + 1, due: format(addMonths(start, i), 'yyyy-MM-dd'), amount }));
}

export type InstallmentState = 'paid' | 'overdue' | 'due-soon' | 'upcoming';
export function installmentState(i: Installment, now = format(new Date(), 'yyyy-MM-dd')): InstallmentState {
    if (i.paidOn) return 'paid';
    if (i.due < now) return 'overdue';
    return i.due <= format(addDays(parseISO(now), 7), 'yyyy-MM-dd') ? 'due-soon' : 'upcoming';
}

export function scheduleStats(list: Installment[] | undefined, now?: string) {
    const rows = list || [];
    const paid = rows.filter(i => i.paidOn);
    const late = rows.filter(i => installmentState(i, now) === 'overdue');
    const next = rows.filter(i => !i.paidOn).sort((a, b) => a.due.localeCompare(b.due))[0];
    return {
        total: rows.length, paid: paid.length, late: late.length,
        collected: paid.reduce((s, i) => s + (i.paidAmount ?? i.amount), 0),
        lateAmount: late.reduce((s, i) => s + i.amount, 0),
        remaining: rows.filter(i => !i.paidOn).reduce((s, i) => s + i.amount, 0),
        next,
    };
}
