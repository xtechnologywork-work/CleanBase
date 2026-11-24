import { useSyncExternalStore } from 'react';

/** The language of the company dashboard: English (default) or Arabic. Remembered on this device. */
export type DashLang = 'en' | 'ar';
const KEY = 'cb_dash_lang';

const read = (): DashLang => {
    try { return localStorage.getItem(KEY) === 'ar' ? 'ar' : 'en'; } catch { return 'en'; }
};

let current: DashLang = read();
const listeners = new Set<() => void>();

export const getDashLang = (): DashLang => current;

export function setDashLang(lang: DashLang) {
    if (lang === current) return;
    current = lang;
    try { localStorage.setItem(KEY, lang); } catch { /* storage blocked: the choice lasts until the page closes */ }
    listeners.forEach(l => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** [language, switch to the other language] */
export function useDashLang(): [DashLang, () => void] {
    const lang = useSyncExternalStore(subscribe, getDashLang, () => 'en' as DashLang);
    return [lang, () => setDashLang(lang === 'ar' ? 'en' : 'ar')];
}

// Opening the dashboard directly in Arabic: set the direction before the first paint so nothing jumps or slides
if (current === 'ar' && typeof document !== 'undefined' && location.pathname.startsWith('/app')) {
    const root = document.documentElement;
    root.dir = 'rtl'; root.lang = 'ar'; root.classList.add('dash-ar');
}
