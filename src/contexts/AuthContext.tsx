import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getDB, saveDB, setAuditActor } from '../services/mockDb';
import { isCloud, supabase, sb } from '../services/backend';
import { fromProfile, startReplication, stopReplication } from '../services/replicate';
import type { PlanId, User } from '../types';
import { PLANS } from '../services/plans';
import { fullPhone } from '../services/phone';

type Plan = PlanId;

export interface LoginResult { user: User | null; error?: string }
/** ok: signed in. notice: nothing went wrong but the person must do something first (confirm the email). */
export interface RegisterResult { ok: boolean; error?: string; notice?: string }

interface AuthContextType {
    user: User | null;
    /** False until the saved session (if any) has been checked. */
    ready: boolean;
    isAuthenticated: boolean;
    login: (email: string, password?: string) => Promise<LoginResult>;
    register: (email: string, companyName: string, subscriptionPlan: Plan, password?: string, fullName?: string, phone?: string) => Promise<RegisterResult>;
    /** Email a link to choose a new password. Cloud only. */
    requestPasswordReset: (email: string) => Promise<{ error?: string }>;
    logout: () => void;
    /** Reload the signed-in person's profile (used while waiting for approval). */
    refreshUser: () => Promise<User | null>;
    changePassword: (newPassword: string) => Promise<boolean>;
    impersonateTenant: (targetUser: User) => void;
    stopImpersonating: () => void;
    isImpersonating: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_KEY = 'cleancrm_session';              // local demo mode only
const BACKUP_KEY = 'cleancrm_superadmin_backup';
const TARGET_KEY = 'cleancrm_impersonating';          // cloud: which company account the platform admin is viewing
const backupStore = () => (isCloud ? sessionStorage : localStorage);
const safeGet = (k: string) => { try { return backupStore().getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string) => { try { backupStore().setItem(k, v); } catch { /* storage blocked */ } };
const safeDel = (k: string) => { try { backupStore().removeItem(k); } catch { /* storage blocked */ } };

const normEmail = (e: string) => e.trim().toLowerCase();

/** Supabase error text a person can act on. */
function authMessage(message: string): string {
    if (/invalid login credentials/i.test(message)) return 'Wrong email or password.';
    if (/email not confirmed/i.test(message)) return 'Confirm your email first: open the link we sent you, then sign in.';
    if (/rate limit|too many/i.test(message)) return 'Too many attempts. Wait a minute and try again.';
    if (/password should be at least|weak password/i.test(message)) return 'Choose a stronger password: at least 8 characters.';
    if (/unable to validate email|invalid email/i.test(message)) return 'This email address does not look right.';
    if (/failed to fetch|network/i.test(message)) return 'No connection to the server. Check your internet and try again.';
    return message;
}

async function loadCloudProfile(): Promise<User | null> {
    const client = sb();
    const { data: { session } } = await client.auth.getSession();
    if (!session) return null;
    const { data, error } = await client.from('profiles').select('*').eq('auth_id', session.user.id).maybeSingle();
    if (error) throw error;
    return data ? fromProfile(data) : null;
}

/**
 * The signed-in person's profile. A new owner who had to confirm their email first has no company yet:
 * the company name and plan they typed at sign-up are kept with the account, so the company is created now.
 */
async function ensureCloudProfile(): Promise<User | null> {
    const existing = await loadCloudProfile();
    if (existing) return existing;
    const client = sb();
    const { data: { session } } = await client.auth.getSession();
    const meta = (session?.user.user_metadata || {}) as { company_name?: string; plan?: string; full_name?: string; phone?: string };
    if (!session || !meta.company_name?.trim()) return null;
    const { error } = await client.rpc('register_company', {
        p_company_name: meta.company_name.trim(), p_plan: meta.plan === 'ai_master' ? 'ai_master' : 'pro', p_name: (meta.full_name || '').trim().slice(0, 80) || (session.user.email || '').split('@')[0],
        p_phone: /^\+\d{8,15}$/.test(meta.phone || '') ? meta.phone : '',
    });
    if (error && !/already has a profile/i.test(error.message)) throw error;
    return loadCloudProfile();
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(() => {
        if (isCloud) return null;
        try {
            const saved = localStorage.getItem(SESSION_KEY);
            return saved ? JSON.parse(saved) : null;
        } catch {
            return null;
        }
    });
    const authId = useRef('');                 // the account this tab is acting as (cloud)
    const selfAuth = useRef(false);            // true while THIS tab is signing in
    const [ready, setReady] = useState(!isCloud);
    const [isImpersonating, setIsImpersonating] = useState<boolean>(() => !isCloud && !!safeGet(BACKUP_KEY));

    // Cloud: restore the saved Supabase session, then download this person's data.
    useEffect(() => {
        if (!isCloud || !supabase) return;
        let alive = true;
        (async () => {
            try {
                const profile = await ensureCloudProfile();
                if (profile) {
                    await startReplication(profile);
                    // A platform admin who was viewing a company before the page reloaded keeps viewing it
                    const targetId = safeGet(TARGET_KEY);
                    const target = profile.role === 'superadmin' && targetId ? getDB().users.find(u => u.id === targetId) : undefined;
                    if (target && target.role !== 'superadmin') {
                        safeSet(BACKUP_KEY, JSON.stringify(profile));
                        if (alive) { setUser(target); setIsImpersonating(true); }
                    } else {
                        safeDel(BACKUP_KEY); safeDel(TARGET_KEY);
                        if (alive) setUser(profile);
                    }
                }
            } catch (e) {
                console.error('Could not restore session', e);
            } finally {
                if (alive) setReady(true);
            }
        })();
        const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') { authId.current = ''; stopReplication(); setUser(null); setIsImpersonating(false); safeDel(BACKUP_KEY); safeDel(TARGET_KEY); return; }
            // The sign in is shared by every tab of this browser. If ANOTHER tab signs in as a different person (a driver on this phone,
            // for example), this tab must not go on acting as the old person with the new person's permissions: reload it as that person.
            const id = session?.user?.id || '';
            if (!id || (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION' && event !== 'USER_UPDATED')) return;
            if (selfAuth.current || !authId.current) { authId.current = id; return; }
            if (id !== authId.current) window.location.reload();
        });
        return () => { alive = false; sub.subscription.unsubscribe(); };
    }, []);

    const login = async (email: string, password?: string): Promise<LoginResult> => {
        if (isCloud) {
            const client = sb();
            selfAuth.current = true;
            try {
                const { error } = await client.auth.signInWithPassword({ email: normEmail(email), password: password || '' });
                if (error) return { user: null, error: authMessage(error.message) };
                const profile = await ensureCloudProfile();
                if (!profile) {
                    await client.auth.signOut();
                    return { user: null, error: 'This account has no company yet. Use "Create an account" to set one up, or ask your company admin to invite this email.' };
                }
                safeDel(BACKUP_KEY); safeDel(TARGET_KEY); setIsImpersonating(false);
                await startReplication(profile);
                setUser(profile);
                return { user: profile };
            } catch (e) {
                return { user: null, error: authMessage(e instanceof Error ? e.message : 'Could not sign in. Try again.') };
            } finally {
                selfAuth.current = false;
            }
        }
        const db = getDB();
        const found = db.users.find(u => normEmail(u.email) === normEmail(email));
        if (!found || (found.password && found.password !== password)) return { user: null, error: 'Wrong email or password.' };
        setUser(found);
        localStorage.setItem(SESSION_KEY, JSON.stringify(found));
        return { user: found };
    };

    const register = async (email: string, companyName: string, subscriptionPlan: Plan, password?: string, fullName?: string, phone?: string): Promise<RegisterResult> => {
        const mail = normEmail(email);
        const company = companyName.trim();
        const contact = phone ? fullPhone(phone) : null;
        if (company && !contact) return { ok: false, error: 'Enter your contact number: the 8 digits after +974.' };
        const person = (fullName || '').trim().replace(/\s+/g, ' ').slice(0, 80) || mail.split('@')[0];
        if (!password || password.length < 8) return { ok: false, error: 'Choose a password with at least 8 characters.' };
        if (company && (company.length < 2 || company.length > 120)) return { ok: false, error: 'The company name must be 2 to 120 characters.' };
        if (isCloud) {
            const client = sb();
            selfAuth.current = true;
            try {
                // The company name and plan travel with the account, so the company can still be created
                // after the person confirms their email and signs in.
                let { data, error } = await client.auth.signUp({
                    email: mail, password,
                    options: { data: company ? { company_name: company, plan: subscriptionPlan, full_name: person, phone: contact } : {}, emailRedirectTo: `${window.location.origin}/login` },
                });
                if (error && /already/i.test(error.message)) {
                    // Finishing a sign-up that was interrupted: sign in instead.
                    const signIn = await client.auth.signInWithPassword({ email: mail, password });
                    if (signIn.error) return { ok: false, error: /invalid login credentials/i.test(signIn.error.message) ? 'That email already has an account. Sign in instead, or use "Forgot password".' : authMessage(signIn.error.message) };
                    data = { user: signIn.data.user, session: signIn.data.session } as typeof data;
                    error = null;
                }
                if (error) return { ok: false, error: authMessage(error.message) };
                if (!data.session) {
                    // With email confirmation on, Supabase answers an existing address with an account that has no identities
                    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
                        return { ok: false, error: 'That email already has an account. Sign in instead, or use "Forgot password".' };
                    }
                    return { ok: false, notice: `Almost done. We sent a confirmation link to ${mail}. Open it, then sign in: your workspace is created then.` };
                }
                // Invited team members are linked to their company by the database when they sign up with the invited email.
                let profile = await loadCloudProfile();
                if (!profile) {
                    if (!company) {
                        await client.auth.signOut();
                        return { ok: false, error: 'This email was not invited by a company. Enter your company name to create a new one.' };
                    }
                    const { error: rpcError } = await client.rpc('register_company', { p_company_name: company, p_plan: subscriptionPlan, p_name: person, p_phone: contact || '' });
                    if (rpcError) { await client.auth.signOut(); return { ok: false, error: rpcError.message }; }
                    profile = await loadCloudProfile();
                }
                if (!profile) return { ok: false, error: 'Your account was created but the workspace could not be opened. Sign in again.' };
                await startReplication(profile);
                setUser(profile);
                return { ok: true };
            } catch (e) {
                return { ok: false, error: authMessage(e instanceof Error ? e.message : 'Could not create the account. Try again.') };
            } finally {
                selfAuth.current = false;
            }
        }
        if (!company) return { ok: false, error: 'Enter your company name.' };
        email = mail; companyName = company;
        const db = getDB();
        if (db.users.find(u => normEmail(u.email) === mail)) return { ok: false, error: 'That email already has an account. Sign in instead.' };
        const newCompanyId = `c-${Date.now()}`;
        const monthlyRevenue = PLANS[subscriptionPlan]?.price ?? 0;   // the AI plan is priced with the customer, so it starts at 0
        db.companies.push({ id: newCompanyId, name: companyName, phone: contact || undefined, subscriptionPlan, monthlyRevenue, createdAt: new Date().toISOString() });
        const newUser: User = {
            id: `u-${Date.now()}`, email, password, name: person, role: 'companyadmin',
            companyId: newCompanyId, status: 'locked', createdAt: new Date().toISOString(),
        };
        db.users.push(newUser);
        saveDB(db);
        setUser(newUser);
        localStorage.setItem(SESSION_KEY, JSON.stringify(newUser));
        return { ok: true };
    };

    const requestPasswordReset = async (email: string): Promise<{ error?: string }> => {
        if (!isCloud) return { error: 'Password reset by email works in the online version only. Ask your company admin to set a new password.' };
        const mail = normEmail(email);
        if (!/^\S+@\S+\.\S+$/.test(mail)) return { error: 'Enter the email address of your account.' };
        try {
            const { error } = await sb().auth.resetPasswordForEmail(mail, { redirectTo: `${window.location.origin}/reset-password` });
            // The answer is the same whether or not the account exists, so nobody can test which emails are registered
            if (error && !/not found|no user/i.test(error.message)) return { error: authMessage(error.message) };
            return {};
        } catch (e) {
            return { error: authMessage(e instanceof Error ? e.message : 'Could not send the email. Try again.') };
        }
    };

    const refreshUser = async (): Promise<User | null> => {
        if (isCloud) {
            let profile: User | null = null;
            try { profile = await loadCloudProfile(); } catch { return null; }
            if (profile) {
                if (user && user.status === 'locked' && profile.status === 'active') await startReplication(profile);
                setUser(profile);
            }
            return profile;
        }
        const fresh = getDB().users.find(u => u.id === user?.id || u.email === user?.email) || null;
        if (fresh) { localStorage.setItem(SESSION_KEY, JSON.stringify(fresh)); setUser(fresh); }
        return fresh;
    };

    const changePassword = async (newPassword: string): Promise<boolean> => {
        if (isCloud) {
            const { error } = await sb().auth.updateUser({ password: newPassword });
            if (error) { alert(error.message); return false; }
            return true;
        }
        const db = getDB();
        const i = db.users.findIndex(u => u.id === user?.id);
        if (i < 0) return false;
        db.users[i].password = newPassword;
        saveDB(db);
        return true;
    };

    const impersonateTenant = (targetUser: User) => {
        // Only the platform admin can view a company; viewing another company while already viewing one keeps the real admin as backup
        if (!user || (user.role !== 'superadmin' && !isImpersonating)) return;
        if (user.role === 'superadmin') safeSet(BACKUP_KEY, JSON.stringify(user));
        if (isCloud) safeSet(TARGET_KEY, targetUser.id);
        setUser(targetUser);
        setIsImpersonating(true);
        if (!isCloud) localStorage.setItem(SESSION_KEY, JSON.stringify(targetUser));
    };

    const stopImpersonating = () => {
        const backup = safeGet(BACKUP_KEY);
        safeDel(TARGET_KEY);
        if (backup) {
            const original = JSON.parse(backup) as User;
            setUser(original);
            if (!isCloud) localStorage.setItem(SESSION_KEY, JSON.stringify(original));
            safeDel(BACKUP_KEY);
            setIsImpersonating(false);
        }
    };

    const logout = () => {
        setUser(null);
        setIsImpersonating(false);
        safeDel(BACKUP_KEY); safeDel(TARGET_KEY);
        if (isCloud) {
            stopReplication();
            void sb().auth.signOut();
        } else {
            localStorage.removeItem(SESSION_KEY);
        }
    };

    // Audit entries carry the real person who did the action.
    useEffect(() => { if (!isImpersonating) setAuditActor(user?.email || 'Platform admin'); }, [user?.email, isImpersonating]);

    if (!ready) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-body)', color: 'var(--color-text-tertiary)', fontSize: '0.9375rem' }}>
                Loading your workspace...
            </div>
        );
    }

    return (
        <AuthContext.Provider value={{
            user, ready, isAuthenticated: !!user, login, register, requestPasswordReset, logout, refreshUser, changePassword,
            impersonateTenant, stopImpersonating, isImpersonating,
        }}>
            {children}
        </AuthContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
