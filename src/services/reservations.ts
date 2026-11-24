/* -------------------------------------------------------------------------- */
/*  A cleaner reserved by a subscription.                                     */
/*  When a client has an active subscription with a cleaner, that cleaner is  */
/*  theirs for the whole period of the subscription (and its contract): she    */
/*  cannot be given to another client's subscription or booking, and the      */
/*  public booking page does not offer her. When the period ends, or the      */
/*  subscription is paused or cancelled, or its contract ends, she is free.   */
/*                                                                            */
/*  Which subscriptions reserve is a company setting:                         */
/*    monthly (default)  monthly and live-in plans, priced per month           */
/*    all                every active subscription                             */
/*    off                nothing is reserved                                   */
/*  Dates are yyyy-MM-dd strings, so they compare as text.                    */
/*  The same rule runs in the database for the public booking page            */
/*  (migration 0015): keep them in step.                                      */
/* -------------------------------------------------------------------------- */

export type ReserveMode = 'monthly' | 'all' | 'off';
export const RESERVE_MODES: { value: ReserveMode; label: string; hint: string }[] = [
    { value: 'monthly', label: 'Monthly and live-in plans', hint: 'A cleaner on a monthly or live-in plan is kept for that client during the plan. Weekly plans only block the times of their visits.' },
    { value: 'all', label: 'Every subscription', hint: 'Any cleaner with an active subscription is kept for that client during the whole subscription.' },
    { value: 'off', label: 'Never', hint: 'Cleaners are never kept for a client. Only the time of each visit is checked.' },
];
export const reserveModeOf = (s: { reserveCleaners?: string } | undefined): ReserveMode =>
    s?.reserveCleaners === 'all' || s?.reserveCleaners === 'off' ? s.reserveCleaners : 'monthly';

/** The end of time, for a subscription with no end date. */
export const OPEN_END = '9999-12-31';

interface SubLike { id: string; clientId: string; cleanerId?: string; frequency: string; status: string; startDate: string; endDate?: string }
interface ContractLike { subscriptionId: string; status: string; createdAt: string }

export interface Reservation {
    subscriptionId: string; cleanerId: string; clientId: string;
    /** yyyy-MM-dd */ from: string;
    /** yyyy-MM-dd, OPEN_END when the subscription has no end date */ to: string;
    open: boolean;
}

const day = (s?: string) => (s || '').slice(0, 10);
const isMonthly = (f: string) => f === 'monthly' || f === 'live-in';

/** The reservations made by subscriptions today: one per subscription that keeps its cleaner. */
export function reservationsOf(subs: SubLike[], contracts: ContractLike[], mode: ReserveMode): Reservation[] {
    if (mode === 'off') return [];
    return subs.flatMap(s => {
        if (s.status !== 'active' || !s.cleanerId) return [];
        if (mode === 'monthly' && !isMonthly(s.frequency)) return [];
        // A subscription whose latest contract was ended or cancelled no longer keeps its cleaner
        const latest = contracts.filter(c => c.subscriptionId === s.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (latest && (latest.status === 'ended' || latest.status === 'cancelled')) return [];
        const from = day(s.startDate), to = day(s.endDate);
        if (!from) return [];
        return [{ subscriptionId: s.id, cleanerId: s.cleanerId, clientId: s.clientId, from, to: to || OPEN_END, open: !to }];
    });
}

/** Does this reservation cover the day? */
export const covers = (r: Reservation, date: string) => r.from <= date && date <= r.to;

/**
 * The reservation that keeps this cleaner from `forClientId` on this day, if any.
 * The client who owns the reservation (or the subscription itself) is never blocked by it.
 */
export function reservedOn(rs: Reservation[], cleanerId: string, date: string, forClientId?: string, forSubscriptionId?: string): Reservation | undefined {
    return rs.find(r => r.cleanerId === cleanerId && covers(r, date)
        && r.subscriptionId !== forSubscriptionId && !(forClientId && r.clientId === forClientId));
}

/** Reservations of this cleaner that overlap a period (to may be empty for "no end date"). */
export function reservedDuring(rs: Reservation[], cleanerId: string, from: string, to: string | undefined, forClientId?: string, forSubscriptionId?: string): Reservation[] {
    const end = to || OPEN_END;
    return rs.filter(r => r.cleanerId === cleanerId && r.from <= end && from <= r.to
        && r.subscriptionId !== forSubscriptionId && !(forClientId && r.clientId === forClientId));
}

/** Two active subscriptions that keep the same cleaner at the same time (data from before this rule, or a changed setting). */
export function clashes(rs: Reservation[]): [Reservation, Reservation][] {
    const out: [Reservation, Reservation][] = [];
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i], b = rs[j];
        if (a.cleanerId === b.cleanerId && a.clientId !== b.clientId && a.from <= b.to && b.from <= a.to) out.push([a, b]);
    }
    return out;
}

/** "until 19 Dec 2026" or "until the subscription ends", in words for a message. */
export function untilText(r: Reservation, fmtDay: (d: string) => string): string {
    return r.open ? 'until the subscription ends' : `until ${fmtDay(r.to)}`;
}
