import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Lock, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Brand } from '../components/shared/Brand';
import { isCloud, sb } from '../services/backend';
import '../auth.css';

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="auth">
        <div className="auth-top"><Link to="/" aria-label="CleanBase home"><Brand size={20} /></Link></div>
        <main className="auth-main"><div className="auth-card">{children}</div></main>
    </div>
);

/** Ask for a link to choose a new password. */
export const ForgotPasswordPage: React.FC = () => {
    const { requestPasswordReset } = useAuth();
    const location = useLocation();
    const [email, setEmail] = useState(() => ((location.state as { email?: string } | null)?.email || ''));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [sent, setSent] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true); setError('');
        const r = await requestPasswordReset(email);
        setBusy(false);
        if (r.error) setError(r.error); else setSent(true);
    };

    if (sent) {
        return (
            <Shell>
                <h1>Check your email</h1>
                <div className="auth-msg is-ok" role="status" style={{ marginTop: 18 }}>
                    If an account exists for {email.trim()}, we sent it a link to choose a new password. The link works once and expires after one hour.
                </div>
                <p className="auth-hint" style={{ marginTop: 14 }}>No email after a few minutes? Look in your spam folder, or try again.</p>
                <div className="auth-actions">
                    <Link to="/login" className="lp-btn lp-btn-primary">Back to sign in</Link>
                    <button type="button" className="lp-btn lp-btn-quiet" onClick={() => setSent(false)}>Send it again</button>
                </div>
            </Shell>
        );
    }

    return (
        <Shell>
            <h1>Forgot your password?</h1>
            <p className="auth-sub">Enter the email of your account. We send you a link to choose a new password.</p>
            <form className="auth-form" onSubmit={submit}>
                {error && <div className="auth-msg is-error" role="alert">{error}</div>}
                {!isCloud && <div className="auth-msg is-error">This works in the online version only. Ask your company admin to set a new password for you.</div>}
                <div className="auth-field">
                    <label htmlFor="reset-email">Email address</label>
                    <div className="auth-input">
                        <Mail size={18} aria-hidden="true" />
                        <input id="reset-email" type="email" autoComplete="email" placeholder="owner@company.com" value={email}
                            onChange={e => { setEmail(e.target.value); setError(''); }} required />
                    </div>
                </div>
                <button type="submit" className="lp-btn lp-btn-primary auth-submit" disabled={busy || !isCloud}>{busy ? 'Sending...' : 'Send me a link'}</button>
            </form>
            <p className="auth-switch">Remembered it? <Link to="/login">Sign in</Link></p>
        </Shell>
    );
};

type Stage = 'checking' | 'ready' | 'invalid' | 'done';

/** The page the email link opens: choose the new password. */
export const ResetPasswordPage: React.FC = () => {
    const navigate = useNavigate();
    const { refreshUser } = useAuth();
    const [stage, setStage] = useState<Stage>(() => {
        if (!isCloud) return 'invalid';
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const query = new URLSearchParams(window.location.search);
        return hash.get('error') || query.get('error') ? 'invalid' : 'checking';
    });
    const [password, setPassword] = useState('');
    const [again, setAgain] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (stage !== 'checking') return;
        let alive = true;
        // The Supabase client reads the link and opens a short session; wait for it
        const client = sb();
        void client.auth.getSession().then(({ data }) => { if (alive) setStage(data.session ? 'ready' : 'invalid'); });
        const { data: sub } = client.auth.onAuthStateChange((event, session) => {
            if (alive && session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) setStage('ready');
        });
        return () => { alive = false; sub.subscription.unsubscribe(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        if (password.length < 8) { setError('Choose a password with at least 8 characters.'); return; }
        if (password !== again) { setError('The two passwords are not the same.'); return; }
        setBusy(true); setError('');
        const { error: err } = await sb().auth.updateUser({ password });
        setBusy(false);
        if (err) { setError(/different from the old/i.test(err.message) ? 'Choose a password different from your old one.' : err.message); return; }
        // Clean the one-time link out of the address bar
        window.history.replaceState(null, '', '/reset-password');
        await refreshUser();
        setStage('done');
    };

    if (stage === 'checking') return <Shell><h1>One moment</h1><p className="auth-sub">Checking your link...</p></Shell>;

    if (stage === 'invalid') {
        return (
            <Shell>
                <h1>This link does not work</h1>
                <p className="auth-sub">It was already used or it expired. Ask for a new one: it only takes a minute.</p>
                <div className="auth-actions">
                    <Link to="/forgot-password" className="lp-btn lp-btn-primary">Send me a new link</Link>
                    <Link to="/login" className="lp-btn lp-btn-quiet">Back to sign in</Link>
                </div>
            </Shell>
        );
    }

    if (stage === 'done') {
        return (
            <Shell>
                <h1>Password changed</h1>
                <div className="auth-msg is-ok" role="status" style={{ marginTop: 18 }}>Your new password is saved. Use it the next time you sign in.</div>
                <div className="auth-actions">
                    <button type="button" className="lp-btn lp-btn-primary" onClick={() => navigate('/app', { replace: true })}>Open my dashboard</button>
                </div>
            </Shell>
        );
    }

    return (
        <Shell>
            <h1>Choose a new password</h1>
            <p className="auth-sub">At least 8 characters. Use something you do not use on other websites.</p>
            <form className="auth-form" onSubmit={submit}>
                {error && <div className="auth-msg is-error" role="alert">{error}</div>}
                <div className="auth-field">
                    <label htmlFor="new-password">New password</label>
                    <div className="auth-input">
                        <Lock size={18} aria-hidden="true" />
                        <input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={password}
                            onChange={e => { setPassword(e.target.value); setError(''); }} required />
                    </div>
                </div>
                <div className="auth-field">
                    <label htmlFor="new-password-2">Type it again</label>
                    <div className="auth-input">
                        <Lock size={18} aria-hidden="true" />
                        <input id="new-password-2" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={again}
                            onChange={e => { setAgain(e.target.value); setError(''); }} required />
                    </div>
                </div>
                <button type="submit" className="lp-btn lp-btn-primary auth-submit" disabled={busy}>{busy ? 'Saving...' : 'Save new password'}</button>
            </form>
        </Shell>
    );
};
