/* -------------------------------------------------------------------------- */
/*  Owner actions on drivers: add one, change a password, remove one.         */
/*  Cloud: the driver-admin Edge Function does it (it holds the service key). */
/*  Demo mode: everything is written to the browser's own data.               */
/* -------------------------------------------------------------------------- */
import { isCloud, sb } from './backend';
import { getDB, saveDB } from './mockDb';
import { logActivity, readCollection, removeItem } from './erp';
import { applyRemote, fromProfile } from './replicate';
import { DRIVER_PASSWORD_MIN, driverDigits, driverEmail } from './driverAccounts';
import type { User } from '../types';

/* ------------------------------ create, change, remove ------------------------------ */

export interface DriverResult { ok: boolean; error?: string; profileId?: string }

const FUNCTION = (import.meta.env.VITE_DRIVER_FUNCTION as string | undefined) || 'driver-admin';

/** Calls the driver-admin Edge Function and turns its answer into something a person can read. */
async function callFunction(body: Record<string, unknown>): Promise<DriverResult> {
    const { data, error } = await sb().functions.invoke(FUNCTION, { body });
    if (error) {
        const res = (error as unknown as { context?: Response }).context;
        const status = res?.status;
        let detail = '';
        try { const b = await res?.clone().json(); detail = b?.error || b?.message || ''; } catch { /* no readable body */ }
        if (status === 404 || /requested function was not found/i.test(detail)) {
            return { ok: false, error: 'The driver service is not set up yet. Deploy the "driver-admin" function in Supabase (Edge Functions), then try again.' };
        }
        if (status === 401) return { ok: false, error: 'Your session expired. Sign in again and retry.' };
        if (!res) return { ok: false, error: 'Could not reach the driver service. Check your internet, and that the "driver-admin" function is deployed in Supabase.' };
        return { ok: false, error: detail || `The driver service failed (error ${status}). Open Supabase, Edge Functions, driver-admin, Logs to see why.` };
    }
    if (data?.error) return { ok: false, error: data.error };
    // Our function always answers { ok: true }. Anything else (for example the "Hello ..." sample that Supabase puts in a new function) is the wrong code.
    if (data?.ok !== true) {
        return { ok: false, error: 'The "driver-admin" function in Supabase is not the CleanBase code (it did nothing). Open it, replace ALL the code with the file supabase/functions/driver-admin/index.ts, and press Deploy.' };
    }
    return { ok: true, profileId: data?.profileId };
}

/** Reads the driver (login profile and team record) from the server and puts it in this screen at once, without waiting for a live update. */
async function pullDriver(profileId: string): Promise<boolean> {
    const client = sb();
    const { data: p } = await client.from('profiles').select('*').eq('id', profileId).maybeSingle();
    if (!p) return false;
    applyRemote('users', p.id, fromProfile(p) as unknown as { id: string });
    const { data: recs } = await client.from('records').select('id,data').eq('collection', 'staff').eq('data->>userId', profileId);
    (recs || []).forEach((r: { id: string; data: unknown }) => applyRemote('staff', r.id, r.data as { id: string }));
    return true;
}

export interface NewDriver { companyId: string; name: string; phone: string; password: string; actor: string }

/** The owner adds a driver. Cloud: the Edge Function creates the login, the profile and the team record. Demo: all of it is written here. */
export async function createDriver(d: NewDriver): Promise<DriverResult> {
    const name = d.name.trim();
    if (name.length < 2) return { ok: false, error: 'Enter the driver name.' };
    const digits = driverDigits(d.phone);
    if (!digits) return { ok: false, error: 'Enter a valid phone number, for example 5512 3456 or +974 5512 3456.' };
    if (d.password.length < DRIVER_PASSWORD_MIN) return { ok: false, error: `The password needs at least ${DRIVER_PASSWORD_MIN} characters.` };

    if (isCloud) {
        const r = await callFunction({ action: 'create', name, phone: digits, password: d.password });
        if (!r.ok) return r;
        // Never say "added" unless the server really has the driver
        if (!r.profileId || !(await pullDriver(r.profileId))) {
            return { ok: false, error: 'The server answered, but the driver was not saved. Open Supabase, Edge Functions, driver-admin, Logs to see why, then try again.' };
        }
        logActivity(d.companyId, d.actor, 'Added a driver', name);
        return r;
    }

    const db = getDB();
    const email = driverEmail(d.companyId, digits);
    if (db.users.some(u => (u.email || '').toLowerCase() === email)) return { ok: false, error: 'A driver with this phone number already exists in your team.' };
    const stamp = Date.now();
    const user: User = { id: `u-${stamp}`, email, name, role: 'driver', companyId: d.companyId, status: 'active', password: d.password, createdAt: new Date().toISOString() };
    db.users.push(user);
    db.staff.push({ id: `staff-${stamp}`, companyId: d.companyId, userId: user.id, phone: `+${digits}`, rating: 5, completedJobsCount: 0, revenueGenerated: 0, createdAt: new Date().toISOString() });
    saveDB(db);
    logActivity(d.companyId, d.actor, 'Added a driver', name);
    return { ok: true, profileId: user.id };
}

export async function setDriverPassword(companyId: string, profileId: string, password: string, actor: string): Promise<DriverResult> {
    if (password.length < DRIVER_PASSWORD_MIN) return { ok: false, error: `The password needs at least ${DRIVER_PASSWORD_MIN} characters.` };
    if (isCloud) {
        const r = await callFunction({ action: 'set_password', profileId, password });
        if (r.ok) logActivity(companyId, actor, 'Changed a driver password', profileId);
        return r;
    }
    const db = getDB();
    const u = db.users.find(x => x.id === profileId && x.companyId === companyId && x.role === 'driver');
    if (!u) return { ok: false, error: 'That driver was not found.' };
    u.password = password;
    saveDB(db);
    logActivity(companyId, actor, 'Changed a driver password', u.name);
    return { ok: true };
}

/** Removes the driver: the login, the profile, the team record and their rides. */
export async function deleteDriver(companyId: string, profileId: string, actor: string): Promise<DriverResult> {
    if (isCloud) {
        // The function also removes the login. If it is not available, the owner can still remove the driver from the team
        // (the database lets an owner delete their own team), and the unused login can no longer open anything.
        const fn = await callFunction({ action: 'delete', profileId });
        const client = sb();
        const { data: staffRows } = await client.from('records').select('id').eq('collection', 'staff').eq('data->>userId', profileId);
        const staffIds = (staffRows || []).map((r: { id: string }) => r.id);
        if (staffIds.length) {
            await client.from('records').delete().eq('collection', 'trips').in('data->>driverId', staffIds);
            await client.from('records').delete().eq('collection', 'staff').in('id', staffIds);
        }
        await client.from('profiles').delete().eq('id', profileId);
        // Never say "removed" unless the server really has no such driver any more
        const { data: still } = await client.from('profiles').select('id').eq('id', profileId).maybeSingle();
        if (!still) {
            readCollection('trips', companyId).filter(t => staffIds.includes(t.driverId)).forEach(t => applyRemote('trips', t.id, null));
            staffIds.forEach(id => applyRemote('staff', id, null));
            applyRemote('users', profileId, null);
        }
        if (still) return { ok: false, error: fn.error || 'The server did not remove this driver. Try again, or check that the driver-admin function is deployed.' };
        logActivity(companyId, actor, 'Removed a driver', profileId);
        return { ok: true };
    }
    const db = getDB();
    const u = db.users.find(x => x.id === profileId && x.companyId === companyId && x.role === 'driver');
    if (!u) return { ok: false, error: 'That driver was not found.' };
    const staff = db.staff.find(s => s.userId === u.id);
    db.users = db.users.filter(x => x.id !== u.id);
    db.staff = db.staff.filter(s => s.userId !== u.id);
    saveDB(db);
    if (staff) {
        readCollection('trips', companyId).filter(t => t.driverId === staff.id).forEach(t => removeItem('trips', t.id));
    }
    logActivity(companyId, actor, 'Removed a driver', u.name);
    return { ok: true };
}
