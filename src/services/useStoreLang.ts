import { useCallback, useState } from 'react';
import { initialLang, saveLang } from './storeI18n';
import type { Lang } from './storeI18n';

/** The visitor's language on the public pages (booking page, client portal): saved choice, then ?lang=, then the browser language. */
export function useStoreLang(): [Lang, () => void] {
    const [lang, setLang] = useState<Lang>(() => initialLang(window.location.search));
    const toggle = useCallback(() => { setLang(cur => { const n: Lang = cur === 'ar' ? 'en' : 'ar'; saveLang(n); return n; }); }, []);
    return [lang, toggle];
}
