import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Lock } from 'lucide-react';
import { Brand } from '../components/shared/Brand';
import '../auth.css';

export const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const { login, user, isAuthenticated } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    React.useEffect(() => {
        if (isAuthenticated && user) navigate(user.role === 'superadmin' ? '/admin/overview' : user.role === 'driver' ? '/driver' : '/app', { replace: true });
    }, [isAuthenticated, user, navigate]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true); setError('');
        const r = await login(email, password);
        setBusy(false);
        if (r.user) navigate(r.user.role === 'superadmin' ? '/admin/overview' : r.user.role === 'driver' ? '/driver' : '/app');
        else setError(r.error || 'Could not sign in. Try again.');
    };

    return (
        <div className="auth">
            <div className="auth-top">
                <Link to="/" aria-label="CleanBase home"><Brand size={20} /></Link>
            </div>
            <main className="auth-main">
                <div className="auth-card">
                    <h1>Welcome back</h1>
                    <p className="auth-sub">Enter your details to access your dashboard.</p>

                    <form className="auth-form" onSubmit={handleLogin}>
                        {error && <div className="auth-msg is-error" role="alert">{error}</div>}
                        <div className="auth-field">
                            <label htmlFor="login-email">Email address</label>
                            <div className="auth-input">
                                <Mail size={18} aria-hidden="true" />
                                <input id="login-email" type="email" placeholder="owner@company.com" autoComplete="email"
                                    value={email} onChange={e => { setEmail(e.target.value); setError(''); }} required />
                            </div>
                        </div>

                        <div className="auth-field">
                            <label htmlFor="login-password">Password</label>
                            <div className="auth-input">
                                <Lock size={18} aria-hidden="true" />
                                <input id="login-password" type="password" placeholder="Your password" autoComplete="current-password"
                                    value={password} onChange={e => { setPassword(e.target.value); setError(''); }} required />
                            </div>
                        </div>

                        <div className="auth-aside">
                            <Link to="/forgot-password" state={{ email: email.trim() }}>Forgot password?</Link>
                        </div>

                        <button type="submit" className="lp-btn lp-btn-primary auth-submit" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
                    </form>

                    <p className="auth-switch">
                        Don't have an account? <Link to="/register">Create an account</Link>
                    </p>
                </div>
            </main>
        </div>
    );
};
