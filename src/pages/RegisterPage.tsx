import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Lock, Building } from 'lucide-react';
import { Brand } from '../components/shared/Brand';
import '../auth.css';
import { isCloud } from '../services/backend';
import { isPlanId, PLANS, SELLABLE } from '../services/plans';
import type { PlanId } from '../types';

export const RegisterPage: React.FC = () => {
    const navigate = useNavigate();
    const { register } = useAuth();

    const [email, setEmail] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [password, setPassword] = useState('');
    const [params] = useSearchParams();
    const wanted = params.get('plan');
    const [plan, setPlan] = useState<PlanId>(isPlanId(wanted) && SELLABLE.includes(wanted) ? wanted : 'pro');

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        const success = await register(email, companyName, plan, password);
        if (success) {
            navigate('/app');
        }
    };

    return (
        <div className="auth">
            <div className="auth-top">
                <Link to="/" aria-label="CleanBase home"><Brand size={20} /></Link>
            </div>
            <main className="auth-main">
                <div className="auth-card">
                    <h1>Create your account</h1>
                    <p className="auth-sub">Start your 14-day free trial. No credit card required.</p>

                    <form className="auth-form" onSubmit={handleRegister}>
                        <div className="auth-field">
                            <label htmlFor="reg-company">Company name{isCloud ? ' (leave blank if you were invited)' : ''}</label>
                            <div className="auth-input">
                                <Building size={18} aria-hidden="true" />
                                <input
                                    id="reg-company"
                                    type="text"
                                    placeholder="e.g. Sparkle Cleaners"
                                    autoComplete="organization"
                                    value={companyName}
                                    onChange={e => setCompanyName(e.target.value)}
                                    required={!isCloud}
                                />
                            </div>
                        </div>

                        <div className="auth-field">
                            <label htmlFor="reg-email">Email address</label>
                            <div className="auth-input">
                                <Mail size={18} aria-hidden="true" />
                                <input
                                    id="reg-email"
                                    type="email"
                                    placeholder="owner@company.com"
                                    autoComplete="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="auth-field">
                            <label htmlFor="reg-password">Password</label>
                            <div className="auth-input">
                                <Lock size={18} aria-hidden="true" />
                                <input
                                    id="reg-password"
                                    type="password"
                                    placeholder="Create a strong password"
                                    autoComplete="new-password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="auth-field">
                            <label htmlFor="reg-plan">Select plan</label>
                            <div className="auth-input">
                                <select
                                    id="reg-plan"
                                    value={plan}
                                    onChange={e => setPlan(e.target.value as PlanId)}
                                >
                                    {SELLABLE.map(id => (
                                        <option key={id} value={id}>
                                            {PLANS[id].name}: {PLANS[id].price === null ? 'price agreed with our team' : `${PLANS[id].price} QAR / month`}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <button type="submit" className="lp-btn lp-btn-primary auth-submit">Get started</button>
                    </form>

                    <p className="auth-switch">
                        Already have an account? <Link to="/login">Sign in</Link>
                    </p>
                </div>
            </main>
        </div>
    );
};
