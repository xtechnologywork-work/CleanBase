import { isCloud, PHOTO_BUCKET, sb } from './backend';
import { compressImage, uid } from './erp';

/**
 * Photos. Cloud mode stores the file in a private Supabase Storage bucket under "<company>/<job>/<file>"
 * and keeps only a reference ("sb:<path>") on the job. Local mode keeps a small data URL in the browser.
 */
export async function uploadPhoto(file: File, companyId: string, bookingId: string, max = 640): Promise<string> {
    const dataUrl = await compressImage(file, max);
    if (!isCloud) return dataUrl;
    const blob = await (await fetch(dataUrl)).blob();
    const path = `${companyId}/${bookingId}/${uid('ph')}.jpg`;
    const { error } = await sb().storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
    if (error) throw error;
    return `sb:${path}`;
}

export async function deletePhoto(ref: string): Promise<void> {
    if (!isCloud || !ref.startsWith('sb:')) return;
    await sb().storage.from(PHOTO_BUCKET).remove([ref.slice(3)]);
}

const cache = new Map<string, { url: string; at: number }>();

/** Turn a stored reference into something an <img> can show. */
export async function resolvePhoto(ref: string): Promise<string> {
    if (!ref.startsWith('sb:')) return ref;
    const hit = cache.get(ref);
    if (hit && Date.now() - hit.at < 50 * 60 * 1000) return hit.url;
    const { data, error } = await sb().storage.from(PHOTO_BUCKET).createSignedUrl(ref.slice(3), 3600);
    if (error || !data) throw error || new Error('no url');
    cache.set(ref, { url: data.signedUrl, at: Date.now() });
    return data.signedUrl;
}
