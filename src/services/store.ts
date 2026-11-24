import { getDB, saveDB } from './mockDb';
import { getSettings, readCollection, reservationsFor } from './erp';
import type { DayHours } from './erp';
import { isHex } from './branding';
import type { Booking } from '../types';

/* -------------------------------------------------------------------------- */
/*  Booking store: what a client sees on the public link, and the free times.  */
/*  The same rules run in Supabase (public_store / public_request_booking).    */
/* -------------------------------------------------------------------------- */

export interface StoreService { id: string; name: string; description: string; price: number; durationMinutes: number }
export interface StoreCleaner { id: string; name: string; photo?: string; rating?: number }
export interface StoreRules { workStart: string; workEnd: string; minNoticeHours: number; timezone: string; bookingDays: number; /** Opening hours per weekday, Monday first */ week?: DayHours[] | null }
/** A time a cleaner is already taken, in minutes from midnight. Nothing about the client is included. */
export interface Busy { cleanerId: string; date: string; start: number; end: number }
export interface Away { cleanerId: string; start: string; end: string }
export interface StoreCompany { id: string; name: string; logo?: string; primaryColor?: string; accentColor?: string; tagline?: string }
export interface StoreData { company: StoreCompany; services: StoreService[]; cleaners: StoreCleaner[]; rules: StoreRules; busy: Busy[]; away: Away[] }
export interface Slot { time: string; cleanerIds: string[] }

export const SLOT_STEP = 30;
export const DEFAULT_TIMEZONE = 'Asia/Qatar';
export const BOOKABLE_ROLES = ['cleaner', 'staff'];
export const storeLink = (companyId: string) => `${window.location.origin}/book?c=${encodeURIComponent(companyId)}`;

export const toMin = (t: string) => { const [h, m] = (t || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const addDaysStr = (date: string, n: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);

/** Today and the minute of the day in the company's time zone, so a client abroad still sees the company's real hours. */
export function zonedNow(timezone: string, at = new Date()): { date: string; minutes: number } {
    const read = (tz: string) => {
        const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
            .formatToParts(at).map(x => [x.type, x.value]));
        return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
    };
    try { return read(timezone || DEFAULT_TIMEZONE); } catch { return read(DEFAULT_TIMEZONE); }
}

/** Opening hours on a date (yyyy-MM-dd): when the company opens and closes that weekday, or null when it is closed. */
export function dayHours(r: StoreRules, date: string): { start: string; end: string } | null {
    const w = r.week;
    if (Array.isArray(w) && w.length === 7) {
        const e = w[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7];     // Monday = 0
        if (!e || e.open === false) return null;
        const start = /^\d{2}:\d{2}$/.test(e.start) ? e.start : r.workStart, end = /^\d{2}:\d{2}$/.test(e.end) ? e.end : r.workEnd;
        return toMin(end) > toMin(start) ? { start, end } : null;
    }
    return { start: r.workStart, end: r.workEnd };
}

const isAway = (d: StoreData, cleanerId: string, date: string) => d.away.some(a => a.cleanerId === cleanerId && a.start <= date && date <= a.end);
export const isFree = (d: StoreData, cleanerId: string, date: string, start: number, end: number) =>
    !isAway(d, cleanerId, date) && !d.busy.some(b => b.cleanerId === cleanerId && b.date === date && start < b.end && b.start < end);

/** Every start time of the day for a service, free or not. `reason` says why a time cannot be booked. */
export interface DaySlot extends Slot { free: boolean; reason?: 'past' | 'taken' }
export function daySlots(d: StoreData, serviceId: string, cleanerId: string, date: string, now = zonedNow(d.rules.timezone)): DaySlot[] {
    const svc = d.services.find(s => s.id === serviceId);
    if (!svc) return [];
    const dur = svc.durationMinutes > 0 ? svc.durationMinutes : 120;
    const k = dayDiff(now.date, date);
    if (k < 0 || k > d.rules.bookingDays) return [];
    // The earliest start allowed, counting the notice period (it may roll over to a later day)
    const earliest = now.minutes + Math.max(0, d.rules.minNoticeHours) * 60;
    const eDay = Math.floor(earliest / 1440), eMin = earliest % 1440;
    const ids = cleanerId === 'any' ? d.cleaners.map(c => c.id) : [cleanerId];
    const hrs = dayHours(d.rules, date);
    if (!hrs) return [];                                           // closed that weekday
    const ws = toMin(hrs.start), we = toMin(hrs.end);
    const out: DaySlot[] = [];
    for (let t = ws; t + dur <= we; t += SLOT_STEP) {
        if (k < eDay || (k === eDay && t < eMin)) { out.push({ time: toTime(t), cleanerIds: [], free: false, reason: 'past' }); continue; }
        const free = ids.filter(id => isFree(d, id, date, t, t + dur));
        out.push(free.length ? { time: toTime(t), cleanerIds: free, free: true } : { time: toTime(t), cleanerIds: [], free: false, reason: 'taken' });
    }
    return out;
}

/** Free start times on one day for a service, for one cleaner or for anyone ('any'). */
export function slotsOn(d: StoreData, serviceId: string, cleanerId: string, date: string, now = zonedNow(d.rules.timezone)): Slot[] {
    return daySlots(d, serviceId, cleanerId, date, now).filter(s => s.free).map(({ time, cleanerIds }) => ({ time, cleanerIds }));
}

/** The first day (from today) a cleaner, or anyone, has a free time for this service. */
export function nextFreeDay(d: StoreData, serviceId: string, cleanerId: string): string | null {
    const now = zonedNow(d.rules.timezone);
    for (let i = 0; i <= d.rules.bookingDays; i++) {
        const day = addDaysStr(now.date, i);
        if (slotsOn(d, serviceId, cleanerId, day, now).length) return day;
    }
    return null;
}

/* ------------------------------ local demo mode ------------------------------ */

/** Build the store from this browser's data (local demo mode only). Mirrors public_store in Supabase. */
export function localStoreData(companyId: string): StoreData | null {
    const db = getDB();
    const company = db.companies.find(c => c.id === companyId);
    if (!company) return null;
    const s = getSettings(companyId);
    const svcDur = (id: string) => db.services.find(x => x.id === id)?.durationMinutes || 120;
    const today = zonedNow(s.timezone || DEFAULT_TIMEZONE).date;
    return {
        company: {
            id: company.id, name: company.name,
            logo: company.logo?.startsWith('data:image/') ? company.logo : undefined,
            primaryColor: isHex(company.brandColor) ? company.brandColor : undefined,
            accentColor: isHex(company.brandAccent) ? company.brandAccent : undefined,
            tagline: company.tagline?.trim().slice(0, 80) || undefined,
        },
        services: db.services.filter(x => x.companyId === companyId && x.online !== false)
            .map(x => ({ id: x.id, name: x.name, description: x.description || '', price: Number(x.price) || 0, durationMinutes: x.durationMinutes || 120 }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        cleaners: db.staff.filter(x => x.companyId === companyId).flatMap(x => {
            const u = db.users.find(y => y.id === x.userId);
            if (!u || !BOOKABLE_ROLES.includes(u.role)) return [];
            return [{ id: x.id, name: (u.name || '').split(' ')[0], photo: x.photo?.startsWith('data:image/') ? x.photo : undefined, rating: Number(x.rating) || 0 }];
        }).sort((a, b) => a.name.localeCompare(b.name)),
        rules: rulesFrom(s),
        busy: db.bookings.filter(b => b.companyId === companyId && b.status !== 'cancelled' && b.cleanerId && b.date >= addDaysStr(today, -1) && /^\d{1,2}:\d{2}/.test(b.time || ''))
            .map(b => ({ cleanerId: b.cleanerId!, date: b.date, start: toMin(b.time), end: toMin(b.time) + svcDur(b.serviceId) })),
        // leave, and cleaners kept by a subscription (shown as away to everyone else for the whole period)
        away: [
            ...readCollection('leave', companyId).filter(l => l.status === 'approved').map(l => ({ cleanerId: l.staffId, start: l.start, end: l.end })),
            ...reservationsFor(db, companyId).map(r => ({ cleanerId: r.cleanerId, start: r.from, end: r.to })),
        ],
    };
}

export const rulesFrom = (s: { workStart?: string; workEnd?: string; minNoticeHours?: number; timezone?: string; bookingDays?: number; weekHours?: DayHours[] }): StoreRules => ({
    workStart: s.workStart || '07:00', workEnd: s.workEnd || '19:00',
    week: Array.isArray(s.weekHours) && s.weekHours.length === 7 ? s.weekHours : null,
    minNoticeHours: Number.isFinite(Number(s.minNoticeHours)) ? Number(s.minNoticeHours) : 12,
    timezone: s.timezone || DEFAULT_TIMEZONE, bookingDays: Number(s.bookingDays) > 0 ? Number(s.bookingDays) : 60,
});

export interface StoreRequest { serviceId: string; cleanerId: string; date: string; time: string; name: string; phone: string; address: string; notes: string }
export const digitsOnly = (p: string) => (p || '').replace(/[^0-9+]/g, '');

/** Check a request the same way the server does. Returns an error message, or '' when it can be booked. */
export function checkRequest(d: StoreData, r: StoreRequest): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !/^\d{2}:\d{2}$/.test(r.time)) return 'Choose a date and a time.';
    if (r.name.trim().length < 2 || r.name.length > 120) return 'Please enter your name.';
    const ph = digitsOnly(r.phone);
    if (ph.length < 7 || ph.length > 20) return 'Please enter a valid phone number.';
    if (r.address.trim().length < 3 || r.address.length > 300) return 'Please enter your address.';
    if (r.notes.length > 500) return 'The note is too long.';
    if (!d.services.some(s => s.id === r.serviceId)) return 'This service is not available.';
    if (!d.cleaners.some(c => c.id === r.cleanerId)) return 'This cleaner is not available.';
    if (!dayHours(d.rules, r.date)) return 'We are closed on that day.';
    const ok = slotsOn(d, r.serviceId, r.cleanerId, r.date).some(s => s.time === r.time);
    return ok ? '' : 'This time was just taken. Please choose another time.';
}

/** Local demo mode: save the request as a pending booking, exactly like the server function does. */
export function localRequestBooking(companyId: string, r: StoreRequest): { ok: boolean; error?: string } {
    const data = localStoreData(companyId);
    if (!data) return { ok: false, error: 'This booking link is not active.' };
    const problem = checkRequest(data, r);
    if (problem) return { ok: false, error: problem };
    const db = getDB();
    const ph = digitsOnly(r.phone);
    let client = db.clients.find(c => c.companyId === companyId && digitsOnly(c.phone) === ph);
    if (client) {
        const since = Date.now() - 864e5;
        const waiting = db.bookings.filter(b => b.companyId === companyId && b.clientId === client!.id && b.status === 'pending' && b.source === 'store' && Date.parse(b.createdAt) > since).length;
        if (waiting >= 3) return { ok: false, error: 'You already have 3 requests waiting. The company will contact you soon.' };
    } else {
        client = { id: `client-${Date.now()}`, companyId, name: r.name.trim(), phone: r.phone.trim(), address: r.address.trim(), totalSpent: 0, createdAt: new Date().toISOString() };
        db.clients.push(client);
    }
    const svc = data.services.find(s => s.id === r.serviceId)!;
    const booking: Booking = {
        id: `b-${Date.now()}`, companyId, clientId: client.id, serviceId: r.serviceId, cleanerId: r.cleanerId, date: r.date, time: r.time,
        address: r.address.trim(), price: svc.price, status: 'pending', paymentStatus: 'unpaid', source: 'store', notes: r.notes.trim() || undefined,
        createdAt: new Date().toISOString(),
    };
    db.bookings.push(booking);
    db.notifications = db.notifications || [];
    db.notifications.push({ id: `notif-${Date.now()}`, companyId, title: 'New booking request', message: `${r.name.trim()} asked for ${svc.name} on ${r.date} at ${r.time}`, read: false, createdAt: new Date().toISOString() });
    saveDB(db);
    return { ok: true };
}
