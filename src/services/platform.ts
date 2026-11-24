import { addDays, addMonths, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { getDB, logAudit, saveDB } from './mockDb';
import { ERP } from './replicate';
import { removeWhere, today } from './erp';
import type { Company, MockDatabase, PlanId, PlatformPayment, User } from '../types';
import { PLANS } from './plans';

/* ------------------------------------------------------------------ */
/*  Platform admin model: tenants, usage, billing, licenses.           */
/*  Everything here is computed from the data the admin can already    */
/*  see (all companies), so there are no made-up numbers.              */
/* ------------------------------------------------------------------ */

export type Plan = PlanId;
export const PLAN_LABEL: Record<Plan, string> = { basic: PLANS.basic.name, yearly_basic: PLANS.yearly_basic.name, pro: PLANS.pro.name, ai_master: PLANS.ai_master.name };
/** Starting monthly price when choosing a plan. The AI plan is priced with each customer, so it starts at 0 and the admin types the agreed amount. */
export const PLAN_DEFAULT_MRR: Record<Plan, number> = { basic: 349, yearly_basic: 125, pro: 500, ai_master: 0 };

export type TenantState = 'active' | 'pending' | 'suspended' | 'no-owner';
export type LicenseState = 'ok' | 'soon' | 'expired' | 'none';

export interface TenantUsage {
    staff: number; clients: number; bookings: number; jobs30d: number; revenue30d: number; gmvAll: number; lastActivity?: string;
}
export interface Tenant {
    company: Company;
    owner?: User;
    team: User[];
    state: TenantState;
    plan: Plan;
    mrr: number;
    licenseUntil?: string;
    daysLeft: number | null;
    license: LicenseState;
    usage: TenantUsage;
    payments: PlatformPayment[];
    lastPayment?: PlatformPayment;
    paidTotal: number;
    /** The platform admin's private notes. Never stored in the company row, which the tenant can read. */
    notes: string;
}

const daysAgo = (n: number) => format(addDays(new Date(), -n), 'yyyy-MM-dd');

export function buildTenants(db: MockDatabase): Tenant[] {
    const cutoff = daysAgo(30);
    const users = (db.users || []).filter(u => u.role !== 'superadmin');
    const byCompany = <T extends { companyId?: string }>(rows: T[]) => {
        const m = new Map<string, T[]>();
        rows.forEach(r => { if (r.companyId) { const a = m.get(r.companyId); if (a) a.push(r); else m.set(r.companyId, [r]); } });
        return m;
    };
    const staff = byCompany(db.staff || []);
    const clients = byCompany(db.clients || []);
    const bookings = byCompany(db.bookings || []);
    const team = byCompany(users);
    const pays = new Map<string, PlatformPayment[]>();
    (db.platformPayments || []).forEach(p => { const a = pays.get(p.tenantId); if (a) a.push(p); else pays.set(p.tenantId, [p]); });
    const notes = new Map((db.tenantNotes || []).map(n => [n.tenantId, n.notes]));

    return (db.companies || []).map(company => {
        const members = team.get(company.id) || [];
        const owner = members.find(u => u.role === 'companyadmin');
        const bks = bookings.get(company.id) || [];
        const done30 = bks.filter(b => b.status === 'completed' && b.date >= cutoff);
        const done = bks.filter(b => b.status === 'completed');
        const last = [...bks.map(b => b.createdAt), ...(clients.get(company.id) || []).map(c => c.createdAt)].filter(Boolean).sort().pop();
        const state: TenantState = !owner ? 'no-owner' : owner.status === 'locked' ? (company.approvedAt ? 'suspended' : 'pending') : 'active';
        const myPays = (pays.get(company.id) || []).sort((a, b) => b.date.localeCompare(a.date));
        const daysLeft = company.licenseUntil ? differenceInCalendarDays(parseISO(company.licenseUntil), new Date()) : null;
        const license: LicenseState = daysLeft === null ? 'none' : daysLeft < 0 ? 'expired' : daysLeft <= 7 ? 'soon' : 'ok';
        return {
            company, owner, team: members, state,
            plan: company.subscriptionPlan || 'basic',
            mrr: company.monthlyRevenue ?? 0,
            licenseUntil: company.licenseUntil, daysLeft, license,
            usage: {
                staff: (staff.get(company.id) || []).length, clients: (clients.get(company.id) || []).length, bookings: bks.length,
                jobs30d: done30.length, revenue30d: done30.reduce((s, b) => s + b.price, 0),
                gmvAll: done.reduce((s, b) => s + b.price, 0), lastActivity: last,
            },
            payments: myPays, lastPayment: myPays[0], paidTotal: myPays.reduce((s, p) => s + p.amount, 0),
            notes: notes.get(company.id) ?? company.adminNotes ?? '',
        };
    }).sort((a, b) => b.company.createdAt.localeCompare(a.company.createdAt));
}

/** Money and counts for the whole platform. */
export function platformTotals(tenants: Tenant[], db: MockDatabase) {
    const active = tenants.filter(t => t.state === 'active');
    const mrr = active.reduce((s, t) => s + t.mrr, 0);
    const monthStart = format(new Date(), 'yyyy-MM-01');
    const pays = db.platformPayments || [];
    const collectedMonth = pays.filter(p => p.date >= monthStart).reduce((s, p) => s + p.amount, 0);
    const cutoff = daysAgo(30);
    const completed30 = (db.bookings || []).filter(b => b.status === 'completed' && b.date >= cutoff);
    return {
        total: tenants.length,
        active: active.length,
        pending: tenants.filter(t => t.state === 'pending').length,
        suspended: tenants.filter(t => t.state === 'suspended').length,
        noOwner: tenants.filter(t => t.state === 'no-owner').length,
        mrr, arr: mrr * 12, collectedMonth,
        expiring: active.filter(t => t.license === 'soon').length,
        expired: active.filter(t => t.license === 'expired').length,
        gmv30d: completed30.reduce((s, b) => s + b.price, 0),
        jobs30d: completed30.length,
        staff: (db.staff || []).length,
    };
}

/* ------------------------------ actions ------------------------------ */

const save = (fn: (db: MockDatabase) => void) => { const db = getDB(); fn(db); saveDB(db); };

export function approveTenant(companyId: string) {
    let name = '';
    save(db => {
        const co = db.companies.find(c => c.id === companyId);
        if (!co) return;
        name = co.name;
        db.users.forEach(u => { if (u.companyId === companyId && u.role !== 'superadmin') u.status = 'active'; });
        co.approvedAt = co.approvedAt || new Date().toISOString();
        if (!co.licenseUntil) co.licenseUntil = format(addDays(new Date(), 14), 'yyyy-MM-dd');   // the 14 day free trial promised at sign up
    });
    logAudit(`Approved tenant ${name}`, name, 'security');
}

export function suspendTenant(companyId: string) {
    let name = '';
    save(db => {
        const co = db.companies.find(c => c.id === companyId);
        if (!co) return;
        name = co.name;
        co.approvedAt = co.approvedAt || new Date().toISOString();
        // Everyone in the company loses access, not only the owner.
        db.users.forEach(u => { if (u.companyId === companyId && u.role !== 'superadmin') u.status = 'locked'; });
    });
    logAudit(`Suspended tenant ${name}`, name, 'warning');
}

export function updateTenant(companyId: string, patch: Partial<Pick<Company, 'name' | 'subscriptionPlan' | 'monthlyRevenue' | 'licenseUntil' | 'adminNotes'>>, ownerName?: string) {
    let name = '';
    save(db => {
        const co = db.companies.find(c => c.id === companyId);
        if (!co) return;
        const { adminNotes, ...companyPatch } = patch;
        Object.assign(co, companyPatch);
        delete co.adminNotes;                       // private notes live in tenantNotes, out of the tenant's reach
        if (adminNotes !== undefined || 'adminNotes' in patch) {
            db.tenantNotes = db.tenantNotes || [];
            const text = (adminNotes || '').trim();
            const existing = db.tenantNotes.find(n => n.tenantId === companyId);
            if (existing) existing.notes = text;
            else if (text) db.tenantNotes.push({ id: `note-${companyId}`, tenantId: companyId, notes: text, createdAt: new Date().toISOString() });
        }
        name = co.name;
        if (ownerName !== undefined) {
            const owner = db.users.find(u => u.companyId === companyId && u.role === 'companyadmin');
            if (owner) owner.name = ownerName;
        }
    });
    logAudit(`Updated tenant ${name}`, name, 'info');
}

export function extendLicense(companyId: string, months: number) {
    let until = '';
    save(db => {
        const co = db.companies.find(c => c.id === companyId);
        if (!co) return;
        const base = co.licenseUntil && co.licenseUntil >= today() ? parseISO(co.licenseUntil) : new Date();
        until = format(addMonths(base, months), 'yyyy-MM-dd');
        co.licenseUntil = until;
    });
    return until;
}

export function recordPlatformPayment(p: { tenantId: string; amount: number; method: PlatformPayment['method']; date: string; months: number; reference?: string; note?: string }) {
    let name = '';
    save(db => {
        const co = db.companies.find(c => c.id === p.tenantId);
        if (!co) return;
        name = co.name;
        db.platformPayments = db.platformPayments || [];
        db.platformPayments.push({ id: `pp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, createdAt: new Date().toISOString(), ...p });
    });
    if (p.months > 0) extendLicense(p.tenantId, p.months);
    logAudit(`Recorded payment of ${p.amount} QAR from ${name}${p.months > 0 ? `, license extended ${p.months} month(s)` : ''}`, name, 'success');
}

export function deletePlatformPayment(id: string) {
    save(db => { db.platformPayments = (db.platformPayments || []).filter(p => p.id !== id); });
    logAudit('Deleted a platform payment record', undefined, 'warning');
}

export function provisionTenant(p: { companyName: string; ownerName: string; email: string; plan: Plan; mrr: number; trialDays: number }): { companyId: string } {
    const stamp = Date.now();
    const companyId = `c-${stamp}`;
    save(db => {
        db.companies.push({
            id: companyId, name: p.companyName.trim(), subscriptionPlan: p.plan, monthlyRevenue: p.mrr,
            approvedAt: new Date().toISOString(), licenseUntil: format(addDays(new Date(), Math.max(0, p.trialDays)), 'yyyy-MM-dd'),
            createdAt: new Date().toISOString(),
        });
        db.users.push({
            id: `u-${stamp}`, email: p.email.trim().toLowerCase(), name: p.ownerName.trim() || p.email.split('@')[0],
            role: 'companyadmin', companyId, status: 'active', createdAt: new Date().toISOString(),
        });
    });
    logAudit(`Provisioned tenant ${p.companyName} (${PLAN_LABEL[p.plan]})`, p.companyName, 'success');
    return { companyId };
}

/** Removes the company, its people and every record that belongs to it. Photos in storage are not removed. */
export function deleteTenant(companyId: string) {
    let name = '';
    save(db => {
        name = db.companies.find(c => c.id === companyId)?.name || companyId;
        db.users = db.users.filter(u => u.companyId !== companyId);
        db.companies = db.companies.filter(c => c.id !== companyId);
        db.bookings = db.bookings.filter(r => r.companyId !== companyId);
        db.clients = db.clients.filter(r => r.companyId !== companyId);
        db.services = db.services.filter(r => r.companyId !== companyId);
        db.staff = db.staff.filter(r => r.companyId !== companyId);
        db.notifications = db.notifications.filter(r => r.companyId !== companyId);
        db.subscriptions = db.subscriptions.filter(r => r.companyId !== companyId);
        db.reviews = db.reviews.filter(r => r.companyId !== companyId);
        db.automations = db.automations.filter(r => r.companyId !== companyId);
        db.tenantNotes = (db.tenantNotes || []).filter(n => n.tenantId !== companyId);
    });
    ERP.forEach(c => removeWhere(c, r => r.companyId === companyId));
    logAudit(`Deleted tenant ${name} and all of its data`, name, 'warning');
}

export const licenseText = (t: Tenant) =>
    t.license === 'none' ? 'No date set' : t.license === 'expired' ? `Expired ${Math.abs(t.daysLeft ?? 0)} days ago` : t.daysLeft === 0 ? 'Ends today' : `${t.daysLeft} days left`;
