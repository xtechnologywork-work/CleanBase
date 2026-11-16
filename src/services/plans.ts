import type { PlanId } from '../types';

/**
 * The plans CleanBase sells. This is the single place that defines them: the landing page, sign-up,
 * the platform admin and the AI manager all read from here.
 *
 * Two plans are sold today. The two older plans stay in the type only so tenants who already
 * signed up on them keep working; they can be moved to a current plan from the Tenants page.
 */
export interface PlanInfo {
    id: PlanId;
    name: string;
    /** Monthly price in QAR. null means the price is agreed with the customer. */
    price: number | null;
    tagline: string;
    features: string[];
    legacy?: boolean;
}

export const PLANS: Record<PlanId, PlanInfo> = {
    pro: {
        id: 'pro',
        name: 'Pro',
        price: 500,
        tagline: 'Everything you need to run a cleaning company, with no limits.',
        features: [
            'Unlimited cleaners, clients and bookings',
            'Dispatch board, invoicing, payroll and reports',
            'Real-time analytics and reporting',
            'Premium support',
        ],
    },
    ai_master: {
        id: 'ai_master',
        name: 'CleanBase AI Master',
        price: null,
        tagline: 'Pro, plus an AI manager that knows your business.',
        features: [
            'Everything in Pro',
            'An AI manager you can talk to like a person',
            "Ask for today's sales, bookings and problems at any time",
            'Get advice on how to fix each problem',
            'A daily report you can share on WhatsApp',
            'Premium support',
        ],
    },
    basic: { id: 'basic', name: 'Core Starter (old plan)', price: 349, tagline: '', features: [], legacy: true },
    yearly_basic: { id: 'yearly_basic', name: 'Yearly Basic (old plan)', price: 125, tagline: '', features: [], legacy: true },
};

/** Plans a new customer can choose. */
export const SELLABLE: PlanId[] = ['pro', 'ai_master'];

export const planName = (id?: string): string => PLANS[id as PlanId]?.name ?? 'No plan';

/** Plans to offer in a selector: the sellable ones, plus the tenant's current old plan so it is not lost. */
export const planChoices = (current?: PlanId): PlanId[] => (current && PLANS[current]?.legacy ? [...SELLABLE, current] : SELLABLE);

/** The AI manager is part of the AI Master plan only. */
export const hasAiManager = (plan?: string) => plan === 'ai_master';

export const isPlanId = (v: unknown): v is PlanId => typeof v === 'string' && v in PLANS;
export const priceText = (p: PlanInfo) => (p.price === null ? 'Custom' : `${p.price.toLocaleString('en-US')} QAR`);
