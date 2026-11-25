import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Check, Hourglass, LogOut, MessageCircle, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Brand } from '../components/shared/Brand';
import '../auth.css';

const CHECK_EVERY_MS = 15000;

/** Shown to a new company until the CleanBase team approves it. It checks by itself, so approval opens the workspace without a click. */
export const LockedPage: React.FC = () => {
    const { user, logout, refreshUser } = useAuth();
    const navigate = useNavigate();
    const [isChecking, setIsChecking] = useState(false);
    const [stillWaiting, setStillWaiting] = useState(false);     // the person asked and the answer was "not yet"
    const busy = useRef(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const check = useCallback(async (manual: boolean) => {
        if (busy.current) return;
        busy.current = true;
        if (manual) { setIsChecking(true); setStillWaiting(false); }
        try {
            const fresh = await refreshUser();
            if (fresh && fresh.status === 'active') navigate('/app', { replace: true });
            else if (manual) setStillWaiting(true);
        } finally {
            busy.current = false;
            if (manual) setIsChecking(false);
        }
    }, [refreshUser, navigate]);

    // Look again now and then, and whenever the person comes back to this tab
    useEffect(() => {
        const tick = () => { if (document.visibilityState === 'visible') void check(false); };
        const id = window.setInterval(tick, CHECK_EVERY_MS);
        document.addEventListener('visibilitychange', tick);
        return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', tick); };
    }, [check]);

    const handleWhatsApp = () => {
        const text = encodeURIComponent(`Hello CleanBase Team, I just registered my cleaning business (${user?.name} - ${user?.email}) and would like to verify and activate my workspace.`);
        window.open(`https://wa.me/97472262228?text=${text}`, '_blank', 'noopener,noreferrer');
    };

    const first = (user?.name || '').split(' ')[0];

    return (
        <div className="auth">
            <div className="auth-top">
                <Brand size={20} />
            </div>
            <main className="auth-main">
                <div className="auth-card rev-card">
                    <div className="rev-badge" aria-hidden="true"><Hourglass size={28} /></div>
                    <h1>Your account is under review</h1>
                    <p className="auth-sub">
                        Thank you{first ? `, ${first}` : ''}. Our team is reviewing your company. As soon as it is approved, your workspace opens here by itself.
                    </p>
                    {user?.email && <span className="rev-mail">{user.email}</span>}

                    <ol className="rev-steps" aria-label="Progress">
                        <li className="done">
                            <span className="rev-dot" aria-hidden="true"><Check size={15} /></span>
                            <span><b>Account created</b><small>Your details are saved.</small></span>
                        </li>
                        <li className="now" aria-current="step">
                            <span className="rev-dot" aria-hidden="true">2</span>
                            <span><b>Review by our team</b><small>We check your company before opening it.</small></span>
                        </li>
                        <li>
                            <span className="rev-dot" aria-hidden="true">3</span>
                            <span><b>Your workspace opens</b><small>Sign in any time. You can leave this page open or come back later.</small></span>
                        </li>
                    </ol>

                    <div className="auth-actions">
                        <button type="button" onClick={handleWhatsApp} className="lp-btn lp-btn-primary">
                            <MessageCircle size={20} aria-hidden="true" /> Talk to our team on WhatsApp
                        </button>
                        <button type="button" onClick={() => void check(true)} disabled={isChecking} className="lp-btn lp-btn-ghost">
                            <RefreshCw size={16} aria-hidden="true" className={isChecking ? 'spin' : ''} />
                            {isChecking ? 'Checking...' : 'Check my status'}
                        </button>
                        <button type="button" onClick={handleLogout} className="lp-btn lp-btn-quiet">
                            <LogOut size={15} aria-hidden="true" /> Sign out
                        </button>
                    </div>
                    <p className="rev-live" role="status" aria-live="polite">
                        {stillWaiting ? 'Not approved yet. We will keep checking.' : 'We check automatically every 15 seconds.'}
                    </p>
                </div>
            </main>
        </div>
    );
};
