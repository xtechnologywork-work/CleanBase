import { isCloud, PHOTO_BUCKET, sb } from './backend';
import { addDays, format, parseISO } from 'date-fns';
import { today, uid } from './erp';
import { resolvePhoto, uploadPhoto } from './photos';

/**
 * Staff documents (QID, visa, health card, contract...). A document is a photo or a PDF.
 * Photos are compressed and stored like job photos. PDFs are stored as they are, in the same private bucket
 * under "<company>/docs/<file>.pdf" (cloud mode only: a PDF does not fit in browser storage).
 */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const isPdfRef = (ref: string) => /\.pdf$/i.test(ref) || ref.startsWith('data:application/pdf');

/** Returns a message when the file cannot be used, or '' when it is fine. */
export function checkDocument(file: { type: string; size: number }): string {
    if (file.type === 'application/pdf') {
        if (file.size <= 0) return 'This PDF is empty.';
        return file.size > MAX_PDF_BYTES ? `This PDF is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${MAX_PDF_BYTES / 1048576} MB.` : '';
    }
    return file.type.startsWith('image/') ? '' : 'Choose a photo or a PDF.';
}

export async function uploadDocument(file: File, companyId: string): Promise<string> {
    const problem = checkDocument(file);
    if (problem) throw new Error(problem);
    if (file.type !== 'application/pdf') return uploadPhoto(file, companyId, 'docs', 1200);
    if (!isCloud) throw new Error('PDF files need the cloud database. In demo mode, add a photo of the document instead.');
    const path = `${companyId}/docs/${uid('doc')}.pdf`;
    const { error } = await sb().storage.from(PHOTO_BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: false });
    if (error) throw new Error(error.message);
    return `sb:${path}`;
}

/** Open a stored document in a new tab (a PDF viewer, or the full photo). */
export async function openDocument(ref: string): Promise<void> {
    const url = await resolvePhoto(ref);
    window.open(url, '_blank', 'noopener');
}

export const DOC_TYPES = ['QID', 'Visa', 'Health card', 'Passport', 'Contract', 'Other'];

/** How a document stands on a day (default today): lapsed, running out within 30 days, or fine. */
export const docState = (expiry: string, now = today()): 'expired' | 'soon' | 'valid' => {
    if (expiry < now) return 'expired';
    return expiry <= format(addDays(parseISO(now), 30), 'yyyy-MM-dd') ? 'soon' : 'valid';
};
