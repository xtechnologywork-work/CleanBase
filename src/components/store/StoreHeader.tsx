import React from 'react';
import { Languages } from 'lucide-react';

interface Props { name: string; logo?: string; tagline: string; langButton: string; langOf: 'ar' | 'en'; onLang: () => void }

/** Header of the public pages: the company's logo, name and tagline, and the language button. Colours come from the CSS variables set by the page. */
export const StoreHeader: React.FC<Props> = ({ name, logo, tagline, langButton, langOf, onLang }) => (
    <header className="st-top">
        <div className="st-top-in">
            <span className="st-logo">{logo ? <img src={logo} alt="" /> : <b>{(name || 'B').charAt(0).toUpperCase()}</b>}</span>
            <div className="st-co"><bdi>{name}</bdi><small>{tagline}</small></div>
            <button type="button" className="st-lang" onClick={onLang} lang={langOf}><Languages size={15} /> {langButton}</button>
        </div>
    </header>
);
