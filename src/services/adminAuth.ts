import { isCloud, sb } from './backend';
import { getDB, logAudit, saveDB } from './mockDb';

/** A strong, easy to read password (no look-alike characters). */
export function generatePassword(length = 14): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => chars[b % chars.length]).join('');
}

/** The Edge Function name as it appears in its URL. Override with VITE_ADMIN_PASSWORD_FUNCTION if yours differs. */
const PASSWORD_FUNCTION = (import.meta.env.VITE_ADMIN_PASSWORD_FUNCTION as string | undefined) || 'admin-set-password';

export interface PasswordResult { ok: boolean; message: string }

/**
 * Platform admin sets a new password for someone.
 * Cloud: calls the admin-set-password Edge Function (the only place that holds the service key).
 * Local demo mode: updates the demo user directly.
 */
export async function setUserPassword(profileId: string, password: string, label: string): Promise<PasswordResult> {
    if (password.length < 8) return { ok: false, message: 'The password must be at least 8 characters.' };

    if (!isCloud) {
        const db = getDB();
        const u = db.users.find(x => x.id === profileId);
        if (!u) return { ok: false, message: 'That person was not found.' };
        u.password = password;
        saveDB(db);
        logAudit(`Set a new password for ${label}`, label, 'security');
        return { ok: true, message: 'Password changed.' };
    }

    const { data, error } = await sb().functions.invoke(PASSWORD_FUNCTION, { body: { profileId, password } });
    if (error) {
        // The function returns readable errors in its body; fall back to a setup hint if it is not deployed yet.
        let detail = '';
        try { detail = (await (error as unknown as { context?: Response }).context?.json())?.error || ''; } catch { /* no body */ }
        if (/not found|404/i.test(error.message) && !detail) {
            return { ok: false, message: 'The password function is not deployed yet. Follow the setup step in supabase/README.md (Edge Functions).' };
        }
        return { ok: false, message: detail || error.message };
    }
    if (data?.error) return { ok: false, message: data.error };
    logAudit(`Set a new password for ${label}`, label, 'security');
    return { ok: true, message: 'Password changed.' };
}

/** Demo mode only: the real password is stored in plain text in this browser. Never available in cloud mode. */
export function readDemoPassword(profileId: string): string | null {
    if (isCloud) return null;
    return getDB().users.find(u => u.id === profileId)?.password || null;
}
