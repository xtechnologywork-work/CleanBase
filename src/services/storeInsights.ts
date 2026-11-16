import { isCloud, sb } from './backend';
import { getDB } from './mockDb';

/* -------------------------------------------------------------------------- */
/*  Booking store insights. A visitor is a random id kept in their browser.     */
/*  Nothing personal is stored: no name, no phone, no IP address.               */
/* -------------------------------------------------------------------------- */

export type StoreStep = 'view' | 'service' | 'cleaner' | 'time' | 'details' | 'request';
export const FUNNEL: { step: StoreStep; label: string }[] = [
    { step: 'view', label: 'Opened the store' },
    { step: 'service', label: 'Chose a service' },
    { step: 'cleaner', label: 'Chose a cleaner' },
    { step: 'time', label: 'Picked a time' },
    { step: 'details', label: 'Filled in their details' },
    { step: 'request', label: 'Sent a request' },
];
export interface Insights {
    steps: Partial<Record<StoreStep, number>>;
    activeNow: number;
    /** Real requests saved from the store in the period, and how many of them were accepted */
    requests: number; accepted: number;
    daily: { day: string; visitors: number; requests: number }[];
}

const VISITOR_KEY = 'cleanbase_store_visitor';
const EVENTS_KEY = 'cleanbase_store_events';     // local demo mode only
const ACTIVE_MS = 2 * 60 * 1000;

const safeGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode: insights just skip this visitor */ } };

export function visitorId(): string {
    let id = safeGet(VISITOR_KEY);
    if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
        const bytes = new Uint8Array(16);
        try { crypto.getRandomValues(bytes); } catch { bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); }); }
        id = 'v_' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        safeSet(VISITOR_KEY, id);
    }
    return id;
}

/** The owner or a team member looking at their own store is not a visitor. Local demo mode always counts, so the demo shows numbers. */
export async function isSignedInHere(): Promise<boolean> {
    if (!isCloud) return false;
    try { return !!(await sb().auth.getSession()).data.session; } catch { return false; }
}

interface LocalEvent { companyId: string; visitorId: string; step: StoreStep; day: string; firstAt: number; lastAt: number }
const readLocal = (): LocalEvent[] => { try { return JSON.parse(safeGet(EVENTS_KEY) || '[]') as LocalEvent[]; } catch { return []; } };
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Record that this visitor reached a step. Never throws and never blocks the page. */
export function track(companyId: string, step: StoreStep): void {
    if (!companyId) return;
    const v = visitorId();
    if (isCloud) {
        void sb().rpc('public_store_track', { p_company: companyId, p_visitor: v, p_step: step }).then(() => undefined, () => undefined);
        return;
    }
    const now = Date.now(), day = utcDay(now);
    const list = readLocal();
    const hit = list.find(e => e.companyId === companyId && e.visitorId === v && e.step === step && e.day === day);
    if (hit) hit.lastAt = now; else list.push({ companyId, visitorId: v, step, day, firstAt: now, lastAt: now });
    safeSet(EVENTS_KEY, JSON.stringify(list.slice(-5000)));
}

/** Local demo mode: the same totals the store_insights function returns in Supabase. */
export function localInsights(companyId: string, days: number, now = Date.now()): Insights {
    const since = now - days * 864e5;
    const ev = readLocal().filter(e => e.companyId === companyId);
    const recent = ev.filter(e => e.lastAt >= since);
    const steps: Partial<Record<StoreStep, number>> = {};
    FUNNEL.forEach(({ step }) => {
        const n = new Set(recent.filter(e => e.step === step).map(e => e.visitorId)).size;
        if (n) steps[step] = n;
    });
    const store = getDB().bookings.filter(b => b.companyId === companyId && b.source === 'store' && Date.parse(b.createdAt) >= since);
    const daily = Array.from({ length: days }, (_, i) => {
        const day = utcDay(now - (days - 1 - i) * 864e5);
        const count = (step: StoreStep) => new Set(ev.filter(e => e.day === day && e.step === step).map(e => e.visitorId)).size;
        return { day, visitors: count('view'), requests: count('request') };
    });
    return {
        steps, daily,
        activeNow: new Set(ev.filter(e => e.lastAt >= now - ACTIVE_MS).map(e => e.visitorId)).size,
        requests: store.length,
        accepted: store.filter(b => ['confirmed', 'in_progress', 'completed'].includes(b.status)).length,
    };
}

export async function fetchInsights(companyId: string, days: number): Promise<Insights> {
    if (!isCloud) return localInsights(companyId, days);
    const { data, error } = await sb().rpc('store_insights', { p_company: companyId, p_days: days });
    if (error) throw error;
    const d = data as Insights;
    return { steps: d.steps || {}, activeNow: Number(d.activeNow) || 0, requests: Number(d.requests) || 0, accepted: Number(d.accepted) || 0, daily: d.daily || [] };
}
