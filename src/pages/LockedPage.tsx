import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, MessageCircle, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Brand } from '../components/shared/Brand';
import '../auth.css';

export const LockedPage: React.FC = () => {
    const { user, logout, refreshUser } = useAuth();
    const navigate = useNavigate();
    const [isChecking, setIsChecking] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleCheckStatus = async () => {
        setIsChecking(true);
        const fresh = await refreshUser();
        setIsChecking(false);
        if (fresh && fresh.status === 'active') navigate('/app', { replace: true });
    };

    const handleWhatsApp = () => {
        const text = encodeURIComponent(`Hello CleanBase Team, I just registered my cleaning business (${user?.name} - ${user?.email}) and would like to verify and activate my workspace.`);
        window.open(`https://wa.me/97451704550?text=${text}`, '_blank');
    };

    return (
        <div className="auth">
            <div className="auth-top">
                <Brand size={20} />
            </div>
            <main className="auth-main">
                <div className="auth-card">
                    <h1>Account under review</h1>
                    <span className="auth-status"><i aria-hidden="true" />Waiting for verification</span>
                    <p className="auth-sub">
                        Hi {user?.name || 'there'}, your account has been created. Our team is reviewing your company
                        profile and will activate your workspace.
                    </p>

                    <div className="auth-actions">
                        <button type="button" onClick={handleWhatsApp} className="lp-btn lp-btn-primary">
                            <MessageCircle size={20} aria-hidden="true" /> Fast-track on WhatsApp
                        </button>
                        <button
                            type="button"
                            onClick={handleCheckStatus}
                            disabled={isChecking}
                            className="lp-btn lp-btn-ghost"
                        >
                            <RefreshCw size={16} aria-hidden="true" className={isChecking ? 'spin' : ''} />
                            {isChecking ? 'Checking status...' : 'Check approval status'}
                        </button>
                        <button type="button" onClick={handleLogout} className="lp-btn lp-btn-quiet">
                            <LogOut size={15} aria-hidden="true" /> Sign out
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
};
