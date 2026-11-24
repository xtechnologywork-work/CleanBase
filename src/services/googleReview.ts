/* -------------------------------------------------------------------------- */
/*  The company's Google Maps review link. When it is set and switched on,     */
/*  review requests send customers there, so the review is a real Google one.  */
/* -------------------------------------------------------------------------- */

/** `direct` is true when the link opens the "write a review" form itself, false when it only opens the business page on Google Maps. */
export type GoogleLink = { ok: true; url: string; direct: boolean } | { ok: false; error: string };
export type ReviewMode = 'private' | 'google';

/** Hosts a Google review link can live on: google.<country>, g.page, g.co and the goo.gl short links (maps.app.goo.gl). */
const GOOGLE_HOST = /(^|\.)google\.(com?\.)?[a-z]{2,3}$/;
const SHORT_HOSTS = ['g.page', 'g.co', 'goo.gl'];
/** A Google Place ID, for example ChIJN1t_tDeuEmsRUsoyG83frY4. */
const PLACE_ID = /^ChIJ[\w-]{15,}$/;

const hostOk = (host: string) => GOOGLE_HOST.test(host) || SHORT_HOSTS.some(h => host === h || host.endsWith(`.${h}`));

/**
 * Check what the owner pasted. Accepts a Google Maps or Google Business share link, a g.page review link,
 * a goo.gl short link, or a Place ID (turned into the "write a review" link). Anything else is refused,
 * so a customer is never sent to a wrong or unsafe address.
 */
export function parseGoogleReviewLink(input: string): GoogleLink {
    const raw = (input || '').trim();
    if (!raw) return { ok: false, error: 'Paste your Google review link.' };
    if (raw.length > 600) return { ok: false, error: 'This link is too long. Paste only the review link.' };
    if (PLACE_ID.test(raw)) return { ok: true, url: writeReviewUrl(raw), direct: true };
    if (/\s/.test(raw)) return { ok: false, error: 'The link must not contain spaces. Paste only the link.' };

    let u: URL;
    try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`); }
    catch { return { ok: false, error: 'This is not a valid link.' }; }

    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, error: 'The link must start with https://' };
    if (u.username || u.password) return { ok: false, error: 'This is not a valid Google link.' };
    const host = u.hostname.toLowerCase();
    if (!hostOk(host)) return { ok: false, error: 'This is not a Google link. Use the review link from Google Maps or your Google Business Profile.' };
    if ((u.pathname === '/' || u.pathname === '') && !u.search) return { ok: false, error: 'This is the Google home page. Paste the link of your business review page.' };
    u.protocol = 'https:';

    // A link that carries the Place ID (placeid=... or place_id:...) is turned into the direct review form
    const pid = u.searchParams.get('placeid') || u.searchParams.get('place_id') || /place_id:(ChIJ[\w-]{15,})/.exec(decodeURIComponent(u.pathname + u.search))?.[1] || '';
    if (PLACE_ID.test(pid)) return { ok: true, url: writeReviewUrl(pid), direct: true };

    const path = u.pathname.toLowerCase();
    const direct = (host === 'search.google.com' && path.includes('/writereview')) || (host === 'g.page' && /\/review\/?$/.test(path));
    return { ok: true, url: u.toString(), direct };
}

const writeReviewUrl = (placeId: string) => `https://search.google.com/local/writereview?placeid=${placeId}`;

export const PLACE_ID_FINDER = 'https://developers.google.com/maps/documentation/places/web-service/place-id';

/** Where review requests go: Google only when it is switched on and the saved link is valid. */
export function reviewTarget(s: { reviewMode?: string; googleReviewUrl?: string }): { mode: ReviewMode; url: string } {
    if (s.reviewMode === 'google') {
        const g = parseGoogleReviewLink(s.googleReviewUrl || '');
        if (g.ok) return { mode: 'google', url: g.url };
    }
    return { mode: 'private', url: '' };
}
