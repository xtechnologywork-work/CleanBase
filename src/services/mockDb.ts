import type { MockDatabase } from '../types';
import { DB_KEY, isCloud } from './backend';

let auditActor = 'Platform admin';
/** Set by sign-in so audit entries carry the real person. */
export const setAuditActor = (who: string) => { auditActor = who || 'Platform admin'; };

/** Tells the sync layer to save, and tells every live screen to reload from the cache. */
const notifySaved = () => {
    window.dispatchEvent(new Event('cleanbase-save'));
    window.dispatchEvent(new Event('cleanbase-data-changed'));
};

const initialDB: MockDatabase = {
    users: [
        {
            id: 'u1',
            email: 'admin@cleancrm.com',
            name: 'Super Admin',
            role: 'superadmin',
            status: 'active',
            createdAt: new Date().toISOString()
        },
        {
            id: 'u2',
            email: 'owner@company.com',
            name: 'John Owner',
            role: 'companyadmin',
            companyId: 'c1',
            status: 'active',
            createdAt: new Date().toISOString()
        }
    ],
    companies: [
        {
            id: 'c1',
            name: 'Sparkle Cleaners',
            subscriptionPlan: 'pro',
            monthlyRevenue: 500,
            createdAt: new Date().toISOString()
        }
    ],
    bookings: [],
    clients: [],
    services: [
        {
            id: 's1',
            companyId: 'c1',
            name: 'Home Cleaning',
            description: 'Standard cleaning for 2 bed 1 bath home.',
            price: 120,
            durationMinutes: 120,
            createdAt: new Date().toISOString()
        }
    ],
    staff: [],
    notifications: [],
    subscriptions: [],
    reviews: [],
    automations: [],
    auditLogs: [
        {
            id: 'log-1',
            actor: 'System Security',
            action: 'Automated platform health check passed',
            target: 'CleanBase Core',
            type: 'info',
            timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString()
        },
        {
            id: 'log-2',
            actor: 'admin@cleancrm.com',
            action: 'SuperAdmin signed in to mission control',
            target: 'Super Admin Portal',
            type: 'success',
            timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString()
        },
        {
            id: 'log-3',
            actor: 'admin@cleancrm.com',
            action: 'Approved tenant license for Sparkle Cleaners',
            target: 'Sparkle Cleaners',
            type: 'security',
            timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString()
        }
    ],
    platformSettings: {
        platformName: 'CleanBase',
        supportEmail: '',
        currency: 'QAR',
        maintenanceMode: false,
        broadcast: undefined
    }
};

// In cloud mode the cache starts empty: everything comes from Supabase after sign-in.
const baseDB = (): MockDatabase => isCloud
    ? {
        users: [], companies: [], bookings: [], clients: [], services: [], staff: [], notifications: [], subscriptions: [],
        reviews: [], automations: [], auditLogs: [], platformPayments: [],
        platformSettings: { ...initialDB.platformSettings!, broadcast: undefined },
    }
    : initialDB;

// Initialize DB if empty
export const initDB = () => {
    if (!localStorage.getItem(DB_KEY)) {
        localStorage.setItem(DB_KEY, JSON.stringify(baseDB()));
    }
};

export const getDB = (): MockDatabase => {
    const data = localStorage.getItem(DB_KEY);
    const db = data ? JSON.parse(data) : baseDB();

    // Backfill subscriptions for mock DB companies
    let migrated = false;
    db.companies = db.companies.map((c: any) => {
        // In cloud mode the database is the source of truth: never invent values that would be saved back.
        if (!isCloud && !c.subscriptionPlan) {
            migrated = true;
            return {
                ...c,
                subscriptionPlan: 'pro',
                monthlyRevenue: 500
            };
        }
        return c;
    });

    // Make sure new collections exist for existing DBs
    if (!db.notifications) { db.notifications = []; migrated = true; }
    if (!db.subscriptions) { db.subscriptions = []; migrated = true; }
    if (!db.reviews) { db.reviews = []; migrated = true; }
    if (!db.automations) { db.automations = []; migrated = true; }
    if (!db.platformPayments) { db.platformPayments = []; }
    if (!db.auditLogs && isCloud) { db.auditLogs = []; }
    if (!db.auditLogs) {
        db.auditLogs = [
            {
                id: 'log-init-1',
                actor: 'admin@cleancrm.com',
                action: 'Platform initialized with security certificates',
                target: 'CleanBase Core',
                type: 'security',
                timestamp: new Date().toISOString()
            }
        ];
        migrated = true;
    }
    if (!db.platformSettings) {
        db.platformSettings = baseDB().platformSettings;
        migrated = true;
    }

    if (migrated) {
        localStorage.setItem(DB_KEY, JSON.stringify(db));
    }

    return db;
};

export const saveDB = (db: MockDatabase) => {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    notifySaved();
};

export const logAudit = (
    action: string,
    target?: string,
    type: 'info' | 'warning' | 'security' | 'success' = 'info',
    actor: string = auditActor
) => {
    const db = getDB();
    if (!db.auditLogs) db.auditLogs = [];
    db.auditLogs.unshift({
        id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        actor,
        action,
        target,
        type,
        timestamp: new Date().toISOString()
    });
    // Keep the latest 500 logs
    if (db.auditLogs.length > 500) {
        db.auditLogs = db.auditLogs.slice(0, 500);
    }
    saveDB(db);
};

export const seedRealisticDemoData = () => {
    if (isCloud) return; // demo tenants are for local demo mode only
    const db = getDB();
    const demoCompanies = [
        {
            id: 'c-royal',
            name: 'Royal Maids & Cleaning Qatar',
            subscriptionPlan: 'ai_master' as const,
            monthlyRevenue: 0,
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString()
        },
        {
            id: 'c-doha',
            name: 'Doha Pristine Cleaners',
            subscriptionPlan: 'pro' as const,
            monthlyRevenue: 500,
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString()
        },
        {
            id: 'c-crystal',
            name: 'Crystal Clear Facilities',
            subscriptionPlan: 'pro' as const,
            monthlyRevenue: 500,
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12).toISOString()
        }
    ];

    demoCompanies.forEach(co => {
        if (!db.companies.find(c => c.id === co.id)) {
            db.companies.push(co);
            db.users.push({
                id: `u-${co.id}`,
                name: co.name.split(' ')[0] + ' Operations',
                email: `manager@${co.id.replace('c-', '')}.qa`,
                password: 'password123',
                role: 'companyadmin',
                companyId: co.id,
                status: 'active',
                createdAt: co.createdAt
            });
        }
    });

    logAudit('Generated realistic Qatar cleaning demo tenants', 'Tenant Seeder', 'success');
    saveDB(db);
};

