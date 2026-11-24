import React from 'react';
import { Languages } from 'lucide-react';
import { useDashLang } from '../../services/dashLang';

/** The button that switches the dashboard between English and Arabic. It always shows the language you would switch to. */
export const DashLangButton: React.FC = () => {
    const [lang, toggle] = useDashLang();
    return (
        <button type="button" className="app-lang-btn" onClick={toggle} lang={lang === 'ar' ? 'en' : 'ar'} data-no-translate
            aria-label={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}>
            <Languages size={15} /> <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
        </button>
    );
};
