import { useEffect } from 'react';
import { useDashLang } from '../../services/dashLang';
import { startTranslating } from '../../services/dashTranslate';

/**
 * Turns the dashboard Arabic while the language is set to Arabic: right-to-left page, and everything on screen translated.
 * Mount it once, inside the dashboard layout. It undoes everything when the language goes back to English or the dashboard closes.
 */
export function useDashArabic() {
    const [lang] = useDashLang();
    useEffect(() => {
        if (lang !== 'ar') return;
        const root = document.documentElement;
        let stopFn: (() => void) | undefined;
        let cancelled = false;
        root.dir = 'rtl'; root.lang = 'ar'; root.classList.add('dash-ar');
        // The Arabic dictionary is large, so English users never download it
        void import('../../i18n/ar').then(m => {
            if (cancelled) return;
            m.installArabic();
            stopFn = startTranslating();
        });
        return () => {
            cancelled = true;
            stopFn?.();
            root.dir = 'ltr'; root.lang = 'en'; root.classList.remove('dash-ar');
        };
    }, [lang]);
}
