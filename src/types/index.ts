// Common IDs
export type ID = string;

export type UserRole = 'superadmin' | 'companyadmin' | 'manager' | 'dispatcher' | 'accountant' | 'staff' | 'driver' | 'cleaner';

export interface User {
    id: ID;
    email: string;
    name: string;
    role: UserRole;
    companyId?: ID; // null if superadmin
    status?: 'active' | 'locked';
    password?: string;
    createdAt: string;
}

/** pro and ai_master are sold today. basic and yearly_basic are old plans kept for existing tenants. */
export type PlanId = 'basic' | 'yearly_basic' | 'pro' | 'ai_master';

export interface Company {
    id: ID;
    name: string;
    logo?: string;
    workingHours?: string;
    serviceAreas?: string[];
    subscriptionPlan?: PlanId;
    monthlyRevenue?: number;
    /** Platform admin fields */
    approvedAt?: string;
    licenseUntil?: string;
    adminNotes?: string;
    createdAt: string;
}

/** A subscription payment from a tenant to the platform. Platform-admin only (stored without a company id). */
export interface PlatformPayment {
    id: ID;
    tenantId: ID;
    amount: number;
    method: 'cash' | 'bank' | 'card' | 'other';
    date: string;
    months: number;
    reference?: string;
    note?: string;
    createdAt: string;
}

export type BookingStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export type PaymentStatus = 'paid' | 'unpaid' | 'overdue';

export interface Booking {
    id: ID;
    companyId: ID;
    clientId: ID;
    serviceId: ID;
    cleanerId?: ID; // Staff ID
    date: string; // YYYY-MM-DD
    time: string; // HH:mm
    address: string;
    lat?: number;
    lng?: number;
    price: number;
    status: BookingStatus;
    paymentStatus: PaymentStatus;
    isRecurring?: boolean;
    subscriptionId?: ID;
    deletionRequested?: boolean;
    deletionRequestedBy?: string;
    /** 'store' when the client asked for it on the public booking link */
    source?: string;
    notes?: string;
    cancelReason?: string;
    decidedAt?: string;
    createdAt: string;
}

export interface Client {
    id: ID;
    companyId: ID;
    name: string;
    phone: string;
    address: string;
    totalSpent: number;
    createdAt: string;
}

export interface Service {
    id: ID;
    companyId: ID;
    name: string; // e.g., 'Deep Cleaning'
    description: string;
    price: number;
    durationMinutes: number;
    /** false hides it from the public booking store. Missing means shown. */
    online?: boolean;
    createdAt: string;
}

export interface Staff {
    id: ID;
    companyId: ID;
    userId: ID; // Link to the user table
    phone?: string;
    age?: number;
    nationality?: string;
    photo?: string;
    rating: number; // 0-5
    completedJobsCount: number;
    revenueGenerated: number;
    currentLat?: number;
    currentLng?: number;
    createdAt: string;
}

export interface Notification {
    id: ID;
    companyId: ID;
    title: string;
    message: string;
    read: boolean;
    createdAt: string;
}

export interface Subscription {
    id: ID;
    companyId: ID;
    clientId: ID;
    serviceId: ID;
    cleanerId?: ID;
    frequency: 'weekly' | 'bi-weekly' | 'monthly' | 'live-in';
    startDate: string;
    endDate?: string;
    status: 'active' | 'paused' | 'cancelled';
    pricePerVisit: number;
    notes?: string;
    createdAt: string;
    /** Set when the owner cancels it: the exact moment, the reason and who did it. */
    cancelledAt?: string;
    cancelReason?: string;
    cancelNote?: string;
    cancelledBy?: string;
}

export interface Review {
    id: ID;
    companyId: ID;
    bookingId: ID;
    clientId: ID;
    cleanerId: ID;
    rating: number; // 1-5
    comment?: string;
    createdAt: string;
}

export interface AutomationRule {
    id: ID;
    companyId: ID;
    trigger: 'booking_created' | 'booking_completed' | 'cleaner_dispatched' | 'invoice_overdue';
    action: 'send_sms' | 'send_email' | 'send_whatsapp' | 'auto_assign';
    isActive: boolean;
    createdAt: string;
}

export interface AuditLog {
    id: ID;
    actor: string;
    action: string;
    target?: string;
    type: 'info' | 'warning' | 'security' | 'success';
    timestamp: string;
}

export interface PlatformBroadcast {
    id: ID;
    message: string;
    type: 'info' | 'warning' | 'promo' | 'alert';
    active: boolean;
    createdAt: string;
}

export interface PlatformPricingPlan {
    id: string;
    name: string;
    monthlyPrice: number;
    yearlyPrice?: number;
    cleanerLimit: number;
    features: string[];
    isPopular?: boolean;
}

export interface PlatformSettings {
    platformName: string;
    supportEmail: string;
    currency: string;
    maintenanceMode: boolean;
    broadcast?: PlatformBroadcast;
    /** No longer edited in the admin dashboard; plans are defined in services/plans.ts. */
    pricingPlans?: PlatformPricingPlan[];
}

// Database schema for mock DB
export interface MockDatabase {
    users: User[];
    companies: Company[];
    bookings: Booking[];
    clients: Client[];
    services: Service[];
    staff: Staff[];
    notifications: Notification[];
    subscriptions: Subscription[];
    reviews: Review[];
    automations: AutomationRule[];
    auditLogs?: AuditLog[];
    platformPayments?: PlatformPayment[];
    platformSettings?: PlatformSettings;
}

