import { ERP_KEY, LEGACY_DB_KEY, LEGACY_ERP_KEY, isCloud, sb } from './backend';
import { getDB, saveDB } from './mockDb';
import { resetErpCache } from './erp';
import { CORE, ERP } from './replicate';
import type { MockDatabase, User } from '../types';

type Row = { id: string; companyId?: string; [k: string]: unknown };

const parse = (key: string): Record<string, unknown> | null => {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
};

function download(filename: string, data: unknown) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

/** Download everything this company has: bookings, clients, invoices and so on. */
export async function exportCompany(companyId: string): Promise<void> {
    const stamp = new Date().toISOString().slice(0, 10);
    if (isCloud) {
        const { data, error } = await sb().rpc('export_company', { p_company: companyId });
        if (error) { alert(error.message); return; }
        download(`cleanbase-export-${stamp}.json`, data);
        return;
    }
    const db = getDB() as unknown as Record<string, Row[]>;
    const erp = parse(ERP_KEY) as Record<string, Row[]> | null;
    const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), companyId };
    [...CORE].forEach(c => { out[c] = (db[c] || []).filter(r => (c === 'companies' ? r.id : r.companyId) === companyId); });
    out.users = (db.users || []).filter(u => u.companyId === companyId).map(u => ({ ...u, password: undefined }));
    ERP.forEach(c => { out[c] = ((erp || {})[c] || []).filter(r => r.companyId === companyId); });
    download(`cleanbase-export-${stamp}.json`, out);
}

/* ----------------- import data from the old browser-only version ----------------- */

export interface LegacyCompany { id: string; name: string; bookings: number; clients: number; staff: number }

/** Companies found in this browser's old demo storage (only meaningful in cloud mode). */
export function listLegacyCompanies(): LegacyCompany[] {
    if (!isCloud) return [];
    const db = parse(LEGACY_DB_KEY) as unknown as MockDatabase | null;
    if (!db?.companies) return [];
    return db.companies.map(c => ({
        id: c.id, name: c.name,
        bookings: (db.bookings || []).filter(b => b.companyId === c.id && !b.id.startsWith('demo-')).length,
        clients: (db.clients || []).filter(x => x.companyId === c.id && !x.id.startsWith('demo-')).length,
        staff: (db.staff || []).filter(s => s.companyId === c.id && !s.id.startsWith('demo-')).length,
    }));
}

/**
 * Copy one old company's data into the signed-in company. Sample data (ids starting "demo-") is skipped.
 * Team members become pending profiles: they sign up with the same email to get access.
 * Nothing is deleted from the old browser storage.
 */
export function importLegacyCompany(legacyCompanyId: string, targetCompanyId: string): { imported: number; skipped: number } {
    const legacy = parse(LEGACY_DB_KEY) as unknown as Record<string, Row[]> | null;
    const legacyErp = (parse(LEGACY_ERP_KEY) || {}) as Record<string, Row[]>;
    if (!legacy) return { imported: 0, skipped: 0 };
    let imported = 0, skipped = 0;
    const remap = (r: Row): Row => ({ ...r, companyId: targetCompanyId });

    const db = getDB() as unknown as Record<string, Row[]>;
    const existing = (c: string) => new Set((db[c] || []).map(r => r.id));
    [...CORE].filter(c => c !== 'companies').forEach(c => {
        const have = existing(c);
        db[c] = db[c] || [];
        (legacy[c] || []).filter(r => r.companyId === legacyCompanyId).forEach(r => {
            if (r.id.startsWith('demo-') || have.has(r.id)) { skipped++; return; }
            db[c].push(remap(r)); imported++;
        });
    });
    const haveUsers = new Set((db.users || []).map(u => (u as unknown as User).email.toLowerCase()));
    (legacy.users || []).filter(u => u.companyId === legacyCompanyId).forEach(u => {
        const usr = u as unknown as User;
        // the owner already exists in the cloud, and local-only placeholder addresses cannot sign up
        if (usr.role === 'companyadmin' || u.id.startsWith('demo-') || haveUsers.has(usr.email.toLowerCase())) { skipped++; return; }
        db.users = db.users || [];
        db.users.push({ id: u.id, email: usr.email, name: usr.name, role: usr.role, companyId: targetCompanyId, status: 'active', createdAt: usr.createdAt } as unknown as Row);
        imported++;
    });
    saveDB(db as unknown as MockDatabase);

    const cloudErp = (parse(ERP_KEY) || {}) as Record<string, Row[]>;
    ERP.forEach(c => {
        const have = new Set((cloudErp[c] || []).map(r => r.id));
        cloudErp[c] = cloudErp[c] || [];
        (legacyErp[c] || []).filter(r => r.companyId === legacyCompanyId).forEach(r => {
            if (r.id.startsWith('demo-') || have.has(r.id)) { skipped++; return; }
            const row = remap(r);
            if (c === 'settings') row.id = `set-${targetCompanyId}`;
            cloudErp[c].push(row); imported++;
        });
    });
    localStorage.setItem(ERP_KEY, JSON.stringify(cloudErp));
    resetErpCache();
    window.dispatchEvent(new Event('cleanbase-save'));
    window.dispatchEvent(new Event('cleanbase-data-changed'));
    return { imported, skipped };
}
