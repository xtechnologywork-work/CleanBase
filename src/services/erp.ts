import { useEffect, useMemo, useState } from 'react';
import { addDays, format, parseISO, startOfYear, subDays } from 'date-fns';
import { getDB, saveDB } from './mockDb';
import { ERP_KEY, isCloud } from './backend';
import type { MockDatabase, UserRole } from '../types';
import { DEFAULT_TEMPLATES, withTemplates } from './bookingMessages';
import type { Trip } from './trips';
import { reservationsOf, reservedOn, reserveModeOf, untilText } from './reservations';
import type { Reservation } from './reservations';

/* ------------------------------------------------------------------ */
/*  ERP store: everything the owner needs beyond the core CRM tables.  */
/*  Lives in its own localStorage key so the core DB stays untouched.  */
/* ------------------------------------------------------------------ */

const KEY = ERP_KEY;
const EVT = 'cleanbase-data-changed';

export interface Base { id: string; companyId: string; createdAt: string }

export interface InvoiceItem { description: string; qty: number; price: number }
export interface Invoice extends Base {
    number: string; clientId: string; bookingIds: string[]; issueDate: string; dueDate: string;
    items: InvoiceItem[]; discount: number; taxRate: number; notes?: string;
    status: 'draft' | 'sent' | 'cancelled';
}
export type PayMethod = 'cash' | 'card' | 'bank' | 'online';
export interface Payment extends Base {
    invoiceId?: string; clientId?: string; amount: number; method: PayMethod; date: string;
    reference?: string; kind: 'payment' | 'refund';
}
export const EXPENSE_CATEGORIES = ['Supplies', 'Salaries', 'Fuel', 'Vehicle maintenance', 'Rent', 'Visas and permits', 'Marketing', 'Utilities', 'Insurance', 'Other'] as const;
export interface Expense extends Base {
    date: string; category: string; description: string; amount: number; vendor?: string; payrollId?: string;
}
export interface Zone extends Base { name: string; areas: string; surcharge: number }
export interface Vehicle extends Base {
    name: string; plate: string; driverId?: string; capacity: number;
    status: 'active' | 'maintenance'; insuranceExpiry?: string;
}
export interface Supply extends Base { name: string; unit: string; stock: number; minStock: number; costPerUnit: number }
export interface SupplyUsage extends Base { supplyId: string; qty: number; date: string; bookingId?: string; note?: string }
export interface ChecklistItem { id: string; text: string; done: boolean }
export interface JobMeta extends Base {
    bookingId: string; zoneId?: string; vehicleId?: string; checklist: ChecklistItem[]; notes: string;
    startedAt?: string; finishedAt?: string; photosBefore: string[]; photosAfter: string[];
}
export interface StaffMeta extends Base {
    staffId: string; baseSalary: number; commissionRate: number; overtimeRate: number; skills: string; languages: string;
}
export interface StaffDoc extends Base { staffId: string; type: string; number: string; expiry: string; photo?: string }
export interface Attendance extends Base {
    staffId: string; date: string; checkIn?: string; checkOut?: string; status: 'present' | 'late' | 'absent' | 'leave';
}
export interface Leave extends Base {
    staffId: string; type: string; start: string; end: string; status: 'pending' | 'approved' | 'rejected'; note?: string;
}
export interface Payroll extends Base {
    staffId: string; month: string; base: number; commission: number; overtime: number; deductions: number;
    net: number; status: 'draft' | 'paid'; paidDate?: string;
}
export const LEAD_STAGES = ['new', 'contacted', 'quoted', 'won', 'lost'] as const;
export type LeadStage = typeof LEAD_STAGES[number];
export interface Lead extends Base {
    name: string; phone: string; source: string; interest: string; stage: LeadStage; value: number; notes?: string;
}
export interface Quote extends Base {
    number: string; customerName: string; phone: string; address: string; items: InvoiceItem[]; discount: number;
    validUntil: string; status: 'draft' | 'sent' | 'accepted' | 'declined'; leadId?: string;
}
export interface Complaint extends Base {
    clientId: string; bookingId?: string; cleanerId?: string; subject: string; details: string;
    severity: 'low' | 'medium' | 'high'; status: 'open' | 'investigating' | 'resolved'; resolution?: string;
}
export interface Promo extends Base {
    code: string; type: 'percent' | 'fixed'; value: number; expiry: string; maxUses: number; used: number;
    active: boolean; referrerClientId?: string;
}
export interface ClientMeta extends Base {
    clientId: string; properties: { id: string; label: string; address: string; notes: string }[];
    notes: string; preferredCleanerId?: string; tags: string;
}
/** A request for a customer review, sent by link. The customer rates on a public page; the owner decides what gets published. */
export interface ReviewRequest extends Base {
    bookingId: string; clientId: string; cleanerId?: string; token: string;
    status: 'sent' | 'submitted' | 'accepted' | 'rejected';
    clientName: string; serviceName: string; serviceDate: string; cleanerName?: string;
    /** Where the customer was sent: our private page, or the company's Google Maps review link. */
    channel?: 'private' | 'google';
    sentAt: string; rating?: number; comment?: string; submittedAt?: string; decidedAt?: string;
}
export interface Activity extends Base { actor: string; action: string; target?: string }
/** Opening hours of one weekday. Open or closed, and when it opens and closes (HH:mm). */
export interface DayHours { open: boolean; start: string; end: string }
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** Seven days, Monday first, all open from start to end. */
export const sameWeek = (start: string, end: string): DayHours[] => WEEKDAY_NAMES.map(() => ({ open: true, start, end }));

export interface BizSettings extends Base {
    /** Opening hours for each weekday, Monday first. When missing, workStart and workEnd apply to every day. */
    weekHours?: DayHours[];
    legalName: string; taxId: string; taxRate: number; invoicePrefix: string; invoiceFooter: string;
    paymentTermsDays: number; bankDetails: string; workStart: string; workEnd: string;
    minNoticeHours: number; cancellationHours: number; currency: string;
    tplConfirmation: string; tplReminder: string; tplInvoice: string; tplReview?: string; tplReviewGoogle?: string;
    /** Review requests: 'google' sends customers to the company's Google Maps review link, 'private' to our own page. */
    reviewMode?: 'private' | 'google'; googleReviewUrl?: string;
    /** More WhatsApp messages, English and Arabic. A company that never edited them gets the defaults from bookingMessages. */
    tplPending?: string; tplInProgress?: string; tplCompleted?: string; tplCancelled?: string; tplDeclined?: string;
    /** Booking store: the company's time zone and how many days ahead clients may book */
    timezone?: string; bookingDays?: number;
    /** Drivers: minutes from the accommodation to a client (and back). Used to plan when the driver leaves. */
    travelMinutes?: number;
    /** Which subscriptions keep their cleaner for the client during the period: 'monthly' (default), 'all' or 'off'. See services/reservations. */
    reserveCleaners?: 'monthly' | 'all' | 'off';
}

/** A contract the company wrote once and reuses. The body holds {placeholders} that are filled for each client. */
export interface ContractTemplate extends Base { name: string; title: string; body: string; isDefault?: boolean }
/** The terms a contract was written for. If the subscription changes later, the contract is flagged as out of date. */
export interface ContractTerms { clientId: string; serviceId: string; cleanerId?: string; frequency: string; price: number; startDate: string; endDate?: string }
/** One monthly payment of a signed contract. Marking it paid also records a real payment, so cash and lifetime spend stay right. */
export interface Installment {
    n: number; due: string; amount: number;
    paidOn?: string; paidAmount?: number; method?: PayMethod; paymentId?: string;
}
export interface Contract extends Base {
    number: string; subscriptionId: string; clientId: string; templateId?: string; title: string;
    /** The final text, already filled in. Drafts can be edited. */
    body: string;
    /** The template text with {placeholders}, kept so a draft can be regenerated. Empty for a contract written from scratch. */
    source: string;
    status: 'draft' | 'signed' | 'ended' | 'cancelled';
    terms: ContractTerms; signedAt?: string; endedAt?: string;
    cancelledAt?: string; cancelReason?: string; cancelNote?: string; cancelledBy?: string;
    /** Monthly payment plan, created when the contract is signed. The first one is due on the signing date. */
    installments?: Installment[];
}

/** Where cleaners live. The driver picks them up there before a job and brings them back after. */
export interface Accommodation extends Base { name: string; address: string; mapUrl?: string; notes?: string }
export type { Trip, TripStage, TripEvent } from './trips';

export interface Collections {
    trips: Trip; accommodations: Accommodation;
    invoices: Invoice; payments: Payment; expenses: Expense; zones: Zone; vehicles: Vehicle; supplies: Supply;
    supplyUsage: SupplyUsage; jobMeta: JobMeta; staffMeta: StaffMeta; staffDocs: StaffDoc; attendance: Attendance;
    leave: Leave; payroll: Payroll; leads: Lead; quotes: Quote; complaints: Complaint; promos: Promo;
    clientMeta: ClientMeta; reviewRequests: ReviewRequest; contractTemplates: ContractTemplate; contracts: Contract; activity: Activity; settings: BizSettings;
}
export type CollectionName = keyof Collections;

type Store = { [K in CollectionName]?: Collections[K][] };

let cache: Store | null = null;
const readStore = (): Store => {
    if (cache) return cache;
    try { cache = JSON.parse(localStorage.getItem(KEY) || '{}') as Store; } catch { cache = {}; }
    return cache;
};
const writeStore = (s: Store) => {
    cache = s;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {
        alert('Browser storage is full. Remove some photos or demo data.');
    }
    window.dispatchEvent(new Event(EVT));
    window.dispatchEvent(new Event('cleanbase-save'));
};
export const resetErpCache = () => { cache = null; };
if (typeof window !== 'undefined') {
    window.addEventListener('storage', e => { if (e.key === KEY) { cache = null; window.dispatchEvent(new Event(EVT)); } });
}

export const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const nowIso = () => new Date().toISOString();

export function readCollection<K extends CollectionName>(name: K, companyId?: string): Collections[K][] {
    const all = (readStore()[name] || []) as Collections[K][];
    return companyId ? all.filter(i => i.companyId === companyId) : all;
}

export type NewItem<T> = Omit<T, 'id' | 'companyId' | 'createdAt'> & Partial<Base>;

export function addItem<K extends CollectionName>(name: K, companyId: string, data: NewItem<Collections[K]>): Collections[K] {
    const store = { ...readStore() };
    const item = { id: uid(name.slice(0, 3)), companyId, createdAt: nowIso(), ...data } as Collections[K];
    store[name] = [...((store[name] || []) as Collections[K][]), item] as never;
    writeStore(store);
    return item;
}
export function updateItem<K extends CollectionName>(name: K, id: string, patch: Partial<Collections[K]>) {
    const store = { ...readStore() };
    store[name] = ((store[name] || []) as Collections[K][]).map(i => (i.id === id ? { ...i, ...patch } : i)) as never;
    writeStore(store);
}
export function removeItem(name: CollectionName, id: string) {
    const store = { ...readStore() };
    store[name] = ((store[name] || []) as Base[]).filter(i => i.id !== id) as never;
    writeStore(store);
}
export function removeWhere(name: CollectionName, pred: (i: Base) => boolean) {
    const store = { ...readStore() };
    store[name] = ((store[name] || []) as Base[]).filter(i => !pred(i)) as never;
    writeStore(store);
}

/* Mutate the core DB and notify every listener. */
export function mutateDB(fn: (db: MockDatabase) => void) {
    const db = getDB();
    fn(db);
    saveDB(db);
    window.dispatchEvent(new Event(EVT));
}

export function logActivity(companyId: string, actor: string, action: string, target?: string) {
    const store = { ...readStore() };
    const list = (store.activity || []) as Activity[];
    const entry: Activity = { id: uid('act'), companyId, createdAt: nowIso(), actor, action, target };
    store.activity = [entry, ...list].slice(0, 400);
    writeStore(store);
}

function useTick() {
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const h = () => setTick(t => t + 1);
        window.addEventListener(EVT, h);
        return () => window.removeEventListener(EVT, h);
    }, []);
    return tick;
}

export function useCollection<K extends CollectionName>(name: K, companyId?: string) {
    const tick = useTick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const items = useMemo(() => readCollection(name, companyId), [tick, name, companyId]);
    return {
        items,
        add: (data: NewItem<Collections[K]>) => addItem(name, companyId || '', data),
        update: (id: string, patch: Partial<Collections[K]>) => updateItem(name, id, patch),
        remove: (id: string) => removeItem(name, id),
    };
}

export function useDB(): MockDatabase {
    const tick = useTick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useMemo(() => getDB(), [tick]);
}

/* ------------------------------ settings ------------------------------ */

export const DEFAULT_REVIEW_TEMPLATE: string = DEFAULT_TEMPLATES.tplReview;

export const defaultSettings = (companyId: string): BizSettings => ({
    id: `set-${companyId}`, companyId, createdAt: '2000-01-01T00:00:00.000Z',
    legalName: '', taxId: '', taxRate: 0, invoicePrefix: 'INV', invoiceFooter: 'Thank you for choosing us.',
    paymentTermsDays: 7, bankDetails: '', workStart: '07:00', workEnd: '19:00', minNoticeHours: 12, cancellationHours: 24,
    currency: 'QAR',
    ...DEFAULT_TEMPLATES,
});
export function useSettings(companyId?: string) {
    const { items, add, update } = useCollection('settings', companyId);
    const current = withTemplates(items[0] || defaultSettings(companyId || ''));
    const save = (patch: Partial<BizSettings>) => {
        if (items[0]) update(items[0].id, patch); else add({ ...current, ...patch });
    };
    return { settings: current, save };
}
export const getSettings = (companyId: string) =>
    withTemplates(readCollection('settings', companyId)[0] || defaultSettings(companyId));

/* ------------------------------ formatting ---------------------------- */

export const fmt = (n: number, digits = 2) =>
    (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmt0 = (n: number) => fmt(n, 0);
export const today = () => format(new Date(), 'yyyy-MM-dd');
export const dayLabel = (d: string) => { try { return format(parseISO(d), 'd MMM yyyy'); } catch { return d; } };
export const shortDay = (d: string) => { try { return format(parseISO(d), 'd MMM'); } catch { return d; } };

export function downloadCsv(filename: string, rows: Record<string, string | number>[]) {
    if (!rows.length) { alert('Nothing to export yet.'); return; }
    const cols = Object.keys(rows[0]);
    const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.map(esc).join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

/** Text typed by people (a client name from the public booking page, an address...) must be escaped before it goes into HTML. */
export const escHtml = (v: unknown): string =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Opens a print window. `body` is trusted markup: every value typed by a person inside it must go through escHtml. */
export function printHtml(title: string, body: string) {
    const w = window.open('', '_blank', 'width=820,height=900');
    if (!w) { alert('Allow pop-ups to print.'); return; }
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${escHtml(title)}</title><style>
    body{font:15px/1.5 Inter,system-ui,sans-serif;color:#1d1d1f;margin:40px}h1{font-size:28px;letter-spacing:-.03em;margin:0 0 4px}
    table{width:100%;border-collapse:collapse;margin:20px 0}th,td{padding:10px 8px;text-align:left;border-bottom:1px solid #e8e8ed}
    th{font-size:13px;color:#6e6e73}td.r,th.r{text-align:right}.muted{color:#6e6e73}.tot{display:flex;justify-content:space-between;max-width:280px;margin-left:auto;padding:4px 0}
    .big{font-size:20px;font-weight:600}</style>${body}<script>window.onload=()=>window.print()</script>`);
    w.document.close();
}

/* ------------------------------ periods ------------------------------- */

export type Period = '7d' | '30d' | '90d' | 'ytd';
export const PERIOD_LABEL: Record<Period, string> = { '7d': '7 days', '30d': '30 days', '90d': '90 days', ytd: 'This year' };
export function rangeFor(period: Period, now = new Date()) {
    const to = format(now, 'yyyy-MM-dd');
    if (period === 'ytd') {
        const start = startOfYear(now);
        const days = Math.max(1, Math.round((now.getTime() - start.getTime()) / 86400000) + 1);
        return {
            from: format(start, 'yyyy-MM-dd'), to,
            prevFrom: format(subDays(start, days), 'yyyy-MM-dd'), prevTo: format(subDays(start, 1), 'yyyy-MM-dd'), days,
        };
    }
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const from = subDays(now, days - 1);
    return {
        from: format(from, 'yyyy-MM-dd'), to, days,
        prevFrom: format(subDays(from, days), 'yyyy-MM-dd'), prevTo: format(subDays(from, 1), 'yyyy-MM-dd'),
    };
}
export const inRange = (d: string, from: string, to: string) => d >= from && d <= to;
export const pctChange = (cur: number, prev: number) => (prev === 0 ? (cur === 0 ? 0 : 100) : ((cur - prev) / prev) * 100);

/* ------------------------------ finance ------------------------------- */

export const invoiceSubtotal = (inv: Invoice) => inv.items.reduce((s, i) => s + i.qty * i.price, 0);
export const invoiceTax = (inv: Invoice) => Math.max(0, invoiceSubtotal(inv) - inv.discount) * (inv.taxRate / 100);
export const invoiceTotal = (inv: Invoice) => Math.max(0, invoiceSubtotal(inv) - inv.discount) + invoiceTax(inv);
export const invoicePaid = (inv: Invoice, payments: Payment[]) =>
    payments.filter(p => p.invoiceId === inv.id).reduce((s, p) => s + (p.kind === 'refund' ? -p.amount : p.amount), 0);
export type InvoiceState = 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'cancelled';
export function invoiceState(inv: Invoice, payments: Payment[]): InvoiceState {
    if (inv.status === 'cancelled') return 'cancelled';
    const total = invoiceTotal(inv), paid = invoicePaid(inv, payments);
    if (total > 0 && paid >= total - 0.005) return 'paid';
    if (inv.status === 'draft') return 'draft';
    if (inv.dueDate < today()) return 'overdue';
    return paid > 0 ? 'partial' : 'sent';
}

export function cashIn(db: MockDatabase, companyId: string, from: string, to: string) {
    const invoices = readCollection('invoices', companyId);
    const payments = readCollection('payments', companyId);
    const covered = new Set(invoices.flatMap(i => i.bookingIds));
    const fromPayments = payments.filter(p => inRange(p.date, from, to)).reduce((s, p) => s + (p.kind === 'refund' ? -p.amount : p.amount), 0);
    const fromBookings = db.bookings
        .filter(b => b.companyId === companyId && b.paymentStatus === 'paid' && !covered.has(b.id) && b.status !== 'cancelled' && inRange(b.date, from, to))
        .reduce((s, b) => s + b.price, 0);
    return fromPayments + fromBookings;
}
export const revenueIn = (db: MockDatabase, companyId: string, from: string, to: string) =>
    db.bookings.filter(b => b.companyId === companyId && b.status === 'completed' && inRange(b.date, from, to)).reduce((s, b) => s + b.price, 0);
export const expensesIn = (companyId: string, from: string, to: string) =>
    readCollection('expenses', companyId).filter(e => inRange(e.date, from, to)).reduce((s, e) => s + e.amount, 0);

export function outstanding(db: MockDatabase, companyId: string) {
    const invoices = readCollection('invoices', companyId);
    const payments = readCollection('payments', companyId);
    const covered = new Set(invoices.flatMap(i => i.bookingIds));
    let invoiced = 0, overdue = 0, overdueCount = 0;
    invoices.forEach(inv => {
        const st = invoiceState(inv, payments);
        if (st === 'draft' || st === 'cancelled' || st === 'paid') return;
        const bal = invoiceTotal(inv) - invoicePaid(inv, payments);
        invoiced += bal;
        if (st === 'overdue') { overdue += bal; overdueCount++; }
    });
    const uninvoiced = db.bookings
        .filter(b => b.companyId === companyId && b.status === 'completed' && b.paymentStatus !== 'paid' && !covered.has(b.id))
        .reduce((s, b) => s + b.price, 0);
    const uninvoicedCount = db.bookings.filter(b => b.companyId === companyId && b.status === 'completed' && b.paymentStatus !== 'paid' && !covered.has(b.id)).length;
    return { invoiced, overdue, overdueCount, uninvoiced, uninvoicedCount, total: invoiced + uninvoiced };
}

export function nextNumber(prefix: string, existing: string[]) {
    const nums = existing.map(n => parseInt(n.replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
    return `${prefix}-${String((nums.length ? Math.max(...nums) : 1000) + 1)}`;
}

/* ------------------------------ operations ---------------------------- */

export const toMinutes = (t: string) => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
export const minutesToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Every cleaner kept by a subscription today, by the company's own rule. */
export function reservationsFor(db: MockDatabase, companyId: string): Reservation[] {
    return reservationsOf(db.subscriptions.filter(s => s.companyId === companyId), readCollection('contracts', companyId), reserveModeOf(getSettings(companyId)));
}

/**
 * Why a cleaner cannot take a job on this day because a subscription keeps her for another client ('' when she can).
 * The client who owns the subscription, and the subscription's own visits, are never blocked.
 */
export function reservedMessage(db: MockDatabase, companyId: string, cleanerId: string, date: string, clientId?: string, subscriptionId?: string): string {
    const r = reservedOn(reservationsFor(db, companyId), cleanerId, date, clientId, subscriptionId);
    if (!r) return '';
    return `${staffName(db, cleanerId)} is kept for ${db.clients.find(c => c.id === r.clientId)?.name || 'another client'} ${untilText(r, d => dayLabel(d))}, so she cannot take this job.`;
}

/** The team members who clean: everyone on the team except the drivers, who have their own pages and are never given a cleaning job. */
export const cleanersOf = (db: MockDatabase, companyId: string) =>
    db.staff.filter(s => s.companyId === companyId && db.users.find(u => u.id === s.userId)?.role !== 'driver');

export function findConflict(db: MockDatabase, companyId: string, cleanerId: string, date: string, time: string, duration: number, excludeId?: string) {
    const start = toMinutes(time), end = start + duration;
    return db.bookings.find(b => {
        if (b.companyId !== companyId || b.id === excludeId || b.cleanerId !== cleanerId || b.date !== date) return false;
        if (b.status === 'cancelled') return false;
        const dur = db.services.find(s => s.id === b.serviceId)?.durationMinutes || 120;
        const bs = toMinutes(b.time), be = bs + dur;
        return start < be && bs < end;
    });
}

export const DEFAULT_CHECKLIST = ['Dust all surfaces', 'Vacuum and mop floors', 'Clean kitchen and appliances', 'Clean bathrooms and toilets', 'Empty bins', 'Final walkthrough with client'];
export const newChecklist = (): ChecklistItem[] => DEFAULT_CHECKLIST.map(text => ({ id: uid('ck'), text, done: false }));

export function jobMetaFor(companyId: string, bookingId: string): JobMeta | undefined {
    return readCollection('jobMeta', companyId).find(j => j.bookingId === bookingId);
}

export const roleLabel = (r: UserRole) => ({
    companyadmin: 'Owner', manager: 'Manager', dispatcher: 'Dispatcher', accountant: 'Accountant',
    staff: 'Staff', driver: 'Driver', cleaner: 'Cleaner', superadmin: 'Super admin',
}[r] || r);

/* ------------------------------ demo data ----------------------------- */

const pick = <T,>(arr: T[], i: number) => arr[i % arr.length];
function rng(seed: number) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

export function hasDemo(companyId: string) {
    return getDB().clients.some(c => c.companyId === companyId && c.id.startsWith('demo-'));
}

export function seedDemo(companyId: string) {
    if (isCloud || hasDemo(companyId)) return; // sample data is for local demo mode

    const r = rng(42);
    const db = getDB();
    const nowD = new Date();
    const dstr = (offset: number) => format(addDays(nowD, offset), 'yyyy-MM-dd');
    const iso = (offset: number) => addDays(nowD, offset).toISOString();

    // Services
    const svcDefs = [
        ['Standard home cleaning', 'Regular clean for apartments and villas', 150, 120],
        ['Deep cleaning', 'Top to bottom deep clean', 320, 240],
        ['Move-in / move-out', 'Empty property clean', 450, 300],
        ['Office cleaning', 'Commercial space clean', 380, 180],
        ['Carpet and sofa', 'Steam cleaning', 220, 120],
    ] as const;
    const services = db.services.filter(s => s.companyId === companyId);
    svcDefs.forEach((d, i) => {
        if (!services.find(s => s.name === d[0])) {
            const s = { id: `demo-svc-${i}`, companyId, name: d[0], description: d[1], price: d[2], durationMinutes: d[3], createdAt: nowIso() };
            db.services.push(s); services.push(s);
        }
    });

    // Cleaners
    const cleanerNames = ['Amal Fernando', 'Joseph Mendes', 'Priya Nair', 'Maria Santos', 'Ahmed Khalil', 'Grace Wanjiru'];
    const nats = ['Sri Lankan', 'Indian', 'Indian', 'Filipino', 'Egyptian', 'Kenyan'];
    const staffIds: string[] = [];
    cleanerNames.forEach((name, i) => {
        const uidv = `demo-u-${i}`, sid = `demo-st-${i}`;
        db.users.push({ id: uidv, email: `${name.split(' ')[0].toLowerCase()}@demo.qa`, name, role: i === 4 ? 'driver' : 'cleaner', companyId, status: 'active', createdAt: nowIso() });
        db.staff.push({ id: sid, companyId, userId: uidv, phone: `+974 55${String(100000 + i * 3711).slice(0, 6)}`, age: 24 + i * 3, nationality: nats[i], rating: 4 + r() * 0.9, completedJobsCount: 0, revenueGenerated: 0, createdAt: nowIso() });
        staffIds.push(sid);
    });
    const cleanerIds = staffIds.filter((_, i) => i !== 4);

    // Clients
    const clientDefs = [
        ['Fatima Al Thani', 'West Bay, Tower 12, Apt 804'], ['Mark Reynolds', 'The Pearl, Porto Arabia 21'], ['Noor Hassan', 'Lusail, Marina Residences'],
        ['Khalid Al Marri', 'Al Sadd, Villa 7'], ['Sofia Petrova', 'Msheireb Downtown, Building 4'], ['Omar Saleh', 'Al Waab, Villa 31'],
        ['Qatar Trade Office', 'Corniche, Tower 3, Floor 9'], ['Layla Mahmoud', 'Old Airport, Villa 18'], ['James Okafor', 'Al Gharrafa, Compound 5'], ['Dana Bright', 'Bin Mahmoud, Apt 12'],
    ];
    const clientIds: string[] = [];
    clientDefs.forEach((c, i) => {
        const id = `demo-cl-${i}`;
        db.clients.push({ id, companyId, name: c[0], phone: `+974 33${String(200000 + i * 7919).slice(0, 6)}`, address: c[1], totalSpent: 0, createdAt: iso(-90 + i * 4) });
        clientIds.push(id);
    });

    // Bookings over the last 75 days and the next 7
    let n = 0;
    const spent: Record<string, number> = {};
    for (let off = -75; off <= 7; off++) {
        const jobs = off < 0 ? Math.floor(r() * 4) + 2 : 3 + Math.floor(r() * 3);
        for (let j = 0; j < jobs; j++) {
            const svc = pick(services, Math.floor(r() * 50));
            const ci = Math.floor(r() * clientIds.length);
            const past = off < 0, todayish = off === 0;
            const roll = r();
            const status = past ? (roll < 0.08 ? 'cancelled' : 'completed') : todayish ? (roll < 0.4 ? 'completed' : roll < 0.6 ? 'in_progress' : 'confirmed') : (roll < 0.75 ? 'confirmed' : 'pending');
            const unassigned = !past && r() < 0.18;
            const cleanerId = unassigned ? undefined : pick(cleanerIds, Math.floor(r() * 20));
            const startH = 8 + Math.floor(r() * 7);
            const time = `${String(startH).padStart(2, '0')}:${r() < 0.5 ? '00' : '30'}`;
            if (cleanerId && findConflict(db, companyId, cleanerId, dstr(off), time, svc.durationMinutes)) continue;
            const id = `demo-bk-${n++}`;
            const paid = status === 'completed' && (off < -20 ? r() < 0.93 : r() < 0.55);
            db.bookings.push({
                id, companyId, clientId: clientIds[ci], serviceId: svc.id, cleanerId, date: dstr(off), time,
                address: clientDefs[ci][1], price: svc.price, status, paymentStatus: paid ? 'paid' : 'unpaid', createdAt: iso(off - 2),
            });
            if (status === 'completed') spent[clientIds[ci]] = (spent[clientIds[ci]] || 0) + svc.price;
        }
    }
    db.clients.forEach(c => { if (spent[c.id]) c.totalSpent = spent[c.id]; });
    db.staff.forEach(s => {
        if (!s.id.startsWith('demo-st')) return;
        const mine = db.bookings.filter(b => b.cleanerId === s.id && b.status === 'completed');
        s.completedJobsCount = mine.length; s.revenueGenerated = mine.reduce((a, b) => a + b.price, 0);
    });

    // Reviews
    const comments = ['Spotless, very professional.', 'Arrived on time and did a great job.', 'Good, but missed a corner of the balcony.', 'Excellent service, will book again.', 'Friendly team, thorough work.'];
    db.bookings.filter(b => b.id.startsWith('demo-bk') && b.status === 'completed' && b.cleanerId).slice(0, 26).forEach((b, i) => {
        db.reviews.push({ id: `demo-rv-${i}`, companyId, bookingId: b.id, clientId: b.clientId, cleanerId: b.cleanerId!, rating: i % 7 === 0 ? 3 : i % 3 === 0 ? 4 : 5, comment: pick(comments, i), createdAt: iso(-i) });
    });
    saveDB(db);

    // ---- ERP collections ----
    const st = { ...readStore() };
    const push = <K extends CollectionName>(k: K, item: Omit<Collections[K], 'companyId' | 'createdAt'>) => {
        st[k] = [...((st[k] || []) as Collections[K][]), { companyId, createdAt: nowIso(), ...item } as Collections[K]] as never;
    };

    // Zones, vehicles, supplies
    [['West Bay and Pearl', 'West Bay, Pearl, Porto Arabia', 0], ['Lusail', 'Lusail, Marina', 20], ['Doha centre', 'Al Sadd, Msheireb, Corniche, Bin Mahmoud', 0], ['Residential north', 'Al Waab, Al Gharrafa, Old Airport', 10]]
        .forEach((z, i) => push('zones', { id: `demo-zn-${i}`, name: z[0] as string, areas: z[1] as string, surcharge: z[2] as number }));
    [['Van 1', 'QA 482 113', 0], ['Van 2', 'QA 559 204', 4], ['Car 1', 'QA 710 925', 1]].forEach((v, i) =>
        push('vehicles', { id: `demo-vh-${i}`, name: v[0] as string, plate: v[1] as string, driverId: staffIds[v[2] as number], capacity: i === 2 ? 3 : 6, status: i === 1 ? 'maintenance' : 'active', insuranceExpiry: dstr(i === 2 ? 20 : 200) }));
    [['All purpose cleaner', 'bottle', 14, 12, 8], ['Glass cleaner', 'bottle', 9, 10, 7.5], ['Microfiber cloths', 'pack', 25, 10, 18], ['Floor disinfectant', 'litre', 6, 8, 22], ['Bin bags', 'roll', 40, 15, 6], ['Gloves', 'box', 5, 6, 15]]
        .forEach((s, i) => push('supplies', { id: `demo-sp-${i}`, name: s[0] as string, unit: s[1] as string, stock: s[2] as number, minStock: s[3] as number, costPerUnit: s[4] as number }));

    // Staff meta, docs, attendance, leave
    staffIds.forEach((sid, i) => {
        push('staffMeta', { id: `demo-sm-${i}`, staffId: sid, baseSalary: 1400 + i * 100, commissionRate: i === 4 ? 0 : 5, overtimeRate: 12, skills: i % 2 ? 'Deep cleaning, carpets' : 'Home cleaning, offices', languages: i % 2 ? 'English, Hindi' : 'English, Arabic' });
        push('staffDocs', { id: `demo-qd-${i}`, staffId: sid, type: 'QID', number: `2900${100000 + i * 913}`, expiry: dstr(i === 2 ? 12 : i === 3 ? -5 : 150 + i * 30) });
        push('staffDocs', { id: `demo-hc-${i}`, staffId: sid, type: 'Health card', number: `HC-${7000 + i}`, expiry: dstr(i === 1 ? 24 : 220) });
        for (let d = -6; d <= 0; d++) {
            const off = r() < 0.07 && d < 0;
            push('attendance', { id: `demo-at-${i}-${d}`, staffId: sid, date: dstr(d), status: off ? 'absent' : r() < 0.12 ? 'late' : 'present', checkIn: off ? undefined : r() < 0.12 ? '08:25' : '07:55', checkOut: d === 0 ? undefined : off ? undefined : r() < 0.3 ? '18:10' : '16:05' });
        }
    });
    push('leave', { id: 'demo-lv-0', staffId: staffIds[1], type: 'Annual leave', start: dstr(10), end: dstr(14), status: 'pending', note: 'Family visit' });
    push('leave', { id: 'demo-lv-1', staffId: staffIds[3], type: 'Sick leave', start: dstr(-12), end: dstr(-11), status: 'approved' });

    // Job meta for today's and recent jobs
    db.bookings.filter(b => b.id.startsWith('demo-bk') && b.date >= dstr(-1) && b.date <= dstr(1)).forEach(b => {
        const zoneAreas = ['West Bay, Pearl, Porto Arabia', 'Lusail, Marina', 'Al Sadd, Msheireb, Corniche, Bin Mahmoud', 'Al Waab, Al Gharrafa, Old Airport'];
        const zi = zoneAreas.findIndex(z => z.split(',').some(k => b.address.toLowerCase().includes(k.trim().toLowerCase())));
        const zone = zi >= 0 ? `demo-zn-${zi}` : undefined;
        push('jobMeta', {
            id: `demo-jm-${b.id}`, bookingId: b.id, zoneId: zone, vehicleId: b.cleanerId ? 'demo-vh-0' : undefined,
            checklist: newChecklist().map((c, i) => ({ ...c, done: b.status === 'completed' || (b.status === 'in_progress' && i < 3) })),
            notes: '', photosBefore: [], photosAfter: [], startedAt: b.status !== 'confirmed' && b.status !== 'pending' ? `${b.date}T${b.time}:00` : undefined,
            finishedAt: b.status === 'completed' ? `${b.date}T${String(Math.min(19, parseInt(b.time) + 2)).padStart(2, '0')}:10:00` : undefined,
        });
    });

    // Invoices + payments for completed jobs older than 3 days
    const invs = db.bookings.filter(b => b.id.startsWith('demo-bk') && b.status === 'completed' && b.date < dstr(-3));
    const byClient: Record<string, typeof invs> = {};
    invs.forEach(b => { (byClient[b.clientId] ||= []).push(b); });
    let invN = 1000, k = 0;
    const paidIds: string[] = [], unpaidIds: string[] = [];
    Object.entries(byClient).forEach(([cid, bks]) => {
        for (let i = 0; i < bks.length; i += 4) {
            const chunk = bks.slice(i, i + 4);
            const id = `demo-in-${k++}`, issue = chunk[chunk.length - 1].date;
            const due = format(addDays(parseISO(issue), 7), 'yyyy-MM-dd');
            push('invoices', {
                id, number: `INV-${++invN}`, clientId: cid, bookingIds: chunk.map(b => b.id), issueDate: issue, dueDate: due,
                items: chunk.map(b => ({ description: `${services.find(s => s.id === b.serviceId)?.name || 'Cleaning'} on ${shortDay(b.date)}`, qty: 1, price: b.price })),
                discount: 0, taxRate: 0, status: 'sent',
            });
            const total = chunk.reduce((s, b) => s + b.price, 0);
            const roll = r();
            (roll < 0.7 ? paidIds : unpaidIds).push(...chunk.map(b => b.id));
            if (roll < 0.7) push('payments', { id: `demo-py-${id}`, invoiceId: id, clientId: cid, amount: total, method: pick<PayMethod>(['cash', 'card', 'bank', 'online'], Math.floor(r() * 9)), date: [format(addDays(parseISO(issue), 2 + Math.floor(r() * 5)), 'yyyy-MM-dd'), dstr(0)].sort()[0], kind: 'payment' });
            else if (roll < 0.82) push('payments', { id: `demo-py-${id}`, invoiceId: id, clientId: cid, amount: Math.round(total / 2), method: 'bank', date: [due, dstr(0)].sort()[0], kind: 'payment' });
        }
    });

    // Expenses
    for (let m = 0; m < 3; m++) {
        const month = (off: number) => dstr(-m * 30 - off);
        [['Rent', 'Office and storage rent', 4500], ['Utilities', 'Electricity and internet', 650], ['Insurance', 'Public liability insurance', 900]].forEach((e, i) =>
            push('expenses', { id: `demo-ex-${m}-${i}`, date: month(2 + i), category: e[0] as string, description: e[1] as string, amount: e[2] as number, vendor: 'Monthly' }));
        for (let f = 0; f < 4; f++) push('expenses', { id: `demo-ex-f-${m}-${f}`, date: month(5 + f * 6), category: 'Fuel', description: 'Van fuel', amount: 120 + Math.round(r() * 80) });
        push('expenses', { id: `demo-ex-s-${m}`, date: month(8), category: 'Supplies', description: 'Cleaning chemicals restock', amount: 700 + Math.round(r() * 400), vendor: 'Gulf Supplies' });
        push('expenses', { id: `demo-ex-m-${m}`, date: month(12), category: 'Marketing', description: 'Social media ads', amount: 500 });
    }

    // Sales
    [['Hind Al Kuwari', 'Instagram', 'Weekly villa cleaning', 'new', 1800], ['Peter Hall', 'Referral', 'Move-out clean', 'contacted', 450], ['Gulf Logistics', 'Website', 'Office contract', 'quoted', 6200], ['Rania Youssef', 'WhatsApp', 'Deep clean', 'won', 320], ['Chris Tan', 'Google', 'Apartment clean', 'lost', 150]]
        .forEach((l, i) => push('leads', { id: `demo-ld-${i}`, name: l[0] as string, phone: `+974 66${String(300000 + i * 1111).slice(0, 6)}`, source: l[1] as string, interest: l[2] as string, stage: l[3] as LeadStage, value: l[4] as number }));
    push('quotes', { id: 'demo-qt-0', number: 'QT-1001', customerName: 'Gulf Logistics', phone: '+974 66300000', address: 'Salwa Road, Warehouse 4', items: [{ description: 'Office cleaning, 5 visits per week', qty: 4, price: 1550 }], discount: 200, validUntil: dstr(14), status: 'sent' });
    push('quotes', { id: 'demo-qt-1', number: 'QT-1002', customerName: 'Peter Hall', phone: '+974 66300111', address: 'Al Waab, Villa 9', items: [{ description: 'Move-out cleaning', qty: 1, price: 450 }], discount: 0, validUntil: dstr(5), status: 'draft' });
    push('promos', { id: 'demo-pr-0', code: 'WELCOME10', type: 'percent', value: 10, expiry: dstr(60), maxUses: 100, used: 14, active: true });
    push('promos', { id: 'demo-pr-1', code: 'FRIEND50', type: 'fixed', value: 50, expiry: dstr(90), maxUses: 50, used: 6, active: true, referrerClientId: clientIds[0] } as never);
    push('complaints', { id: 'demo-cp-0', clientId: clientIds[1], cleanerId: staffIds[2], subject: 'Balcony not cleaned', details: 'Client reports the balcony was skipped.', severity: 'medium', status: 'investigating' });
    push('complaints', { id: 'demo-cp-1', clientId: clientIds[3], subject: 'Late arrival', details: 'Team arrived 40 minutes late.', severity: 'low', status: 'resolved', resolution: 'Apologised and gave 10% off the next visit.' });
    push('complaints', { id: 'demo-cp-2', clientId: clientIds[5], subject: 'Item damaged', details: 'Glass shelf chipped during cleaning.', severity: 'high', status: 'open' });
    push('clientMeta', { id: 'demo-cm-0', clientId: clientIds[0], properties: [{ id: 'p1', label: 'Home', address: clientDefs[0][1], notes: 'Gate code 4421' }, { id: 'p2', label: 'Office', address: 'West Bay, Tower 2', notes: '' }], notes: 'Prefers fragrance-free products.', preferredCleanerId: staffIds[0], tags: 'VIP, weekly' });
    push('activity', { id: 'demo-ac-0', actor: 'System', action: 'Demo data loaded', target: 'Workspace' });

    writeStore(st);
    mutateDB(d => { d.bookings.forEach(b => { if (paidIds.includes(b.id)) b.paymentStatus = 'paid'; else if (unpaidIds.includes(b.id)) b.paymentStatus = 'unpaid'; }); });
}

export function clearDemo(companyId: string) {
    mutateDB(db => {
        const demo = (x: { id: string }) => x.id.startsWith('demo-');
        db.bookings = db.bookings.filter(b => !demo(b));
        db.clients = db.clients.filter(c => !demo(c));
        db.reviews = db.reviews.filter(r => !demo(r));
        db.staff = db.staff.filter(s => !demo(s));
        db.users = db.users.filter(u => !demo(u));
        db.services = db.services.filter(s => !demo(s) || s.companyId !== companyId);
    });
    const st = { ...readStore() };
    (Object.keys(st) as CollectionName[]).forEach(k => { st[k] = ((st[k] || []) as Base[]).filter(i => !i.id.startsWith('demo-')) as never; });
    writeStore(st);
}

export function zoneForAddress(address: string, zones: Zone[]): Zone | undefined {
    const a = (address || '').toLowerCase();
    return zones.find(z => z.areas.split(',').some(k => k.trim() && a.includes(k.trim().toLowerCase())));
}

export function compressImage(file: File, max = 640): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('read failed'));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('bad image'));
            img.onload = () => {
                const scale = Math.min(1, max / Math.max(img.width, img.height));
                const c = document.createElement('canvas');
                c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
                c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
                resolve(c.toDataURL('image/jpeg', 0.7));
            };
            img.src = String(reader.result);
        };
        reader.readAsDataURL(file);
    });
}

export const staffName = (db: MockDatabase, staffId?: string) => {
    if (!staffId) return '';
    const st = db.staff.find(s => s.id === staffId);
    return db.users.find(u => u.id === st?.userId)?.name || 'Unknown';
};

/* ------------------------------ review links ------------------------------ */

/** An unguessable token for a review link (144 random bits, URL safe). */
export function newReviewToken(): string {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export const reviewLink = (token: string) => `${window.location.origin}/review/${token}`;

/** Digits for a wa.me link. A local 8 digit Qatar number gets the 974 country code. */
export function waDigits(phone: string): string {
    const d = (phone || '').replace(/\D/g, '');
    return d.length === 8 ? `974${d}` : d;
}

/** What a client has really paid: all payments on their invoices, minus refunds. The single source for "Lifetime spend". */
export function clientLifetimePaid(companyId: string, clientId: string): number {
    const mine = new Set(readCollection('invoices', companyId).filter(i => i.clientId === clientId).map(i => i.id));
    return readCollection('payments', companyId)
        .filter(p => p.clientId === clientId || (p.invoiceId !== undefined && mine.has(p.invoiceId)))
        .reduce((s, p) => s + (p.kind === 'refund' ? -p.amount : p.amount), 0);
}
