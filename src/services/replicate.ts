/**
 * Cloud replication.
 *
 * The app reads from a local cache (instant, synchronous). This module keeps that cache and Supabase in step:
 *   hydrate()   downloads everything the signed-in person is allowed to see into the cache
 *   flush()     finds what changed locally since the last sync and writes only that to Supabase
 *   realtime    applies other people's changes as they happen
 * Row level security in the database is the real gatekeeper. If it refuses a change, the cache is
 * reloaded from the server so the screen never shows something that was not saved.
 */
import { DB_KEY, ERP_KEY, isCloud, sb } from './backend';
import { resetErpCache } from './erp';
import type { User } from '../types';

export const CORE = ['companies', 'bookings', 'clients', 'services', 'staff', 'notifications', 'subscriptions', 'reviews', 'automations'] as const;
export const ERP = ['invoices', 'payments', 'expenses', 'zones', 'vehicles', 'supplies', 'supplyUsage', 'jobMeta', 'staffMeta', 'staffDocs',
    'attendance', 'leave', 'payroll', 'leads', 'quotes', 'complaints', 'promos', 'clientMeta', 'reviewRequests', 'contractTemplates', 'contracts', 'activity', 'settings', 'trips', 'accommodations'] as const;
/** Platform-admin-only collections: stored without a company id, so tenants can never read or write them. */
export const PLATFORM = ['platformPayments', 'tenantNotes'] as const;
const RECORD_COLLECTIONS: string[] = [...CORE, ...ERP, ...PLATFORM, 'auditLogs', 'platformSettings'];

type Row = { id: string; [k: string]: unknown };
type Local = Record<string, Row[]>;

export type SyncState = 'idle' | 'saving' | 'saved' | 'offline' | 'error';
export const emitSync = (state: SyncState, message?: string) =>
    window.dispatchEvent(new CustomEvent('cleanbase-sync', { detail: { state, message } }));

const REFRESH = 'cleanbase-data-changed';

/* ------------------------------ helpers ------------------------------ */

const canon = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
    if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canon(o[k])}`).join(',')}}`;
    }
    return JSON.stringify(v) ?? 'null';
};

const userFields = (u: Partial<User> & Record<string, unknown>) => ({
    id: u.id, email: u.email, name: u.name, role: u.role, companyId: u.companyId ?? null, status: u.status ?? 'active', createdAt: u.createdAt,
});
const toProfile = (u: User) => ({
    id: u.id, email: u.email, name: u.name ?? '', role: u.role, company_id: u.companyId ?? null, status: u.status ?? 'active',
    created_at: u.createdAt || new Date().toISOString(),
});
type ProfileRow = { id: string; email: string; name: string; role: User['role']; company_id: string | null; status: 'active' | 'locked'; created_at: string };
export const fromProfile = (p: ProfileRow): User => ({
    id: p.id, email: p.email, name: p.name, role: p.role, companyId: p.company_id ?? undefined, status: p.status, createdAt: p.created_at,
});

/* ----------------------------- local cache ---------------------------- */

function readLocal(): Local {
    const out: Local = { users: [] };
    try {
        const db = JSON.parse(localStorage.getItem(DB_KEY) || '{}');
        out.users = db.users || [];
        [...CORE, ...PLATFORM, 'auditLogs'].forEach(c => { out[c] = db[c] || []; });
        out.platformSettings = db.platformSettings ? [{ id: 'platform', ...db.platformSettings }] : [];
    } catch { /* empty cache */ }
    try {
        const erp = JSON.parse(localStorage.getItem(ERP_KEY) || '{}');
        ERP.forEach(c => { out[c] = erp[c] || []; });
    } catch { /* empty cache */ }
    return out;
}

function writeLocal(map: Local) {
    let db: Record<string, unknown> = {};
    try { db = JSON.parse(localStorage.getItem(DB_KEY) || '{}'); } catch { /* fresh */ }
    db.users = map.users || [];
    [...CORE, ...PLATFORM, 'auditLogs'].forEach(c => { db[c] = map[c] || []; });
    const ps = (map.platformSettings || [])[0];
    if (ps) { const { id: _id, ...rest } = ps; void _id; db.platformSettings = rest; } else delete db.platformSettings;
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    const erp: Record<string, Row[]> = {};
    ERP.forEach(c => { erp[c] = map[c] || []; });
    localStorage.setItem(ERP_KEY, JSON.stringify(erp));
    resetErpCache();
}

export function clearCloudCache() {
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(ERP_KEY);
    resetErpCache();
    snap = {};
}

/* ------------------------------ snapshot ------------------------------ */

let snap: Record<string, Map<string, string>> = {};
const snapKey = (col: string, row: Row) => (col === 'users' ? canon(userFields(row as never)) : canon(row));

function setSnapFromLocal(map: Local) {
    snap = {};
    Object.entries(map).forEach(([col, rows]) => { snap[col] = new Map(rows.map(r => [r.id, snapKey(col, r)])); });
}

/* ------------------------------- hydrate ------------------------------ */

async function fetchAll<T>(table: string, order: string[]): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += 1000) {
        let q = sb().from(table).select('*');
        order.forEach(o => { q = q.order(o); });
        const { data, error } = await q.range(from, from + 999);
        if (error) throw error;
        out.push(...((data || []) as T[]));
        if (!data || data.length < 1000) break;
    }
    return out;
}

async function fetchMap(): Promise<Local> {
    const [recs, profs] = await Promise.all([
        fetchAll<{ collection: string; id: string; data: Row }>('records', ['collection', 'id']),
        fetchAll<ProfileRow>('profiles', ['id']),
    ]);
    const map: Local = { users: profs.map(fromProfile) as unknown as Row[] };
    RECORD_COLLECTIONS.forEach(c => { map[c] = []; });
    recs.forEach(r => { if (map[r.collection]) map[r.collection].push(asRow(r.data)); });
    // platformSettings rows come back without their id field; restore it for the cache
    map.platformSettings = map.platformSettings.map(r => ({ ...r, id: 'platform' }));
    return map;
}

let lastSyncAt = 0;

export async function hydrate(): Promise<void> {
    const map = await fetchMap();
    writeLocal(map);
    setSnapFromLocal(readLocal());
    lastSyncAt = Date.now();
    window.dispatchEvent(new Event(REFRESH));
}

const fingerprint = (map: Local) =>
    Object.keys(map).sort().map(c => c + ':' + (map[c] || []).map(r => r.id + snapKey(c, r)).sort().join('|')).join('#');

/** Silent re-read from the server. The screen is only touched if something actually changed. */
export async function resync(): Promise<boolean> {
    if (!isCloud || !role || busy || computeOps().length) return false;
    const map = await fetchMap();
    lastSyncAt = Date.now();
    if (fingerprint(map) === fingerprint(readLocal())) return false;
    writeLocal(map);
    setSnapFromLocal(readLocal());
    window.dispatchEvent(new Event(REFRESH));
    return true;
}

/** For the diagnostics panel: what this browser currently holds. */
export function getSyncStats() {
    const local = readLocal();
    return {
        mode: isCloud ? 'cloud' : 'local',
        role,
        realtime: channel !== null,
        pending: isCloud && role ? computeOps().reduce((n, o) => n + o.insert.length + o.update.length + o.remove.length, 0) : 0,
        lastSyncAt,
        counts: Object.fromEntries(Object.entries(local).map(([k, v]) => [k, v.length])) as Record<string, number>,
    };
}

/* --------------------------------- push -------------------------------- */

interface Ops { col: string; insert: Row[]; update: Row[]; remove: string[] }
let role: User['role'] | null = null;

function computeOps(): Ops[] {
    const local = readLocal();
    const isSuper = role === 'superadmin';
    const ops: Ops[] = [];
    Object.keys(local).forEach(col => {
        if ((col === 'platformSettings' || (PLATFORM as readonly string[]).includes(col)) && !isSuper) return;   // only the platform admin changes these
        const rows = local[col] || [];
        const known = snap[col] || new Map<string, string>();
        const insert: Row[] = [], update: Row[] = [];
        const seen = new Set<string>();
        rows.forEach(r => {
            if (!r || !r.id) return;
            seen.add(r.id);
            const k = snapKey(col, r);
            if (!known.has(r.id)) insert.push(r);
            else if (known.get(r.id) !== k) update.push(r);
        });
        const remove = col === 'auditLogs' && !isSuper ? [] : [...known.keys()].filter(id => !seen.has(id));
        if (col === 'auditLogs') update.length = 0;               // logs are append-only
        if (insert.length || update.length || remove.length) ops.push({ col, insert, update, remove });
    });
    return ops;
}

const REJECTED = (e: { code?: string; status?: number }) =>
    e.code === '42501' || e.code === 'P0001' || e.code === '23505' || e.code === '23514' || e.status === 403 || e.status === 400 || e.status === 409;
/** Which kind of record was being saved when the database refused, in words a person understands. */
const WHAT: Record<string, string> = {
    trips: 'driver rides', accommodations: 'accommodations', users: 'team members', staff: 'cleaners and drivers', bookings: 'bookings', clients: 'clients',
    invoices: 'invoices', payments: 'payments', settings: 'business settings', companies: 'company details', activity: 'the activity log',
};
let pushing = '';
const friendly = (e: { code?: string; message?: string }) =>
    e.code === '42501' ? `You do not have permission to change ${pushing ? (WHAT[pushing] || pushing) : 'this'}, so it was not saved.`
    
    : e.code === '23505' ? 'That email or record already exists, so it was not saved.'
    : e.message || 'The change was refused by the database.';

/** Rows arrive as objects; tolerate JSON text in case a transport hands it over as a string. */
const asRow = (d: unknown): Row => (typeof d === 'string' ? JSON.parse(d) : d) as Row;

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

type DbError = { code?: string; status?: number; message?: string };

/**
 * Writes every change to the database. One refused change must never undo the ones that were accepted
 * (for example a new cleaner saved in the same moment as something the database does not allow): a refused
 * group of rows is retried one row at a time, every other collection is still saved, and only then is the
 * first refusal reported. A network failure (not a refusal) stops everything so it can be retried as a whole.
 */
async function applyOps(ops: Ops[]) {
    const supa = sb();
    let refused: { error: DbError; col: string } | null = null;
    const refuse = (error: DbError, col: string) => { console.error(`[CleanBase] the database refused a change to "${col}":`, error); refused ||= { error, col }; };
    /** Run a write; a refusal is remembered, anything else (offline, server down) is thrown. */
    const attempt = async (col: string, run: () => PromiseLike<{ error: DbError | null }>): Promise<boolean> => {
        const { error } = await run();
        if (!error) return true;
        if (!REJECTED(error)) throw error;
        refuse(error, col);
        return false;
    };

    for (const { col, insert, update, remove } of ops) {
        const upd = (rows: Row[]) => rows.forEach(r => snap[col].set(r.id, snapKey(col, r)));
        snap[col] ||= new Map();
        /** Insert rows together; if the database refuses the group, try them one by one so the good rows still get in. */
        const insertRows = async (rows: Row[], write: (part: Row[]) => PromiseLike<{ error: DbError | null }>) => {
            if (rows.length === 0) return;
            const { error } = await write(rows);
            if (!error) { upd(rows); return; }
            if (!REJECTED(error)) throw error;
            if (rows.length === 1) { refuse(error, col); return; }
            for (const r of rows) { if (await attempt(col, () => write([r]))) upd([r]); }
        };

        if (col === 'users') {
            for (const part of chunk(insert, 100)) await insertRows(part, p => supa.from('profiles').insert(p.map(r => toProfile(r as unknown as User))));
            for (const r of update) {
                const p = toProfile(r as unknown as User);
                if (await attempt(col, () => supa.from('profiles').update({ name: p.name, role: p.role, status: p.status, company_id: p.company_id }).eq('id', r.id))) upd([r]);
            }
            for (const id of remove) {
                if (await attempt(col, () => supa.from('profiles').delete().eq('id', id))) snap[col].delete(id);
            }
            continue;
        }
        const companyOf = (r: Row) => (col === 'companies' ? r.id : (r.companyId as string | undefined) ?? null);
        for (const part of chunk(insert, 200)) await insertRows(part, p => supa.from('records').insert(p.map(r => ({ collection: col, id: r.id, company_id: companyOf(r), data: r }))));
        for (const part of chunk(update, 10)) {
            await Promise.all(part.map(async r => {
                if (await attempt(col, () => supa.from('records').update({ data: r }).eq('collection', col).eq('id', r.id))) upd([r]);
            }));
        }
        for (const part of chunk(remove, 100)) {
            if (await attempt(col, () => supa.from('records').delete().eq('collection', col).in('id', part))) part.forEach(id => snap[col].delete(id));
        }
    }
    if (refused) { const r: { error: DbError; col: string } = refused; pushing = r.col; throw r.error; }
}

let busy = false, again = false, timer: ReturnType<typeof setTimeout> | null = null, retry: ReturnType<typeof setTimeout> | null = null;

export async function flush(): Promise<void> {
    if (!isCloud || !role) return;
    if (busy) { again = true; return; }
    busy = true;
    try {
        const ops = computeOps();
        if (!ops.length) { emitSync('saved'); return; }
        emitSync('saving');
        await applyOps(ops);
        lastSyncAt = Date.now();
        emitSync('saved');
    } catch (e) {
        const err = e as { code?: string; status?: number; message?: string };
        if (REJECTED(err)) {
            emitSync('error', friendly(err));
            try { await hydrate(); } catch { /* shown as offline next time */ }
        } else {
            emitSync('offline', 'Offline. Your changes are kept and will save when the connection returns.');
            if (retry) clearTimeout(retry);
            retry = setTimeout(() => { void flush(); }, 6000);
        }
    } finally {
        busy = false;
        if (again) { again = false; schedule(); }
    }
}

function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void flush(); }, 400);
}

/* ------------------------------- realtime ------------------------------ */

let channel: ReturnType<ReturnType<typeof sb>['channel']> | null = null;
let started = false;

export function applyRemote(col: string, id: string, row: Row | null) {
    const local = readLocal();
    const rows = local[col] || [];
    const known = (snap[col] ||= new Map());
    if (row) {
        const row2 = col === 'platformSettings' ? { ...row, id: 'platform' } : row;
        const key = snapKey(col, row2);
        if (known.get(id) === key) return;                          // our own echo
        const i = rows.findIndex(r => r.id === id);
        if (i >= 0) rows[i] = row2; else rows.push(row2);
        known.set(id, key);
    } else {
        const i = rows.findIndex(r => r.id === id);
        if (i < 0) return;
        rows.splice(i, 1);
        known.delete(id);
    }
    local[col] = rows;
    writeLocal(local);
    window.dispatchEvent(new Event(REFRESH));
}

function subscribe(companyId: string | null) {
    const supa = sb();
    channel?.unsubscribe();
    const filter = companyId ? { filter: `company_id=eq.${companyId}` } : {};
    channel = supa.channel('cleanbase-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'records', ...filter }, payload => {
            if (payload.eventType === 'DELETE') {
                const old = payload.old as { collection?: string; id?: string };
                if (old.collection && old.id) applyRemote(old.collection, old.id, null);
            } else {
                const n = payload.new as { collection: string; id: string; data: Row };
                applyRemote(n.collection, n.id, asRow(n.data));
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', ...filter }, payload => {
            if (payload.eventType === 'DELETE') {
                const old = payload.old as { id?: string };
                if (old.id) applyRemote('users', old.id, null);
            } else {
                applyRemote('users', (payload.new as ProfileRow).id, fromProfile(payload.new as ProfileRow) as unknown as Row);
            }
        })
        .subscribe();
}

/** Call after sign-in once the profile is known. */
export async function startReplication(user: User) {
    if (!isCloud) return;
    role = user.role;
    await hydrate();
    if (!started) {
        started = true;
        window.addEventListener('cleanbase-save', schedule);
        window.addEventListener('online', () => { void flush(); });
        window.addEventListener('focus', () => { void resync().catch(() => undefined); });
        // Safety net in case a live update was missed (sleeping laptop, dropped connection).
        const poll = setInterval(() => { if (typeof document === 'undefined' || document.visibilityState === 'visible') void resync().catch(() => undefined); }, 30000) as unknown as { unref?: () => void };
        poll.unref?.();
    }
    subscribe(user.role === 'superadmin' ? null : user.companyId ?? null);
}

export function stopReplication() {
    channel?.unsubscribe();
    channel = null;
    role = null;
    if (timer) clearTimeout(timer);
    if (retry) clearTimeout(retry);
    clearCloudCache();
}

/** Used by import-from-this-browser: push everything the cache holds that the server does not have. */
export const flushNow = () => flush();
