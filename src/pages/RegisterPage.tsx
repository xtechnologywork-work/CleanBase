import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Building, CalendarCheck, Check, Eye, EyeOff, Lock, Mail, Phone, ShieldCheck, User as UserIcon, Users, Wallet } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Brand } from '../components/shared/Brand';
import '../auth.css';
import { isCloud } from '../services/backend';
import { COUNTRY_CODE, formatLocal, fullPhone, localDigits } from '../services/phone';

/** 0 to 4: how hard the password is to guess. Only the 8 character minimum is enforced; this is guidance. */
function strength(p: string): number {
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8) s++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
    if (/\d/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p) || p.length >= 14) s++;
    return Math.max(p.length >= 8 ? 1 : 0, s);
}
const STRENGTH_LABEL = ['', 'Weak', 'Fair', 'Good', 'Strong'];

const POINTS = [
    { icon: <CalendarCheck size={18} />, title: 'Bookings and dispatch', text: 'One calendar for every job, cleaner and route.' },
    { icon: <Users size={18} />, title: 'Clients and team', text: 'Contracts, documents, attendance and payroll in one place.' },
    { icon: <Wallet size={18} />, title: 'Invoices and reports', text: 'Know what you earned, what is unpaid and what is next.' },
];

export const RegisterPage: React.FC = () => {
    const navigate = useNavigate();
    const { register } = useAuth();

    const [fullName, setFullName] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [invited, setInvited] = useState(false);          // online only: a team member joining a company that invited them
    const [phone, setPhone] = useState('');                // the 8 local digits; the country code is fixed
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const score = useMemo(() => strength(password), [password]);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        if (!invited && !fullPhone(phone)) { setError('Enter your contact number: the 8 digits after ' + COUNTRY_CODE + '.'); return; }
        setBusy(true); setError(''); setNotice('');
        // The plan is agreed with the CleanBase team after approval, so every account starts on the same one.
        const r = await register(email, invited ? '' : companyName, 'pro', password, fullName, invited ? '' : phone);
        setBusy(false);
        if (r.ok) navigate('/app');              // a company waiting for approval is sent on to the "under review" screen
        else if (r.notice) setNotice(r.notice);
        else setError(r.error || 'Could not create the account. Try again.');
    };

    const top = (
        <div className="auth-top"><Link to="/" aria-label="CleanBase home"><Brand size={20} /></Link></div>
    );

    if (notice) {
        return (
            <div className="auth">
                {top}
                <main className="auth-main">
                    <div className="auth-card">
                        <h1>Check your email</h1>
                        <div className="auth-msg is-ok" role="status" style={{ marginTop: 18 }}>{notice}</div>
                        <p className="auth-hint" style={{ marginTop: 14 }}>No email after a few minutes? Look in your spam folder.</p>
                        <div className="auth-actions">
                            <Link to="/login" className="lp-btn lp-btn-primary">Go to sign in</Link>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="reg">
            <aside className="reg-side" aria-label="About CleanBase">
                <Link to="/" className="reg-side-brand" aria-label="CleanBase home"><Brand size={22} /></Link>
                <div className="reg-side-body">
                    <h2>Run your cleaning company from one place.</h2>
                    <p>Bookings, cleaners, clients, invoices and reports, built for cleaning companies.</p>
                    <ul className="reg-points">
                        {POINTS.map(p => (
                            <li key={p.title}>
                                <span className="reg-point-icon" aria-hidden="true">{p.icon}</span>
                                <span><b>{p.title}</b>{p.text}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <ol className="reg-steps" aria-label="What happens after you sign up">
                    <li><i>1</i><span>Create your account</span></li>
                    <li><i>2</i><span>Our team reviews your company</span></li>
                    <li><i>3</i><span>You get access to your workspace</span></li>
                </ol>
            </aside>

            <main className="reg-main">
                <div className="reg-mobile-brand"><Link to="/" aria-label="CleanBase home"><Brand size={20} /></Link></div>
                <div className="reg-card">
                    <h1>Create your account</h1>
                    <p className="auth-sub">Tell us about you and your company. Our team reviews every new account before it is opened.</p>

                    <form className="auth-form" onSubmit={handleRegister} onChange={() => setError('')} noValidate={false}>
                        {error && <div className="auth-msg is-error" role="alert">{error}</div>}

                        <div className="auth-field">
                            <label htmlFor="reg-name">Your full name</label>
                            <div className="auth-input">
                                <UserIcon size={18} aria-hidden="true" />
                                <input id="reg-name" type="text" placeholder="e.g. Sara Al Thani" autoComplete="name" value={fullName}
                                    onChange={e => setFullName(e.target.value)} minLength={2} maxLength={80} required />
                            </div>
                        </div>

                        {!invited && (
                            <div className="auth-field">
                                <label htmlFor="reg-company">Company name</label>
                                <div className="auth-input">
                                    <Building size={18} aria-hidden="true" />
                                    <input id="reg-company" type="text" placeholder="e.g. Sparkle Cleaners" autoComplete="organization" value={companyName}
                                        onChange={e => setCompanyName(e.target.value)} minLength={2} maxLength={120} required />
                                </div>
                            </div>
                        )}

                        {!invited && (
                            <div className="auth-field">
                                <label htmlFor="reg-phone">Contact number</label>
                                <div className="auth-input auth-phone">
                                    <Phone size={18} aria-hidden="true" />
                                    <span className="auth-cc" aria-hidden="true">{COUNTRY_CODE}</span>
                                    <input id="reg-phone" type="tel" inputMode="numeric" placeholder="5555 1234" autoComplete="tel-national" value={formatLocal(phone)}
                                        onChange={e => setPhone(localDigits(e.target.value))} pattern="\d{4} \d{4}" title="8 digits, for example 5555 1234"
                                        aria-label={`Contact number, after ${COUNTRY_CODE}`} aria-describedby="reg-phone-hint" required />
                                </div>
                                <span id="reg-phone-hint" className="auth-hint">We use it only to reach you about your account.</span>
                            </div>
                        )}

                        <div className="auth-field">
                            <label htmlFor="reg-email">Work email</label>
                            <div className="auth-input">
                                <Mail size={18} aria-hidden="true" />
                                <input id="reg-email" type="email" placeholder="you@company.com" autoComplete="email" value={email}
                                    onChange={e => setEmail(e.target.value)} required />
                            </div>
                        </div>

                        <div className="auth-field">
                            <label htmlFor="reg-password">Password</label>
                            <div className="auth-input">
                                <Lock size={18} aria-hidden="true" />
                                <input id="reg-password" type={show ? 'text' : 'password'} placeholder="At least 8 characters" autoComplete="new-password" value={password}
                                    onChange={e => setPassword(e.target.value)} minLength={8} maxLength={72} required aria-describedby="reg-pw-hint" />
                                <button type="button" className="auth-eye" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
                                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            <div className="auth-meter" aria-hidden="true">
                                {[1, 2, 3, 4].map(i => <span key={i} className={score >= i ? `on s${score}` : ''} />)}
                            </div>
                            <span id="reg-pw-hint" className="auth-hint" aria-live="polite">
                                {password ? `Password strength: ${STRENGTH_LABEL[score] || 'Too short'}` : 'Use a mix of letters, numbers and symbols.'}
                            </span>
                        </div>

                        <button type="submit" className="lp-btn lp-btn-primary auth-submit" disabled={busy}>
                            {busy ? 'Creating your account...' : <>Create account <ArrowRight size={18} aria-hidden="true" /></>}
                        </button>

                        <p className="reg-secure"><ShieldCheck size={15} aria-hidden="true" /> Your account opens once our team has approved it.</p>
                        <p className="reg-terms">By creating an account you agree to our <Link to="/terms" target="_blank">Terms</Link> and <Link to="/privacy" target="_blank">Privacy Policy</Link>.</p>

                        {isCloud && (
                            <button type="button" className="reg-link" onClick={() => setInvited(v => !v)}>
                                {invited ? <><Check size={14} aria-hidden="true" /> Joining a company that invited me (tap to undo)</> : 'My company invited me to join'}
                            </button>
                        )}
                    </form>

                    <p className="auth-switch">
                        Already have an account? <Link to="/login">Sign in</Link>
                    </p>
                </div>
            </main>
        </div>
    );
};
