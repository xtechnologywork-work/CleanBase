import React, { createContext, useContext, useEffect, useState } from 'react';
import { getDB, saveDB, setAuditActor } from '../services/mockDb';
import { isCloud, supabase, sb } from '../services/backend';
import { fromProfile, startReplication, stopReplication } from '../services/replicate';
import type { PlanId, User } from '../types';
import { PLANS } from '../services/plans';

type Plan = PlanId;

interface AuthContextType {
    user: User | null;
    /** False until the saved session (if any) has been checked. */
    ready: boolean;
    isAuthenticated: boolean;
    login: (email: string, password?: string) => Promise<User | null>;
    register: (email: string, companyName: string, subscriptionPlan: Plan, password?: string) => Promise<boolean>;
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
const backupStore = () => (isCloud ? sessionStorage : localStorage);

async function loadCloudProfile(): Promise<User | null> {
    const client = sb();
    const { data: { session } } = await client.auth.getSession();
    if (!session) return null;
    const { data, error } = await client.from('profiles').select('*').eq('auth_id', session.user.id).maybeSingle();
    if (error || !data) return null;
    return fromProfile(data);
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
    const [ready, setReady] = useState(!isCloud);
    const [isImpersonating, setIsImpersonating] = useState<boolean>(() => !!backupStore().getItem(BACKUP_KEY));

    // Cloud: restore the saved Supabase session, then download this person's data.
    useEffect(() => {
        if (!isCloud || !supabase) return;
        let alive = true;
        (async () => {
            try {
                const profile = await loadCloudProfile();
                if (profile) {
                    await startReplication(profile);
                    if (alive) setUser(profile);
                }
            } catch (e) {
                console.error('Could not restore session', e);
            } finally {
                if (alive) setReady(true);
            }
        })();
        const { data: sub } = supabase.auth.onAuthStateChange(event => {
            if (event === 'SIGNED_OUT') { stopReplication(); setUser(null); }
        });
        return () => { alive = false; sub.subscription.unsubscribe(); };
    }, []);

    const login = async (email: string, password?: string): Promise<User | null> => {
        if (isCloud) {
            const client = sb();
            const { error } = await client.auth.signInWithPassword({ email: email.trim(), password: password || '' });
            if (error) { alert(error.message === 'Invalid login credentials' ? 'Invalid email or password.' : error.message); return null; }
            const profile = await loadCloudProfile();
            if (!profile) {
                await client.auth.signOut();
                alert('This account has no company yet. Use "Start for free" to create one.');
                return null;
            }
            await startReplication(profile);
            setUser(profile);
            return profile;
        }
        const db = getDB();
        const found = db.users.find(u => u.email === email);
        if (!found) { alert('User not found. Please register.'); return null; }
        if (found.password && found.password !== password) { alert('Invalid password'); return null; }
        setUser(found);
        localStorage.setItem(SESSION_KEY, JSON.stringify(found));
        return found;
    };

    const register = async (email: string, companyName: string, subscriptionPlan: Plan, password?: string): Promise<boolean> => {
        if (isCloud) {
            const client = sb();
            if (!password || password.length < 8) { alert('Choose a password with at least 8 characters.'); return false; }
            let { data, error } = await client.auth.signUp({ email: email.trim(), password });
            if (error && /already/i.test(error.message)) {
                // Finishing a sign-up that was interrupted: sign in instead.
                const signIn = await client.auth.signInWithPassword({ email: email.trim(), password });
                if (signIn.error) { alert(signIn.error.message === 'Invalid login credentials' ? 'That email already has an account. Sign in, or check the password.' : signIn.error.message); return false; }
                data = { user: signIn.data.user, session: signIn.data.session } as typeof data;
                error = null;
            }
            if (error) { alert(error.message); return false; }
            if (!data.session) {
                alert('Account created. Check your email to confirm it, then sign in. (Platform admins can turn off email confirmation in Supabase, Authentication settings.)');
                return false;
            }
            // Invited team members are linked to their company by the database when they sign up with the invited email.
            let profile = await loadCloudProfile();
            if (!profile) {
                if (!companyName.trim()) {
                    alert('Enter your company name to create a new company.');
                    await client.auth.signOut();
                    return false;
                }
                const { error: rpcError } = await client.rpc('register_company', {
                    p_company_name: companyName, p_plan: subscriptionPlan, p_name: email.split('@')[0],
                });
                if (rpcError) { alert(rpcError.message); await client.auth.signOut(); return false; }
                profile = await loadCloudProfile();
            }
            if (!profile) return false;
            await startReplication(profile);
            setUser(profile);
            return true;
        }
        const db = getDB();
        if (db.users.find(u => u.email === email)) { alert('Email already registered.'); return false; }
        const newCompanyId = `c-${Date.now()}`;
        const monthlyRevenue = PLANS[subscriptionPlan]?.price ?? 0;   // the AI plan is priced with the customer, so it starts at 0
        db.companies.push({ id: newCompanyId, name: companyName, subscriptionPlan, monthlyRevenue, createdAt: new Date().toISOString() });
        const newUser: User = {
            id: `u-${Date.now()}`, email, password, name: email.split('@')[0], role: 'companyadmin',
            companyId: newCompanyId, status: 'locked', createdAt: new Date().toISOString(),
        };
        db.users.push(newUser);
        saveDB(db);
        setUser(newUser);
        localStorage.setItem(SESSION_KEY, JSON.stringify(newUser));
        return true;
    };

    const refreshUser = async (): Promise<User | null> => {
        if (isCloud) {
            const profile = await loadCloudProfile();
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
        if (user && user.role === 'superadmin') backupStore().setItem(BACKUP_KEY, JSON.stringify(user));
        setUser(targetUser);
        setIsImpersonating(true);
        if (!isCloud) localStorage.setItem(SESSION_KEY, JSON.stringify(targetUser));
    };

    const stopImpersonating = () => {
        const backup = backupStore().getItem(BACKUP_KEY);
        if (backup) {
            const original = JSON.parse(backup) as User;
            setUser(original);
            if (!isCloud) localStorage.setItem(SESSION_KEY, JSON.stringify(original));
            backupStore().removeItem(BACKUP_KEY);
            setIsImpersonating(false);
        }
    };

    const logout = () => {
        setUser(null);
        setIsImpersonating(false);
        backupStore().removeItem(BACKUP_KEY);
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
            user, ready, isAuthenticated: !!user, login, register, logout, refreshUser, changePassword,
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
