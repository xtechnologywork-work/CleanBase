import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { isCloud, sb } from '../../services/backend';
import { useAuth } from '../../contexts/AuthContext';
import { brandVars } from '../../services/branding';
import { DRIVER_COMPANY_KEY, driverDigits, driverEmail } from '../../services/driverAccounts';
import { DRIVER_STRINGS } from '../../services/driverI18n';
import { useDriverLang } from '../../services/useDriverLang';
import { useAppViewport } from '../../services/useAppViewport';
import { localStoreData } from '../../services/store';
import type { StoreCompany } from '../../services/store';
import { StoreHeader } from '../../components/store/StoreHeader';
import '../../store.css';

type Status = 'loading' | 'ok' | 'bad';

/** A phone field only holds a phone number: if the browser's autofill puts an email or any text in it, it is emptied. */
const cleanPhone = (v: string) => (/[^\d\s+().-]/.test(v) ? '' : v);

/** The sign in page of ONE company's drivers: ?c=<company id>. It shows that company's logo and colours. */
const DriverLoginForm: React.FC = () => {
    const [params] = useSearchParams();
    const company = params.get('c') || '';
    const navigate = useNavigate();
    const { login, logout, user, isAuthenticated } = useAuth();
    const [lang, toggleLang] = useDriverLang();
    useAppViewport();
    const T = DRIVER_STRINGS[lang];
    const ar = lang === 'ar';

    // The company's name, logo and colours (public, no sign in). If the look is not available the page keeps the default one.
    const [brand, setBrand] = useState<StoreCompany | null>(null);
    const [status, setStatus] = useState<Status>(company ? 'loading' : 'bad');
    useEffect(() => {
        if (!company) return;
        let alive = true;
        if (!isCloud) {
            const local = localStoreData(company)?.company || null;
            Promise.resolve().then(() => { if (!alive) return; setBrand(local); setStatus(local ? 'ok' : 'bad'); });
            return () => { alive = false; };
        }
        void sb().rpc('public_brand', { p_company: company }).then(({ data, error }) => {
            if (!alive) return;
            if (error) { setStatus('ok'); return; }                      // look not available yet: do not block the driver
            setBrand((data as StoreCompany) || null);
            setStatus(data ? 'ok' : 'bad');
        });
        return () => { alive = false; };
    }, [company]);
    const vars = useMemo(() => brandVars({ primary: brand?.primaryColor, accent: brand?.accentColor }), [brand]) as React.CSSProperties;
    useEffect(() => { document.title = `${brand?.name ? `${brand.name} | ` : ''}${T.loginTitle}`; }, [brand?.name, T.loginTitle]);
    useEffect(() => { document.documentElement.lang = lang; return () => { document.documentElement.lang = 'en'; }; }, [lang]);

    // Already signed in as a driver of this company: go straight to the app
    useEffect(() => {
        if (isAuthenticated && user?.role === 'driver' && user.status === 'active' && (!company || user.companyId === company)) navigate('/driver', { replace: true });
    }, [isAuthenticated, user, company, navigate]);

    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    // +974 is already in front, so a local driver types only the 8 digits. A number typed with + (or with more digits) is used as it is.
    const international = phone.trim().startsWith('+') || phone.replace(/\D/g, '').length > 8;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        if (!driverDigits(phone)) { setError(T.badPhone); return; }
        setBusy(true); setError('');
        const r = await login(driverEmail(company, phone), password);
        if (!r.user) { setBusy(false); setError(!r.error || /wrong email or password/i.test(r.error) ? T.wrongLogin : r.error); return; }
        // This page is for the drivers of this company only
        if (r.user.role !== 'driver') { logout(); setBusy(false); setError(T.notDriver); return; }
        if (r.user.companyId !== company) { logout(); setBusy(false); setError(T.wrongCompany); return; }
        if (r.user.status !== 'active') { logout(); setBusy(false); setError(T.inactive); return; }
        try { localStorage.setItem(DRIVER_COMPANY_KEY, company); } catch { /* storage blocked */ }
        setBusy(false);
        navigate('/driver', { replace: true });
    };

    const name = brand?.name || T.loginTitle;
    const lockedDriver = isAuthenticated && user?.role === 'driver' && user.status === 'locked';

    return (
        <div className="st" style={vars} dir={ar ? 'rtl' : 'ltr'} lang={lang}>
            <StoreHeader name={name} logo={brand?.logo} tagline={T.loginTagline} langButton={T.langButton} langOf={ar ? 'en' : 'ar'} onLang={toggleLang} />
            <main className="st-main">
                {status === 'loading' ? (
                    <div className="st-panel st-center st-muted">{T.loading}</div>
                ) : status === 'bad' ? (
                    <div className="st-panel st-center"><h1>{T.loginTitle}</h1><p className="st-lead">{company ? T.badLink : T.needLink}</p></div>
                ) : (
                    <>
                        <div><h1>{T.loginTitle}</h1><p className="st-lead">{T.loginLead}</p></div>
                        <form className="st-panel st-form" onSubmit={submit}>
                            {lockedDriver && <p className="st-err" role="alert">{T.inactive}</p>}
                            <label htmlFor="drv-phone">{T.phoneLabel}
                                <span className="pt-phone" dir="ltr">
                                    {!international && <span className="pt-prefix" aria-hidden="true">+974</span>}
                                    <input id="drv-phone" type="tel" inputMode="tel" name="driver-phone" autoComplete="tel-national" required value={phone}
                                        style={{ paddingInlineStart: international ? 14 : 78, textAlign: 'left' }}
                                        placeholder={international ? '+44 7911 123456' : '5512 3456'}
                                        onChange={e => { setPhone(cleanPhone(e.target.value)); setError(''); }} />
                                </span>
                            </label>
                            <span className="st-muted">{T.phoneHint}</span>
                            <label htmlFor="drv-password">{T.passwordLabel}
                                <input id="drv-password" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password}
                                    onChange={e => { setPassword(e.target.value); setError(''); }} />
                            </label>
                            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8, fontWeight: 500 }}>
                                <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> {T.showPassword}
                            </label>
                            {error && <p className="st-err" role="alert">{error}</p>}
                            <button type="submit" className="st-btn" disabled={busy}>{busy ? T.signingIn : T.signIn}</button>
                        </form>
                        <p className="st-muted" style={{ margin: 0 }}>{T.forgot}</p>
                    </>
                )}
            </main>
        </div>
    );
};

/** Keyed by company, so opening another company's link always starts clean. */
export const DriverLogin: React.FC = () => {
    const [params] = useSearchParams();
    return <DriverLoginForm key={params.get('c') || ''} />;
};
