/* -------------------------------------------------------------------------- */
/*  Company branding: logo and colours shown on the public booking page.      */
/*  Stored on the company record (logo, brandColor, brandAccent, tagline).    */
/* -------------------------------------------------------------------------- */

export interface Branding { logo?: string; primary: string; accent: string; tagline?: string }

export const DEFAULT_PRIMARY = '#0066cc';
export const DEFAULT_ACCENT = '#e8f1fb';
export const MAX_LOGO_CHARS = 250_000;     // keep in step with the 300000 limit in supabase/migrations/0007_store_branding.sql

export const PRESETS: { name: string; primary: string; accent: string }[] = [
    { name: 'Ocean', primary: '#0066cc', accent: '#e8f1fb' },
    { name: 'Emerald', primary: '#0f8a5f', accent: '#e4f5ee' },
    { name: 'Violet', primary: '#6d4aff', accent: '#efebff' },
    { name: 'Rose', primary: '#d6336c', accent: '#fdebf2' },
    { name: 'Sunset', primary: '#e8590c', accent: '#fff0e6' },
    { name: 'Gold', primary: '#b7791f', accent: '#fbf3e1' },
    { name: 'Teal', primary: '#0b7285', accent: '#e3f4f7' },
    { name: 'Graphite', primary: '#1d1d1f', accent: '#efeff1' },
];

export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

/** Accepts "#abc" or "abc" or "#aabbcc" and returns "#aabbcc", or '' when it is not a colour. */
export function normalizeHex(v: string): string {
    let s = (v || '').trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.split('').map(c => c + c).join('');
    return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s.toLowerCase()}` : '';
}

const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const toHex = (c: [number, number, number]) => `#${c.map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('')}`;

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
    const [r, g, b] = rgb(hex).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};
/** Text colour that reads best on top of this background. */
export const inkOn = (bg: string) => (contrast(bg, '#ffffff') >= contrast(bg, '#1d1d1f') ? '#ffffff' : '#1d1d1f');
/** Mix a colour towards another (t = 0 keeps a, t = 1 gives b). */
export const mix = (a: string, b: string, t: number) => { const x = rgb(a), y = rgb(b); return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]); };

/** True when the brand colour is too light to be seen on a white page (buttons would vanish). */
export const tooLight = (primary: string) => contrast(primary, '#ffffff') < 2;

/** CSS variables for the booking page. Anything invalid falls back to the default look. */
export function brandVars(b?: { primary?: string; accent?: string }): Record<string, string> {
    const primary = b?.primary && isHex(b.primary) ? b.primary.toLowerCase() : DEFAULT_PRIMARY;
    const accent = b?.accent && isHex(b.accent) ? b.accent.toLowerCase() : mix(primary, '#ffffff', 0.9);
    return {
        '--brand': primary,
        '--brand-ink': inkOn(primary),
        '--brand-hover': mix(primary, '#000000', 0.14),
        '--brand-soft': accent,
        '--brand-soft-ink': inkOn(accent) === '#ffffff' ? '#ffffff' : mix(primary, '#000000', 0.35),
        '--brand-ring': `${primary}33`,
    };
}

/**
 * Read an image file and return a small data URL for the logo. PNG keeps transparency; if that is still large
 * it falls back to WebP, then JPEG, so the company record stays light.
 */
export function resizeLogo(file: File, max = 320): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) return reject(new Error('Use a PNG, JPG or WebP image.'));
        if (file.size > 8 * 1024 * 1024) return reject(new Error('This image is too large (max 8 MB).'));
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not read this file.'));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('This file is not a valid image.'));
            img.onload = () => {
                const scale = Math.min(1, max / Math.max(img.width, img.height));
                const c = document.createElement('canvas');
                c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
                c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
                for (const [type, q] of [['image/png', undefined], ['image/webp', 0.85], ['image/jpeg', 0.8]] as const) {
                    const url = c.toDataURL(type, q);
                    if (url.startsWith(`data:${type}`) && url.length <= MAX_LOGO_CHARS) return resolve(url);
                }
                reject(new Error('This logo is too detailed. Try a simpler image.'));
            };
            img.src = String(reader.result);
        };
        reader.readAsDataURL(file);
    });
}
