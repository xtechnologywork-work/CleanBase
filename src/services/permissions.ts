import type { UserRole } from '../types';

export type PageKey =
    | 'overview' | 'ai' | 'analytics' | 'bookings' | 'dispatch' | 'subscriptions' | 'clients' | 'sales' | 'quality'
    | 'staff' | 'team' | 'services' | 'resources' | 'invoices' | 'expenses' | 'reports' | 'activity'
    | 'business' | 'settings' | 'drivers' | 'drive';

export const ALL_PAGES: { key: PageKey; label: string }[] = [
    { key: 'overview', label: 'Overview' }, { key: 'ai', label: 'AI Manager' }, { key: 'bookings', label: 'Bookings' }, { key: 'dispatch', label: 'Dispatch board' },
    { key: 'drivers', label: 'Driver board' }, { key: 'drive', label: 'Driver app (phone)' },
    { key: 'subscriptions', label: 'Contracts' }, { key: 'clients', label: 'Clients' }, { key: 'sales', label: 'Leads and quotes' },
    { key: 'quality', label: 'Quality' }, { key: 'staff', label: 'Cleaners' }, { key: 'team', label: 'Team hub' },
    { key: 'services', label: 'Services' }, { key: 'resources', label: 'Zones and supplies' }, { key: 'invoices', label: 'Invoices' },
    { key: 'expenses', label: 'Expenses' }, { key: 'reports', label: 'Reports' }, { key: 'analytics', label: 'Analytics' },
    { key: 'activity', label: 'Activity log' }, { key: 'business', label: 'Business rules' },
    { key: 'settings', label: 'Settings and team' },
];

const everything = ALL_PAGES.map(p => p.key);

export const ROLE_PAGES: Partial<Record<UserRole, PageKey[]>> = {
    companyadmin: everything,
    manager: everything.filter(k => k !== 'settings'),
    dispatcher: ['bookings', 'dispatch', 'drivers', 'drive', 'clients', 'staff', 'resources', 'services', 'quality', 'subscriptions'],
    accountant: ['overview', 'invoices', 'expenses', 'reports', 'analytics', 'clients', 'team'],
    staff: ['bookings'],
    driver: ['drive'],
    cleaner: ['bookings'],
};

export const PAGE_PATH: Record<PageKey, string> = {
    overview: '/app', ai: '/app/ai', analytics: '/app/analytics', bookings: '/app/bookings', dispatch: '/app/dispatch',
    subscriptions: '/app/subscriptions', clients: '/app/clients', sales: '/app/sales', quality: '/app/quality',
    staff: '/app/staff', team: '/app/team', services: '/app/services', resources: '/app/resources',
    invoices: '/app/invoices', expenses: '/app/expenses', reports: '/app/reports', activity: '/app/activity',
    business: '/app/business', settings: '/app/settings', drivers: '/app/drivers', drive: '/driver',
};

export const can = (role: UserRole | undefined, page: PageKey) => !!role && (ROLE_PAGES[role] || []).includes(page);

export const firstAllowed = (role: UserRole | undefined): string => {
    const first = (ROLE_PAGES[role as UserRole] || [])[0];
    return first ? PAGE_PATH[first] : '/app/bookings';
};

export const ADMIN_ROLES: UserRole[] = ['companyadmin', 'manager', 'dispatcher', 'accountant'];
