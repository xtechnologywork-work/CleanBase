import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarPlus, RotateCcw } from 'lucide-react';
import { sb } from '../../services/backend';
import { brandVars } from '../../services/branding';
import { formatDate, formatTime } from '../../services/bookingMessages';
import { PORTAL, STRINGS } from '../../services/storeI18n';
import { useStoreLang } from '../../services/useStoreLang';
import { useAppViewport } from '../../services/useAppViewport';
import { StoreHeader } from '../../components/store/StoreHeader';
import type { StoreCompany } from '../../services/store';
import '../../store.css';

interface PortalBooking { id: string; date: string; time: string; status: string; paymentStatus: string; price: number; service: string | null }
interface PortalData { client: { name: string; phone: string; address: string }; bookings: PortalBooking[] }

const STATUS_TONE: Record<string, string> = { pending: 'warn', confirmed: 'info', in_progress: 'info', completed: 'good', cancelled: 'off' };
const PAY_TONE: Record<string, string> = { paid: 'good', unpaid: 'off', overdue: 'bad' };

/** Client portal: a customer looks up their bookings with the phone number they booked with. Shows the company's own logo and colours. */
export const CloudPortal: React.FC = () => {
    const [params] = useSearchParams();
    const company = params.get('c') || '';
    const [lang, switchLang] = useStoreLang();
    useAppViewport();
    const rtl = lang === 'ar';
    const t = PORTAL[lang];
    const s = STRINGS[lang];

    const [brand, setBrand] = useState<StoreCompany | null>(null);
    const [phone, setPhone] = useState('');
    const [data, setData] = useState<PortalData | null>(null);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);

    // The company's name, logo and colours (public, no login). If this is not available yet the page keeps the default look.
    useEffect(() => {
        if (!company) return;
        let alive = true;
        void sb().rpc('public_brand', { p_company: company }).then(({ data: d }) => { if (alive && d) setBrand(d as StoreCompany); });
        return () => { alive = false; };
    }, [company]);
    const vars = useMemo(() => brandVars({ primary: brand?.primaryColor, accent: brand?.accentColor }), [brand]) as React.CSSProperties;
    useEffect(() => { document.title = `${brand?.name ? `${brand.name} | ` : ''}${t.title}`; }, [brand?.name, t.title]);
    useEffect(() => { document.documentElement.lang = lang; return () => { document.documentElement.lang = 'en'; }; }, [lang]);

    // +974 is already in front, so a local client types only the 8 digits. A number typed with + (or with more digits) is used as it is.
    const international = phone.trim().startsWith('+');
    const fullPhone = () => {
        const digits = phone.replace(/\D/g, '').replace(/^00/, '');
        return international || digits.length > 8 ? `+${digits}` : `+974${digits}`;
    };

    const lookup = async (e: React.FormEvent) => {
        e.preventDefault();
        const full = fullPhone();
        if (full.replace(/\D/g, '').length < 9) { setMessage(t.enter8); return; }
        setBusy(true); setMessage('');
        const { data: res, error } = await sb().rpc('portal_lookup', { p_company: company, p_phone: full });
        setBusy(false);
        if (error) { setMessage(t.failed); return; }
        if (!res) { setMessage(t.notFound); return; }
        setData(res as PortalData);
    };

    const name = brand?.name || t.title;
    const bookLink = `/book?c=${encodeURIComponent(company)}`;

    return (
        <div className="st" style={vars} dir={rtl ? 'rtl' : 'ltr'} lang={lang}>
            <StoreHeader name={name} logo={brand?.logo} tagline={brand?.tagline || s.tagline} langButton={s.langButton} langOf={rtl ? 'en' : 'ar'} onLang={switchLang} />
            <main className="st-main">
                {!company ? (
                    <div className="st-panel st-center"><h1>{t.title}</h1><p className="st-lead">{t.needLink}</p></div>
                ) : !data ? (
                    <>
                        <div><h1>{t.title}</h1><p className="st-lead">{t.lead}</p></div>
                        <form className="st-panel st-form" onSubmit={lookup}>
                            <label htmlFor="portal-phone">{t.phoneLabel}
                                <span className="pt-phone" dir="ltr">
                                    {!international && <span className="pt-prefix" aria-hidden="true">+974</span>}
                                    <input id="portal-phone" type="tel" inputMode="tel" autoComplete="tel-national" required value={phone}
                                        style={{ paddingInlineStart: international ? 14 : 78 }}
                                        placeholder={international ? '+44 7911 123456' : '5555 0000'}
                                        onChange={e => { setPhone(e.target.value); setMessage(''); }} />
                                </span>
                            </label>
                            <span className="st-muted">{t.phoneHint}</span>
                            {message && <p className="st-err" role="alert">{message}</p>}
                            <button type="submit" className="st-btn" disabled={busy}>{busy ? t.looking : t.show}</button>
                        </form>
                    </>
                ) : (
                    <>
                        <div><h1>{t.title}</h1><p className="st-lead"><bdi>{data.client.name}</bdi></p></div>
                        {data.bookings.length === 0 ? (
                            <div className="st-panel st-center st-muted">{t.noBookings}</div>
                        ) : (
                            <div className="pt-list">
                                {data.bookings.map(b => (
                                    <div key={b.id} className="st-panel pt-row">
                                        <div className="pt-main">
                                            <b><bdi>{b.service || t.service}</bdi></b>
                                            <span className="st-muted">{formatDate(b.date, rtl)}{rtl ? '، ' : ' · '}<bdi dir="ltr">{formatTime(b.time, rtl)}</bdi></span>
                                        </div>
                                        <div className="pt-side">
                                            <b>{Number(b.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {t.currency}</b>
                                            <span className="pt-chips">
                                                <span className={`pt-chip ${STATUS_TONE[b.status] || 'off'}`}>{t.status[b.status] || b.status.replace('_', ' ')}</span>
                                                <span className={`pt-chip ${PAY_TONE[b.paymentStatus] || 'off'}`}>{t.payment[b.paymentStatus] || b.paymentStatus}</span>
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <p className="st-muted" style={{ margin: 0 }}>{t.payNote}</p>
                        <div className="st-bar">
                            <button type="button" className="st-btn ghost" onClick={() => { setData(null); setPhone(''); }}><RotateCcw size={15} style={{ verticalAlign: '-2px' }} /> {t.otherNumber}</button>
                            <Link to={bookLink} className="st-btn" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}><CalendarPlus size={16} /> {t.bookAgain}</Link>
                        </div>
                    </>
                )}
            </main>
            <footer className="st-foot">{s.footer}</footer>
        </div>
    );
};
