import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Cloud mode turns on when the Supabase keys are present in .env.local.
 * Without them the app runs in local demo mode (data stays in this browser), exactly as before.
 * Cloud data lives under different browser storage keys, so local demo data is never touched.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isCloud = Boolean(url && anon);

export const supabase: SupabaseClient | null = isCloud
    ? createClient(url as string, anon as string, { auth: { persistSession: true, autoRefreshToken: true } })
    : null;

export const sb = (): SupabaseClient => {
    if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.');
    return supabase;
};

export const LEGACY_DB_KEY = 'cleancrm_mock_db';
export const LEGACY_ERP_KEY = 'cleanbase_erp_v1';
export const DB_KEY = isCloud ? 'cleanbase_cloud_db' : LEGACY_DB_KEY;
export const ERP_KEY = isCloud ? 'cleanbase_cloud_erp' : LEGACY_ERP_KEY;

export const PHOTO_BUCKET = 'job-photos';
export const VIDEO_BUCKET = 'staff-videos';
