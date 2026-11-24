import { isCloud, sb, VIDEO_BUCKET } from './backend';

/**
 * Cleaner introduction videos. The file lives in the private "staff-videos" bucket under "<company>/<random>.<ext>"
 * and the cleaner record keeps only a reference ("sb:<path>"). Cloud mode only: a video is far too big for browser storage.
 * Keep MAX_VIDEO_BYTES and the types in step with supabase/migrations/0011_staff_videos.sql.
 */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const VIDEO_TYPES: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };

/** Returns a message when the file cannot be used, or '' when it is fine. */
export function checkVideo(file: { type: string; size: number }): string {
    if (!VIDEO_TYPES[file.type]) return 'Use an MP4, WebM or MOV video.';
    if (file.size <= 0) return 'This video is empty.';
    if (file.size > MAX_VIDEO_BYTES) return `This video is ${(file.size / 1048576).toFixed(0)} MB. The limit is ${MAX_VIDEO_BYTES / 1048576} MB.`;
    return '';
}

export async function uploadVideo(file: File, companyId: string): Promise<string> {
    if (!isCloud) throw new Error('Videos need the cloud database. They cannot be saved in demo mode.');
    const problem = checkVideo(file);
    if (problem) throw new Error(problem);
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const path = `${companyId}/${id}.${VIDEO_TYPES[file.type]}`;
    const { error } = await sb().storage.from(VIDEO_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error(/exceeded|too large|size/i.test(error.message) ? `This video is too large for your plan (${error.message}).` : error.message);
    return `sb:${path}`;
}

export async function deleteVideo(ref: string): Promise<void> {
    if (!isCloud || !ref.startsWith('sb:')) return;
    await sb().storage.from(VIDEO_BUCKET).remove([ref.slice(3)]);
}

const cache = new Map<string, { url: string; at: number }>();

/** Turn a stored reference into a link a <video> can play (valid for an hour). */
export async function resolveVideo(ref: string): Promise<string> {
    if (!ref.startsWith('sb:')) return ref;
    const hit = cache.get(ref);
    if (hit && Date.now() - hit.at < 50 * 60 * 1000) return hit.url;
    const { data, error } = await sb().storage.from(VIDEO_BUCKET).createSignedUrl(ref.slice(3), 3600);
    if (error || !data) throw error || new Error('no url');
    cache.set(ref, { url: data.signedUrl, at: Date.now() });
    return data.signedUrl;
}
