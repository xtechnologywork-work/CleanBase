import { useCallback, useState } from 'react';
import { initialDriverLang, saveDriverLang } from './driverI18n';
import type { DriverLang } from './driverI18n';

/** The driver's language: the saved choice, then the phone's language. The button flips it and remembers it. */
export function useDriverLang(): [DriverLang, () => void] {
    const [lang, setLang] = useState<DriverLang>(() => initialDriverLang());
    const toggle = useCallback(() => { setLang(cur => { const n: DriverLang = cur === 'ar' ? 'en' : 'ar'; saveDriverLang(n); return n; }); }, []);
    return [lang, toggle];
}
