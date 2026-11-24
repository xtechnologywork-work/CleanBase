import { addDays, format, parseISO } from 'date-fns';
import {
    cashIn, expensesIn, fmt0, findConflict, inRange, invoiceState, invoiceTotal, invoicePaid, outstanding, readCollection, revenueIn, staffName,
} from './erp';
import type { Booking, MockDatabase } from '../types';

/* ------------------------------------------------------------------ */
/*  AI Manager engine.                                                 */
/*  Everything it says is computed from the company's real data: no    */
/*  invented numbers. It reads the data, finds problems, suggests the  */
/*  fix for each one, and answers questions in English or Arabic.      */
/*  An optional language model can phrase replies more freely (see     */
/*  supabase/functions/ai-manager); this engine is always the source   */
/*  of the facts.                                                      */
/* ------------------------------------------------------------------ */

export type Lang = 'en' | 'ar';
export type Severity = 'high' | 'medium' | 'low';

export interface Action { label: string; to?: string; href?: string }
export interface Issue {
    id: string; severity: Severity; title: string; detail: string; fixes: string[]; actions: Action[];
}
export interface Snapshot {
    date: string;
    company: string;
    now: Date;
    todayJobs: Booking[];
    completed: Booking[];
    inProgress: Booking[];
    upcoming: Booking[];      // still to do today (pending or confirmed)
    cancelled: Booking[];
    revenueToday: number;     // completed jobs
    bookedToday: number;      // everything not cancelled
    stillToCome: number;
    cashToday: number;
    newClientsToday: number;
    revenueYesterday: number;
    jobsYesterday: number;
    revenue7d: number;
    avgDaily7d: number;
    revenueMonth: number;
    expensesMonth: number;
    topCleanerWeek?: { name: string; revenue: number; jobs: number };
    topServiceWeek?: { name: string; revenue: number; jobs: number };
    tomorrowJobs: Booking[];
    unassigned: Booking[];
    late: Booking[];
    overdue: { number: string; client: string; phone: string; balance: number; days: number }[];
    outstandingTotal: number;
    uninvoiced: number;
    lowStock: { name: string; stock: number; unit: string }[];
    expiringDocs: { who: string; type: string; days: number }[];
    openComplaints: { subject: string; severity: string; client: string }[];
    pendingLeave: number;
    absentToday: string[];
    lateStaffToday: string[];
    names: { client: (id: string) => string; cleaner: (id?: string) => string; service: (id: string) => string };
}

const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);

/** Collect every fact the manager needs, from the same data the dashboard uses. */
export function buildSnapshot(db: MockDatabase, companyId: string, now = new Date()): Snapshot {
    const date = format(now, 'yyyy-MM-dd');
    const yest = format(addDays(now, -1), 'yyyy-MM-dd');
    const tomorrow = format(addDays(now, 1), 'yyyy-MM-dd');
    const weekFrom = format(addDays(now, -6), 'yyyy-MM-dd');
    const monthFrom = format(now, 'yyyy-MM-01');

    const bookings = db.bookings.filter(b => b.companyId === companyId);
    const clientName = (id: string) => db.clients.find(c => c.id === id)?.name || 'a client';
    const serviceName = (id: string) => db.services.find(s => s.id === id)?.name || 'a service';
    const cleanerName = (id?: string) => (id ? staffName(db, id) || 'a cleaner' : '');

    const todayJobs = bookings.filter(b => b.date === date).sort((a, b) => a.time.localeCompare(b.time));
    const alive = todayJobs.filter(b => b.status !== 'cancelled');
    const completed = alive.filter(b => b.status === 'completed');
    const inProgress = alive.filter(b => b.status === 'in_progress');
    const upcoming = alive.filter(b => b.status === 'pending' || b.status === 'confirmed');
    const cancelled = todayJobs.filter(b => b.status === 'cancelled');

    const done7 = bookings.filter(b => b.status === 'completed' && inRange(b.date, weekFrom, date));
    const group = (rows: Booking[], key: (b: Booking) => string | undefined, label: (k: string) => string) => {
        const m = new Map<string, { revenue: number; jobs: number }>();
        rows.forEach(b => { const k = key(b); if (!k) return; const cur = m.get(k) || { revenue: 0, jobs: 0 }; cur.revenue += b.price; cur.jobs++; m.set(k, cur); });
        const best = [...m.entries()].sort((a, b) => b[1].revenue - a[1].revenue)[0];
        return best ? { name: label(best[0]), ...best[1] } : undefined;
    };

    // Jobs that should have started but have not
    const late = upcoming.filter(b => now.getTime() > new Date(`${b.date}T${b.time}:00`).getTime() + 15 * 60000);
    const unassigned = bookings
        .filter(b => !b.cleanerId && (b.date === date || b.date === tomorrow) && b.status !== 'cancelled' && b.status !== 'completed')
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    // Money owed
    const invoices = readCollection('invoices', companyId);
    const payments = readCollection('payments', companyId);
    const overdue = invoices
        .filter(i => invoiceState(i, payments) === 'overdue')
        .map(i => {
            const c = db.clients.find(x => x.id === i.clientId);
            return {
                number: i.number, client: c?.name || 'a client', phone: c?.phone || '',
                balance: invoiceTotal(i) - invoicePaid(i, payments),
                days: Math.max(1, Math.round((now.getTime() - parseISO(i.dueDate).getTime()) / 86400000)),
            };
        })
        .sort((a, b) => b.balance - a.balance);
    const out = outstanding(db, companyId);

    // Stock, documents, complaints, leave, attendance
    const lowStock = readCollection('supplies', companyId).filter(s => s.stock <= s.minStock).map(s => ({ name: s.name, stock: s.stock, unit: s.unit }));
    const staffIds = new Set(db.staff.filter(s => s.companyId === companyId).map(s => s.id));
    const soon = format(addDays(now, 30), 'yyyy-MM-dd');
    const expiringDocs = readCollection('staffDocs', companyId)
        .filter(d => staffIds.has(d.staffId) && d.expiry <= soon)
        .map(d => ({ who: staffName(db, d.staffId), type: d.type, days: Math.round((parseISO(d.expiry).getTime() - now.getTime()) / 86400000) }))
        .sort((a, b) => a.days - b.days);
    const openComplaints = readCollection('complaints', companyId).filter(c => c.status !== 'resolved')
        .map(c => ({ subject: c.subject, severity: c.severity, client: clientName(c.clientId) }));
    const att = readCollection('attendance', companyId).filter(a => a.date === date);
    const absentToday = att.filter(a => a.status === 'absent' || a.status === 'leave').map(a => staffName(db, a.staffId));
    const lateStaffToday = att.filter(a => a.status === 'late').map(a => staffName(db, a.staffId));

    return {
        date, company: db.companies.find(c => c.id === companyId)?.name || 'your company', now,
        todayJobs, completed, inProgress, upcoming, cancelled,
        revenueToday: sum(completed.map(b => b.price)),
        bookedToday: sum(alive.map(b => b.price)),
        stillToCome: sum([...inProgress, ...upcoming].map(b => b.price)),
        cashToday: cashIn(db, companyId, date, date),
        newClientsToday: db.clients.filter(c => c.companyId === companyId && c.createdAt.slice(0, 10) === date).length,
        revenueYesterday: revenueIn(db, companyId, yest, yest),
        jobsYesterday: bookings.filter(b => b.date === yest && b.status === 'completed').length,
        revenue7d: sum(done7.map(b => b.price)),
        avgDaily7d: sum(done7.map(b => b.price)) / 7,
        revenueMonth: revenueIn(db, companyId, monthFrom, date),
        expensesMonth: expensesIn(companyId, monthFrom, date),
        topCleanerWeek: group(done7, b => b.cleanerId, k => staffName(db, k) || 'a cleaner'),
        topServiceWeek: group(done7, b => b.serviceId, serviceName),
        tomorrowJobs: bookings.filter(b => b.date === tomorrow && b.status !== 'cancelled').sort((a, b) => a.time.localeCompare(b.time)),
        unassigned, late, overdue, outstandingTotal: out.total, uninvoiced: out.uninvoicedCount,
        lowStock, expiringDocs, openComplaints, pendingLeave: readCollection('leave', companyId).filter(l => l.status === 'pending').length,
        absentToday, lateStaffToday,
        names: { client: clientName, cleaner: cleanerName, service: serviceName },
    };
}

/* ------------------------------ language ------------------------------ */

const AR = /[؀-ۿ]/;
const DARIJA_LATIN = /\b(chhal|chno|achno|ach|bghit|lyom|l3ichiya|ghda|mochkil|mochkila|machakil|wach|kayn|kayna|dir|salam|labas|khdmti|safi|khlas|flous|fin)\b/i;

export const detectLang = (text: string): Lang => (AR.test(text) || DARIJA_LATIN.test(text) ? 'ar' : 'en');
const L = <T,>(lang: Lang, en: T, ar: T): T => (lang === 'ar' ? ar : en);
const q = (n: number) => `${fmt0(n)} QAR`;
const clock = (t: string) => t;
const list = (items: string[], max = 3) => (items.length > max ? `${items.slice(0, max).join(', ')} +${items.length - max}` : items.join(', '));

/* -------------------------------- issues ------------------------------- */

/** Everything that is going wrong right now, each with a concrete fix. */
export function findIssues(s: Snapshot, db: MockDatabase, companyId: string, lang: Lang = 'en'): Issue[] {
    const issues: Issue[] = [];
    const dur = (b: Booking) => db.services.find(x => x.id === b.serviceId)?.durationMinutes || 120;
    const absentIds = new Set(
        readCollection('attendance', companyId).filter(a => a.date === s.date && (a.status === 'absent' || a.status === 'leave')).map(a => a.staffId),
    );
    const freeFor = (b: Booking) => db.staff
        .filter(st => st.companyId === companyId && !absentIds.has(st.id) && ['cleaner', 'staff'].includes(db.users.find(u => u.id === st.userId)?.role || ''))
        .filter(st => !findConflict(db, companyId, st.id, b.date, b.time, dur(b)))
        .map(st => staffName(db, st.id));
    const waLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

    // Jobs nobody is doing
    if (s.unassigned.length) {
        const first = s.unassigned[0];
        const free = freeFor(first);
        issues.push({
            id: 'unassigned', severity: s.unassigned.some(b => b.date === s.date) ? 'high' : 'medium',
            title: L(lang, `${s.unassigned.length} job${s.unassigned.length > 1 ? 's' : ''} with no cleaner`, `${s.unassigned.length} حجز بدون عاملة`),
            detail: L(lang,
                `Next one: ${s.names.client(first.clientId)} at ${clock(first.time)} (${first.date === s.date ? 'today' : 'tomorrow'}), ${s.names.service(first.serviceId)}.`,
                `أقرب حجز: ${s.names.client(first.clientId)} الساعة ${clock(first.time)} (${first.date === s.date ? 'اليوم' : 'غدا'}).`),
            fixes: [free.length
                ? L(lang, `${list(free)} ${free.length > 1 ? 'are' : 'is'} free at that time. Assign one of them from the dispatch board.`, `${list(free)} متاحين فـ هاد الوقت. عين واحد منهم من لوحة التوزيع.`)
                : L(lang, 'Nobody is free at that time. Move the job to another time, or ask a cleaner to take it as extra work.', 'ما كاين حتى واحد متاح فـ هاد الوقت. بدل وقت الحجز ولا طلب من عاملة تاخدو كعمل إضافي.')],
            actions: [{ label: L(lang, 'Open dispatch board', 'افتح لوحة التوزيع'), to: '/app/dispatch' }],
        });
    }

    // Jobs that should have started
    if (s.late.length) {
        const b = s.late[0];
        const c = db.clients.find(x => x.id === b.clientId);
        const who = s.names.cleaner(b.cleanerId);
        issues.push({
            id: 'late', severity: 'high',
            title: L(lang, `${s.late.length} job${s.late.length > 1 ? 's' : ''} should have started`, `${s.late.length} حجز تأخر فـ البداية`),
            detail: L(lang, `${s.names.client(b.clientId)} was booked for ${clock(b.time)}${who ? ` with ${who}` : ' and has no cleaner'}, and it has not started.`,
                `${s.names.client(b.clientId)} كان عندو موعد الساعة ${clock(b.time)}${who ? ` مع ${who}` : ' وبلا عاملة'} وما بداش.`),
            fixes: [
                who ? L(lang, `Call ${who} now to find out where they are.`, `اتصل بـ ${who} دابا باش تعرف فين هي.`) : L(lang, 'Assign a cleaner right away.', 'عين عاملة دابا.'),
                L(lang, 'Message the client before they have to ask: a short apology and a new arrival time.', 'كتب للزبون قبل ما يسول: اعتذار قصير ووقت جديد للوصول.'),
            ],
            actions: [
                { label: L(lang, 'Open dispatch board', 'افتح لوحة التوزيع'), to: '/app/dispatch' },
                ...(c?.phone ? [{ label: L(lang, 'Message the client on WhatsApp', 'كتب للزبون فـ WhatsApp'), href: waLink(c.phone,
                    L(lang, `Hello ${c.name}, we are sorry for the delay. Our team will reach you shortly. Thank you for your patience.`, `السلام عليكم ${c.name}، نعتذر على التأخير. الفريق ديالنا غادي يوصلكم قريبا. شكرا على صبركم.`)) }] : []),
            ],
        });
    }

    // Staff absent but with jobs
    const absentWithJobs = s.upcoming.concat(s.inProgress).filter(b => b.cleanerId && absentIds.has(b.cleanerId));
    if (absentWithJobs.length) {
        issues.push({
            id: 'absent', severity: 'high',
            title: L(lang, `${absentWithJobs.length} job${absentWithJobs.length > 1 ? 's' : ''} belong to cleaners who are absent`, `${absentWithJobs.length} حجز عند عاملات غايبات`),
            detail: L(lang, `${list([...new Set(absentWithJobs.map(b => s.names.cleaner(b.cleanerId)))])} marked absent or on leave today.`, `${list([...new Set(absentWithJobs.map(b => s.names.cleaner(b.cleanerId)))])} مسجلين غايبين ولا فـ عطلة اليوم.`),
            fixes: [L(lang, 'Reassign those jobs to cleaners who are free, starting with the earliest.', 'عاود وزع هاد الحجوزات على عاملات متاحات، بدا بالأقرب.')],
            actions: [{ label: L(lang, 'Open dispatch board', 'افتح لوحة التوزيع'), to: '/app/dispatch' }],
        });
    }

    // Unpaid money
    if (s.overdue.length) {
        const top = s.overdue[0];
        issues.push({
            id: 'overdue', severity: 'high',
            title: L(lang, `${s.overdue.length} overdue invoice${s.overdue.length > 1 ? 's' : ''}, ${q(s.overdue.reduce((n, o) => n + o.balance, 0))}`, `${s.overdue.length} فاتورة متأخرة، ${q(s.overdue.reduce((n, o) => n + o.balance, 0))}`),
            detail: L(lang, `Largest: ${top.client}, ${q(top.balance)}, ${top.days} day${top.days > 1 ? 's' : ''} late (${top.number}).`, `الأكبر: ${top.client}، ${q(top.balance)}، متأخرة ${top.days} يوم (${top.number}).`),
            fixes: [
                L(lang, 'Send a friendly reminder today. Most late payments are simply forgotten.', 'صيفط تذكير لطيف اليوم. أغلب التأخيرات كتكون نسيان.'),
                L(lang, 'If a client is more than a week late, call instead of messaging.', 'إلا الزبون تأخر أكثر من أسبوع، اتصل بيه بلاصة الرسالة.'),
            ],
            actions: [
                { label: L(lang, 'Open invoices', 'افتح الفواتير'), to: '/app/invoices' },
                ...(top.phone ? [{ label: L(lang, `Remind ${top.client} on WhatsApp`, `ذكر ${top.client} فـ WhatsApp`), href: waLink(top.phone,
                    L(lang, `Hello ${top.client}, a friendly reminder that invoice ${top.number} for ${fmt0(top.balance)} QAR is now overdue. Thank you!`, `السلام عليكم ${top.client}، تذكير لطيف بأن الفاتورة ${top.number} بمبلغ ${fmt0(top.balance)} ريال متأخرة. شكرا!`)) }] : []),
            ],
        });
    }
    if (s.uninvoiced > 0) {
        issues.push({
            id: 'uninvoiced', severity: 'medium',
            title: L(lang, `${s.uninvoiced} finished job${s.uninvoiced > 1 ? 's' : ''} not invoiced or paid`, `${s.uninvoiced} خدمة منتهية بلا فاتورة ولا دفع`),
            detail: L(lang, 'Work that is done but not billed is money waiting to be forgotten.', 'خدمة مكتملة بلا فاتورة كتعني فلوس ممكن تتنسى.'),
            fixes: [L(lang, 'Create invoices for these jobs, or mark them paid if the client already paid cash.', 'دير فواتير لهاد الخدمات، ولا حدد أنها مخلصة إلا الزبون خلص كاش.')],
            actions: [{ label: L(lang, 'Create an invoice', 'دير فاتورة'), to: '/app/invoices' }],
        });
    }

    // Complaints
    if (s.openComplaints.length) {
        const high = s.openComplaints.filter(c => c.severity === 'high').length;
        issues.push({
            id: 'complaints', severity: high ? 'high' : 'medium',
            title: L(lang, `${s.openComplaints.length} open complaint${s.openComplaints.length > 1 ? 's' : ''}${high ? `, ${high} serious` : ''}`, `${s.openComplaints.length} شكاية مفتوحة${high ? `، ${high} خطيرة` : ''}`),
            detail: L(lang, `For example: "${s.openComplaints[0].subject}" from ${s.openComplaints[0].client}.`, `مثلا: "${s.openComplaints[0].subject}" من ${s.openComplaints[0].client}.`),
            fixes: [L(lang, 'Reply to the client within 24 hours, even if you do not have the answer yet. A fast reply saves most relationships.', 'جاوب الزبون فـ 24 ساعة، حتى لو ما عندكش الحل دابا. الجواب السريع كيحافظ على أغلب العلاقات.')],
            actions: [{ label: L(lang, 'Open quality', 'افتح الجودة'), to: '/app/quality' }],
        });
    }

    // Cancellations
    if (s.cancelled.length) {
        issues.push({
            id: 'cancelled', severity: 'low',
            title: L(lang, `${s.cancelled.length} cancellation${s.cancelled.length > 1 ? 's' : ''} today, ${q(sum(s.cancelled.map(b => b.price)))}`, `${s.cancelled.length} إلغاء اليوم، ${q(sum(s.cancelled.map(b => b.price)))}`),
            detail: L(lang, `Includes ${s.names.client(s.cancelled[0].clientId)} at ${clock(s.cancelled[0].time)}.`, `من بينهم ${s.names.client(s.cancelled[0].clientId)} الساعة ${clock(s.cancelled[0].time)}.`),
            fixes: [L(lang, 'Offer each client a new time today. Re-booking recovers most of the lost revenue.', 'اقترح على كل زبون وقت جديد. إعادة الحجز كترجع أغلب المدخول الضايع.')],
            actions: [{ label: L(lang, 'Open bookings', 'افتح الحجوزات'), to: '/app/bookings' }],
        });
    }

    // Stock, documents, leave
    if (s.lowStock.length) {
        issues.push({
            id: 'stock', severity: 'medium',
            title: L(lang, `${s.lowStock.length} supply item${s.lowStock.length > 1 ? 's' : ''} running low`, `${s.lowStock.length} مواد على وشك تسالي`),
            detail: list(s.lowStock.map(x => `${x.name} (${x.stock} ${x.unit})`)),
            fixes: [L(lang, 'Reorder today so a crew is never stuck without supplies.', 'عاود الطلب اليوم باش ما يوقف حتى فريق بلا مواد.')],
            actions: [{ label: L(lang, 'Open supplies', 'افتح المخزون'), to: '/app/resources' }],
        });
    }
    if (s.expiringDocs.length) {
        const expired = s.expiringDocs.filter(d => d.days < 0).length;
        issues.push({
            id: 'docs', severity: expired ? 'high' : 'medium',
            title: L(lang, `${s.expiringDocs.length} staff document${s.expiringDocs.length > 1 ? 's' : ''} ${expired ? 'expired or ' : ''}expiring soon`, `${s.expiringDocs.length} وثيقة موظفين ${expired ? 'منتهية ولا ' : ''}غادي تسالي قريب`),
            detail: list(s.expiringDocs.map(d => `${d.who}: ${d.type} ${d.days < 0 ? `expired ${Math.abs(d.days)} days ago` : `in ${d.days} days`}`)),
            fixes: [L(lang, 'Start the renewal now. Working with an expired residency or permit can cost far more than the fee.', 'بدا التجديد دابا. الخدمة بوثيقة منتهية ممكن تكلف أكثر من رسوم التجديد.')],
            actions: [{ label: L(lang, 'Open team hub', 'افتح الفريق'), to: '/app/team' }],
        });
    }
    if (s.pendingLeave) {
        issues.push({
            id: 'leave', severity: 'low',
            title: L(lang, `${s.pendingLeave} leave request${s.pendingLeave > 1 ? 's' : ''} waiting`, `${s.pendingLeave} طلب عطلة كيتسنى`),
            detail: L(lang, 'Staff are waiting for an answer.', 'الموظفات كيتسناو الجواب.'),
            fixes: [L(lang, 'Approve or decline so you can plan the schedule around it.', 'وافق ولا ارفض باش تقدر تخطط الجدول.')],
            actions: [{ label: L(lang, 'Open team hub', 'افتح الفريق'), to: '/app/team' }],
        });
    }

    // Low activity: it is already afternoon and little is booked
    const hour = s.now.getHours();
    if (s.avgDaily7d > 0 && hour >= 14 && s.bookedToday < s.avgDaily7d * 0.5) {
        issues.push({
            id: 'slow', severity: 'medium',
            title: L(lang, 'Today is slower than usual', 'اليوم أبطأ من العادة'),
            detail: L(lang, `${q(s.bookedToday)} booked against a normal day of about ${q(s.avgDaily7d)}.`, `${q(s.bookedToday)} محجوز مقابل يوم عادي حوالي ${q(s.avgDaily7d)}.`),
            fixes: [L(lang, 'Message your regular clients with a same-day or tomorrow slot. Idle crews are the most expensive thing you have.', 'صيفط لزبناءك الدائمين وقت اليوم ولا غدا. الفرق الفارغة هي أغلى حاجة عندك.')],
            actions: [{ label: L(lang, 'Open clients', 'افتح الزبناء'), to: '/app/clients' }],
        });
    }

    const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
    return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}

/* ------------------------------ reporting ------------------------------ */

const trend = (cur: number, prev: number, lang: Lang) => {
    if (prev <= 0) return '';
    const p = Math.round(((cur - prev) / prev) * 100);
    if (p === 0) return L(lang, ' (the same as yesterday)', ' (نفس الأمس)');
    return L(lang, ` (${p > 0 ? 'up' : 'down'} ${Math.abs(p)}% on yesterday)`, ` (${p > 0 ? 'أكثر' : 'أقل'} بـ ${Math.abs(p)}% من الأمس)`);
};

/** A plain text report, ready to paste or send on WhatsApp. */
export function dailyReport(s: Snapshot, issues: Issue[], lang: Lang = 'en'): string {
    const lines = [
        L(lang, `Daily report, ${format(s.now, 'd MMM yyyy')}`, `التقرير اليومي، ${format(s.now, 'd MMM yyyy')}`),
        s.company,
        '',
        L(lang, `Sales so far: ${q(s.revenueToday)} from ${s.completed.length} finished jobs${trend(s.revenueToday, s.revenueYesterday, lang)}`, `المبيعات لحد الآن: ${q(s.revenueToday)} من ${s.completed.length} خدمات منتهية${trend(s.revenueToday, s.revenueYesterday, lang)}`),
        L(lang, `Booked today: ${q(s.bookedToday)} across ${s.todayJobs.length - s.cancelled.length} jobs, ${q(s.stillToCome)} still to come`, `المحجوز اليوم: ${q(s.bookedToday)} فـ ${s.todayJobs.length - s.cancelled.length} حجوزات، باقي ${q(s.stillToCome)}`),
        L(lang, `Cash collected today: ${q(s.cashToday)}`, `المبالغ المقبوضة اليوم: ${q(s.cashToday)}`),
        L(lang, `New clients: ${s.newClientsToday}. Cancellations: ${s.cancelled.length}.`, `زبناء جدد: ${s.newClientsToday}. إلغاءات: ${s.cancelled.length}.`),
        L(lang, `Month to date: ${q(s.revenueMonth)} in sales, ${q(s.expensesMonth)} in expenses, ${q(s.revenueMonth - s.expensesMonth)} profit`, `من بداية الشهر: ${q(s.revenueMonth)} مبيعات، ${q(s.expensesMonth)} مصاريف، ${q(s.revenueMonth - s.expensesMonth)} ربح`),
        '',
    ];
    if (!issues.length) lines.push(L(lang, 'Nothing needs attention right now.', 'ما كاين حتى شي حاجة كتحتاج انتباه دابا.'));
    else {
        lines.push(L(lang, 'Needs attention:', 'كيحتاج انتباه:'));
        issues.slice(0, 6).forEach(i => lines.push(`- ${i.title}`));
    }
    return lines.join('\n');
}

/* -------------------------------- answers ------------------------------- */

export interface Reply { text: string; items?: string[]; actions?: Action[] }

const INTENTS: { id: string; words: string[] }[] = [
    { id: 'report', words: ['report', 'summary', 'overview', 'brief', 'status', 'how are we', 'how is business', 'how am i doing', 'update', 'تقرير', 'ملخص', 'وضعية', 'kif dayrin', 'kayn jdid', 'chno kayn'] },
    { id: 'problems', words: ['problem', 'problems', 'error', 'errors', 'mistake', 'mistakes', 'wrong', 'issue', 'issues', 'fix', 'trouble', 'advice', 'advise', 'what should i do', 'what happened', 'mochkil', 'mochkila', 'machakil', 'khata', 'akhta', 'akhtae', 'akhta2', 'l9ahta', 'traw', 'nasiha', 'nasa2ih', 'nasaih', 'nasayeh', 'مشكل', 'مشاكل', 'خطأ', 'أخطاء', 'اخطاء', 'غلط', 'نصيحة', 'نصائح', 'شنو وقع', 'علاش', 'حل'] },
    { id: 'sales', words: ['sales', 'sale', 'revenue', 'earn', 'earned', 'income', 'money', 'sold', 'turnover', 'takings', 'dkhl', 'dakhl', 'dkhlna', 'dkhelna', 'flous', 'mabi3at', 'mabiaat', 'bi3', 'bi3na', 'bi3o', 'bi3t', 'rbe7na', 'rb7na', 'مبيعات', 'دخل', 'إيرادات', 'ايرادات', 'فلوس', 'مداخيل', 'مدخول', 'بعنا', 'ربحنا'] },
    { id: 'bookings', words: ['booking', 'bookings', 'reservation', 'reservations', 'jobs', 'appointments', 'reservations', 'schedule', 'agenda', 'hajz', 'hojoz', 'حجز', 'حجوزات', 'مواعيد', 'موعد', 'خدمات', 'برنامج'] },
    { id: 'unassigned', words: ['unassigned', 'not assigned', 'assign', 'who is free', 'free cleaner', 'available cleaner', 'بدون عاملة', 'غير معين', 'بلا عاملة', 'متاحة', 'عين'] },
    { id: 'late', words: ['late', 'delay', 'delayed', 'not started', 'behind', 'تأخر', 'متأخر', 'تاخر', 't2akhar', 'ta2akhar'] },
    { id: 'overdue', words: ['overdue', 'unpaid', 'owe', 'owes', 'debt', 'invoice', 'invoices', 'collect', 'outstanding', 'receivable', 'فواتير', 'فاتورة', 'ديون', 'خلص', 'خالصين', 'مستحقات', 'متأخرة', 'ما خلصوش'] },
    { id: 'cash', words: ['cash', 'collected', 'paid today', 'received', 'قبضنا', 'تحصيل', 'مقبوض', 'كاش'] },
    { id: 'profit', words: ['profit', 'expense', 'expenses', 'cost', 'costs', 'spend', 'spent', 'margin', 'loss', 'ربح', 'مصاريف', 'مصروف', 'خسارة', 'تكلفة', 'ribh', 'masarif'] },
    { id: 'staff', words: ['staff', 'cleaner', 'cleaners', 'team', 'attendance', 'absent', 'present', 'employee', 'employees', 'worker', 'workers', 'عاملات', 'عاملة', 'موظفين', 'موظفات', 'حضور', 'غياب', 'فريق', 'خدامين'] },
    { id: 'clients', words: ['client', 'clients', 'customer', 'customers', 'new customer', 'زبون', 'زبناء', 'عملاء', 'عميل', 'كليان'] },
    { id: 'top', words: ['best', 'top', 'star', 'winner', 'أحسن', 'أفضل', 'الأفضل', 'احسن'] },
    { id: 'tomorrow', words: ['tomorrow', 'next day', 'غدا', 'غدًا', 'ghda', 'ghdda', 'lghd'] },
    { id: 'stock', words: ['stock', 'supplies', 'inventory', 'supply', 'مخزون', 'مواد', 'منتجات'] },
    { id: 'help', words: ['hello', 'hi', 'hey', 'salam', 'good morning', 'help', 'what can you do', 'who are you', 'سلام', 'مرحبا', 'أهلا', 'اهلا', 'صباح', 'ساعدني', 'labas', 'السلام'] },
];

function pickIntent(question: string): string {
    const t = ` ${question.toLowerCase().replace(/[?!.,؟،:;()"]/g, ' ')} `;
    const tokens = t.trim().split(/\s+/);
    // Arabic words match anywhere; Latin words match a whole word, or a longer word that starts with them (problem, problems).
    const hit = (w: string) => /[؀-ۿ]/.test(w) ? t.includes(w)
        : w.includes(' ') ? t.includes(` ${w} `)
        : tokens.some(tok => tok === w || (w.length >= 5 && tok.startsWith(w)));
    let best = '', score = 0;
    for (const it of INTENTS) {
        const hits = it.words.filter(hit).length;
        if (hits > score) { best = it.id; score = hits; }
    }
    // "best cleaner" mixes two intents: staff + top. Treat as top.
    if (best === 'staff' && INTENTS.find(i => i.id === 'top')!.words.some(hit)) return 'top';
    return best;
}

const vary = (question: string, options: string[]) => options[question.length % options.length];

export function respond(question: string, s: Snapshot, issues: Issue[], db: MockDatabase, companyId: string, firstName = '', forceLang?: Lang): Reply {
    const lang = forceLang || detectLang(question);
    const intent = pickIntent(question);
    const name = firstName ? ` ${firstName}` : '';
    const jobsLeft = s.upcoming.length + s.inProgress.length;
    const fixes = (list2: Issue[]) => {
        const seen = new Set<string>();
        return list2.flatMap(i => i.actions).filter(x => { const k = x.label + (x.to || x.href || ''); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 4);
    };

    switch (intent) {
        case 'help':
            return {
                text: L(lang,
                    vary(question, [`Hi${name}. I'm your CleanBase manager. I look at your real bookings, money and team all day, and tell you what matters.`, `Hello${name}. I'm here and I've just checked your numbers.`]),
                    vary(question, [`السلام عليكم${name}. أنا المدير ديال CleanBase. كنتابع الحجوزات والفلوس والفريق ديالك طول النهار وكنقولك شنو مهم.`, `مرحبا${name}. أنا هنا وراجعت الأرقام ديالك.`])),
                items: lang === 'ar'
                    ? ['شحال بعنا اليوم؟', 'شحال من حجز عندنا؟', 'شنو المشاكل اللي وقعت اليوم؟', 'شكون ما عندوش عاملة؟', 'عطيني تقرير اليوم']
                    : ["How are sales today?", 'How many bookings do we have?', 'What went wrong today?', 'Which jobs have no cleaner?', 'Give me the daily report'],
            };

        case 'sales': {
            const ahead = s.stillToCome > 0 ? L(lang, ` ${q(s.stillToCome)} more is booked for the rest of the day.`, ` وباقي ${q(s.stillToCome)} محجوزة لباقي النهار.`) : '';
            return {
                text: L(lang,
                    `So far today you've made ${q(s.revenueToday)} from ${s.completed.length} finished job${s.completed.length === 1 ? '' : 's'}${trend(s.revenueToday, s.revenueYesterday, lang)}.${ahead}`,
                    `لحد الآن اليوم دخلتي ${q(s.revenueToday)} من ${s.completed.length} خدمات منتهية${trend(s.revenueToday, s.revenueYesterday, lang)}.${ahead}`),
                items: [
                    L(lang, `Total booked today: ${q(s.bookedToday)}`, `مجموع المحجوز اليوم: ${q(s.bookedToday)}`),
                    L(lang, `Cash actually collected today: ${q(s.cashToday)}`, `المقبوض فعلا اليوم: ${q(s.cashToday)}`),
                    L(lang, `Last 7 days: ${q(s.revenue7d)} (about ${q(s.avgDaily7d)} a day)`, `آخر 7 أيام: ${q(s.revenue7d)} (حوالي ${q(s.avgDaily7d)} فـ اليوم)`),
                    L(lang, `This month: ${q(s.revenueMonth)}`, `هاد الشهر: ${q(s.revenueMonth)}`),
                ],
                actions: [{ label: L(lang, 'Open reports', 'افتح التقارير'), to: '/app/reports' }],
            };
        }

        case 'bookings': {
            const nextJob = s.upcoming[0];
            return {
                text: L(lang,
                    `You have ${s.todayJobs.length - s.cancelled.length} job${s.todayJobs.length - s.cancelled.length === 1 ? '' : 's'} today: ${s.completed.length} done, ${s.inProgress.length} in progress and ${s.upcoming.length} still to start.${s.cancelled.length ? ` ${s.cancelled.length} cancelled.` : ''}`,
                    `عندك ${s.todayJobs.length - s.cancelled.length} حجوزات اليوم: ${s.completed.length} منتهية، ${s.inProgress.length} جارية، و${s.upcoming.length} باقي ما بدات.${s.cancelled.length ? ` ${s.cancelled.length} ملغية.` : ''}`),
                items: [
                    ...(nextJob ? [L(lang, `Next up: ${s.names.client(nextJob.clientId)} at ${clock(nextJob.time)}, ${s.names.service(nextJob.serviceId)}${nextJob.cleanerId ? ` with ${s.names.cleaner(nextJob.cleanerId)}` : ', no cleaner yet'}`,
                        `الجاي: ${s.names.client(nextJob.clientId)} الساعة ${clock(nextJob.time)}، ${s.names.service(nextJob.serviceId)}${nextJob.cleanerId ? ` مع ${s.names.cleaner(nextJob.cleanerId)}` : '، بلا عاملة'}`)] : []),
                    L(lang, `Tomorrow: ${s.tomorrowJobs.length} job${s.tomorrowJobs.length === 1 ? '' : 's'} booked`, `غدا: ${s.tomorrowJobs.length} حجوزات`),
                    ...(s.unassigned.length ? [L(lang, `${s.unassigned.length} still need a cleaner`, `${s.unassigned.length} باقين بلا عاملة`)] : []),
                ],
                actions: [{ label: L(lang, 'Open dispatch board', 'افتح لوحة التوزيع'), to: '/app/dispatch' }],
            };
        }

        case 'tomorrow':
            return {
                text: s.tomorrowJobs.length
                    ? L(lang, `Tomorrow you have ${s.tomorrowJobs.length} job${s.tomorrowJobs.length === 1 ? '' : 's'}, worth ${q(sum(s.tomorrowJobs.map(b => b.price)))}.`, `غدا عندك ${s.tomorrowJobs.length} حجوزات بقيمة ${q(sum(s.tomorrowJobs.map(b => b.price)))}.`)
                    : L(lang, 'Nothing is booked for tomorrow yet. That is a good moment to message your regular clients.', 'ما كاين حتى حجز لغدا دابا. هاد الوقت مزيان باش تكتب لزبناءك الدائمين.'),
                items: s.tomorrowJobs.slice(0, 6).map(b => `${clock(b.time)} ${s.names.client(b.clientId)}, ${s.names.service(b.serviceId)}${b.cleanerId ? '' : L(lang, ' (no cleaner)', ' (بلا عاملة)')}`),
                actions: [{ label: L(lang, 'Open dispatch board', 'افتح لوحة التوزيع'), to: '/app/dispatch' }],
            };

        case 'problems': {
            if (!issues.length) return { text: L(lang, 'Good news: I checked jobs, payments, staff, stock and complaints, and nothing needs fixing right now.', 'أخبار زوينة: راجعت الحجوزات والدفعات والفريق والمخزون والشكايات، وما كاين والو كيحتاج إصلاح دابا.') };
            const top = issues.slice(0, 4);
            return {
                text: L(lang, `I found ${issues.length} thing${issues.length === 1 ? '' : 's'} that need${issues.length === 1 ? 's' : ''} your attention. Here is what I would do, most urgent first.`, `لقيت ${issues.length} حاجات خاصها انتباه. هذا شنو كنقترح، الأهم أولا.`),
                items: top.flatMap(i => [`${i.title}. ${i.detail}`, `→ ${i.fixes[0]}`]),
                actions: fixes(top),
            };
        }

        case 'unassigned': {
            const iss = issues.find(i => i.id === 'unassigned');
            if (!iss) return { text: L(lang, 'Every job for today and tomorrow has a cleaner. Nothing to assign.', 'كل حجوزات اليوم وغدا عندها عاملة. ما كاين والو باش تعين.') };
            return { text: iss.title + '. ' + iss.detail, items: iss.fixes, actions: iss.actions };
        }

        case 'late': {
            const iss = issues.find(i => i.id === 'late');
            if (!iss) return { text: L(lang, 'No job is behind schedule right now.', 'ما كاين حتى حجز متأخر دابا.') };
            return { text: iss.title + '. ' + iss.detail, items: iss.fixes, actions: iss.actions };
        }

        case 'overdue': {
            if (!s.overdue.length && !s.uninvoiced) return { text: L(lang, `Nobody is overdue. Total still to collect is ${q(s.outstandingTotal)}.`, `ما كاين حتى واحد متأخر. المجموع اللي باقي تقبضو ${q(s.outstandingTotal)}.`) };
            const iss = issues.filter(i => i.id === 'overdue' || i.id === 'uninvoiced');
            return {
                text: L(lang, `You are owed ${q(s.outstandingTotal)} in total. ${s.overdue.length ? `${s.overdue.length} invoice${s.overdue.length > 1 ? 's are' : ' is'} overdue.` : ''}`, `باقي ليك ${q(s.outstandingTotal)} فـ المجموع. ${s.overdue.length ? `${s.overdue.length} فواتير متأخرة.` : ''}`),
                items: [...s.overdue.slice(0, 4).map(o => `${o.client}: ${q(o.balance)}, ${o.days} ${L(lang, 'days late', 'أيام تأخير')} (${o.number})`), ...iss.flatMap(i => i.fixes.slice(0, 1))],
                actions: fixes(iss),
            };
        }

        case 'cash':
            return {
                text: L(lang, `Cash collected today: ${q(s.cashToday)}. Still owed to you in total: ${q(s.outstandingTotal)}.`, `المقبوض اليوم: ${q(s.cashToday)}. المبلغ اللي باقي ليك فـ المجموع: ${q(s.outstandingTotal)}.`),
                actions: [{ label: L(lang, 'Open invoices', 'افتح الفواتير'), to: '/app/invoices' }],
            };

        case 'profit': {
            const profit = s.revenueMonth - s.expensesMonth;
            return {
                text: L(lang, `This month you have ${q(s.revenueMonth)} in sales and ${q(s.expensesMonth)} in expenses, so ${profit >= 0 ? 'profit is' : 'you are at a loss of'} ${q(Math.abs(profit))}${s.revenueMonth > 0 ? ` (a ${Math.round((profit / s.revenueMonth) * 100)}% margin)` : ''}.`,
                    `هاد الشهر عندك ${q(s.revenueMonth)} مبيعات و${q(s.expensesMonth)} مصاريف، يعني ${profit >= 0 ? 'الربح' : 'الخسارة'} ${q(Math.abs(profit))}${s.revenueMonth > 0 ? ` (هامش ${Math.round((profit / s.revenueMonth) * 100)}%)` : ''}.`),
                items: profit < 0 ? [L(lang, 'Expenses are higher than sales this month. Check rent and salaries first: they are usually the largest.', 'المصاريف أكثر من المبيعات هاد الشهر. شوف الكراء والأجور أولا حيت هما الأكبر عادة.')] : undefined,
                actions: [{ label: L(lang, 'Open expenses', 'افتح المصاريف'), to: '/app/expenses' }],
            };
        }

        case 'staff': {
            const working = new Set([...s.inProgress, ...s.upcoming, ...s.completed].map(b => b.cleanerId).filter(Boolean)).size;
            return {
                text: L(lang, `${working} cleaner${working === 1 ? ' has' : 's have'} jobs today.${s.absentToday.length ? ` Absent or on leave: ${list(s.absentToday)}.` : ' Nobody is marked absent.'}${s.lateStaffToday.length ? ` Late today: ${list(s.lateStaffToday)}.` : ''}`,
                    `${working} عاملات عندهم حجوزات اليوم.${s.absentToday.length ? ` غايبات ولا فـ عطلة: ${list(s.absentToday)}.` : ' ما كاين حتى واحدة مسجلة غايبة.'}${s.lateStaffToday.length ? ` متأخرات اليوم: ${list(s.lateStaffToday)}.` : ''}`),
                items: s.topCleanerWeek ? [L(lang, `Best this week: ${s.topCleanerWeek.name}, ${q(s.topCleanerWeek.revenue)} from ${s.topCleanerWeek.jobs} jobs`, `الأحسن هاد الأسبوع: ${s.topCleanerWeek.name}، ${q(s.topCleanerWeek.revenue)} من ${s.topCleanerWeek.jobs} خدمات`)] : undefined,
                actions: [{ label: L(lang, 'Open team hub', 'افتح الفريق'), to: '/app/team' }],
            };
        }

        case 'top': {
            const parts: string[] = [];
            if (s.topCleanerWeek) parts.push(L(lang, `Best cleaner this week: ${s.topCleanerWeek.name} with ${q(s.topCleanerWeek.revenue)} from ${s.topCleanerWeek.jobs} jobs.`, `أحسن عاملة هاد الأسبوع: ${s.topCleanerWeek.name} بـ ${q(s.topCleanerWeek.revenue)} من ${s.topCleanerWeek.jobs} خدمات.`));
            if (s.topServiceWeek) parts.push(L(lang, `Best service: ${s.topServiceWeek.name}, ${q(s.topServiceWeek.revenue)} from ${s.topServiceWeek.jobs} jobs.`, `أحسن خدمة: ${s.topServiceWeek.name}، ${q(s.topServiceWeek.revenue)} من ${s.topServiceWeek.jobs} خدمات.`));
            return { text: parts.length ? parts.join(' ') : L(lang, 'There are not enough finished jobs this week to rank anything yet.', 'ما كايناش خدمات كافية هاد الأسبوع باش نرتب.') };
        }

        case 'clients':
            return {
                text: L(lang, `${s.newClientsToday} new client${s.newClientsToday === 1 ? '' : 's'} today. ${db.clients.filter(c => c.companyId === companyId).length} clients in total.`, `${s.newClientsToday} زبناء جدد اليوم. ${db.clients.filter(c => c.companyId === companyId).length} زبناء فـ المجموع.`),
                actions: [{ label: L(lang, 'Open clients', 'افتح الزبناء'), to: '/app/clients' }],
            };

        case 'stock': {
            const iss = issues.find(i => i.id === 'stock');
            return iss ? { text: iss.title + '.', items: [iss.detail, ...iss.fixes], actions: iss.actions } : { text: L(lang, 'All supplies are above their reorder level.', 'كل المواد فوق حد إعادة الطلب.') };
        }

        case 'report':
        default: {
            const report = dailyReport(s, issues, lang);
            if (intent === 'report') {
                return {
                    text: L(lang, `Here is where things stand${name}.`, `هذا هو الوضع${name}.`),
                    items: report.split('\n').filter(Boolean).slice(2),
                    actions: [{ label: L(lang, 'Share on WhatsApp', 'شارك فـ WhatsApp'), href: `https://wa.me/?text=${encodeURIComponent(report)}` }, ...fixes(issues.slice(0, 2))],
                };
            }
            return {
                text: L(lang, `I'm not sure what you mean, but here is a quick look. You've made ${q(s.revenueToday)} today and ${jobsLeft} job${jobsLeft === 1 ? ' is' : 's are'} still to do${issues.length ? `, with ${issues.length} thing${issues.length === 1 ? '' : 's'} to fix` : ''}. Ask me about sales, bookings, problems, invoices, staff or tomorrow.`,
                    `ما فهمتش مزيان، ولكن هذي لمحة سريعة. دخلتي ${q(s.revenueToday)} اليوم وباقي ${jobsLeft} خدمات${issues.length ? `، و${issues.length} حاجات خاصها إصلاح` : ''}. سولني على المبيعات والحجوزات والمشاكل والفواتير والفريق وغدا.`),
            };
        }
    }
}

/** A compact, privacy-aware summary a language model can use to phrase replies. The numbers still come from here. */
export function modelContext(s: Snapshot, issues: Issue[]): string {
    return JSON.stringify({
        company: s.company, date: s.date, time: format(s.now, 'HH:mm'),
        today: { jobs: s.todayJobs.length - s.cancelled.length, completed: s.completed.length, inProgress: s.inProgress.length, toStart: s.upcoming.length, cancelled: s.cancelled.length,
            salesCompletedQAR: Math.round(s.revenueToday), bookedQAR: Math.round(s.bookedToday), stillToComeQAR: Math.round(s.stillToCome), cashCollectedQAR: Math.round(s.cashToday), newClients: s.newClientsToday },
        yesterdaySalesQAR: Math.round(s.revenueYesterday), last7dSalesQAR: Math.round(s.revenue7d), monthSalesQAR: Math.round(s.revenueMonth), monthExpensesQAR: Math.round(s.expensesMonth),
        owedInTotalQAR: Math.round(s.outstandingTotal), tomorrowJobs: s.tomorrowJobs.length,
        topCleanerWeek: s.topCleanerWeek, topServiceWeek: s.topServiceWeek,
        problems: issues.map(i => ({ severity: i.severity, title: i.title, detail: i.detail, suggestedFix: i.fixes[0] })),
    });
}
