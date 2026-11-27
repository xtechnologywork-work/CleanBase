import React from 'react';
import { Languages } from 'lucide-react';

export interface HeaderChip { icon: React.ReactNode; text: string }
interface Props { name: string; logo?: string; tagline: string; langButton: string; langOf: 'ar' | 'en'; onLang: () => void; chips?: HeaderChip[] }

/**
 * Header of the public pages: the company's logo, name and tagline, the language button and a few facts about booking.
 * It is always dark with white text, so it reads well with any company colours (the CSS variables come from the page).
 */
export const StoreHeader: React.FC<Props> = ({ name, logo, tagline, langButton, langOf, onLang, chips }) => (
    <header className="st-hero">
        <div className="st-hero-in">
            <div className="st-brandbar">
                <span className="st-logo">{logo ? <img src={logo} alt="" /> : <b>{(name || 'B').charAt(0).toUpperCase()}</b>}</span>
                <div className="st-co"><bdi>{name}</bdi><small>{tagline}</small></div>
                <button type="button" className="st-lang" onClick={onLang} lang={langOf}><Languages size={16} aria-hidden="true" /> <span>{langButton}</span></button>
            </div>
            {chips && chips.length > 0 && (
                <ul className="st-chips">
                    {chips.map(c => <li key={c.text}><span aria-hidden="true">{c.icon}</span>{c.text}</li>)}
                </ul>
            )}
        </div>
    </header>
);
