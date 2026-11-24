import React, { useState, useMemo } from 'react';
import { getDB, saveDB } from '../services/mockDb';
import type { Booking, BookingStatus, Service, Client, Staff, User, PaymentStatus } from '../types';
import {
    Plus, Search, Calendar, Clock, Edit2, CheckCircle2,
    LayoutList, CalendarDays, Download,
    AlertTriangle, Trash2, X, MessageCircle, Bell, FileText
} from 'lucide-react';
import { addDays, format, parseISO } from 'date-fns';
import { addItem, dayLabel, findConflict, fmt, getSettings, staffName, invoiceTotal, logActivity, nextNumber, readCollection, reservedMessage, today, updateItem, useDB } from '../services/erp';
import { DEFAULT_TEMPLATES, renderMessage, STATUS_BUTTON, STATUS_KEY, statusMessage, whatsappDigits, whatsappUrl } from '../services/bookingMessages';
import type { MessageVars } from '../services/bookingMessages';
import { useAuth } from '../contexts/AuthContext';
import { CalendarView } from '../components/bookings/CalendarView';
import { BookingRequests } from '../components/bookings/BookingRequests';

const formatLocalDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

export const BookingsPage: React.FC = () => {
    const { user } = useAuth();
    // Live data: a request from the booking page or a change on another device shows up without a reload
    const live = useDB();
    const cid = user?.companyId;
    // A cleaner or staff member sees only their own jobs and cannot create, edit, delete or export bookings
    const fieldOnly = user?.role === 'cleaner' || user?.role === 'staff';
    const ownStaffId = useMemo(() => live.staff.find(s => s.companyId === cid && s.userId === user?.id)?.id, [live, cid, user?.id]);
    const bookings = useMemo<Booking[]>(() => live.bookings.filter(b => b.companyId === cid && (!fieldOnly || (!!ownStaffId && b.cleanerId === ownStaffId)))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [live, cid, fieldOnly, ownStaffId]);
    const services = useMemo<Service[]>(() => live.services.filter(s => s.companyId === cid), [live, cid]);
    const clients = useMemo<Client[]>(() => live.clients.filter(c => c.companyId === cid), [live, cid]);
    const staffList = useMemo<(Staff & { user: User })[]>(() => live.staff.filter(s => s.companyId === cid)
        .map(s => ({ ...s, user: live.users.find(u => u.id === s.userId)! }))
        .filter(s => s.user !== undefined && s.user.role === 'cleaner'), [live, cid]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [cleanerFilter, setCleanerFilter] = useState<string>('all');
    const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
    const [editingId, setEditingId] = useState<string | null>(null);

    // Deletion Modal State
    const [bookingToDelete, setBookingToDelete] = useState<string | null>(null);

    // Booking Form State
    const initialFormState = {
        clientId: '',
        clientName: '',
        clientPhone: '+974 ',
        serviceId: '',
        date: formatLocalDate(new Date()),
        time: '09:00',
        address: '',
        cleanerId: '',
        price: 0,
        status: 'confirmed' as BookingStatus,
        paymentStatus: 'unpaid' as PaymentStatus
    };
    const [formData, setFormData] = useState(initialFormState);

    // Saving writes to the shared store, which refreshes the live data above
    const loadData = () => undefined;

    const getClient = (id: string) => clients.find(c => c.id === id);
    const getService = (id: string) => services.find(s => s.id === id);
    const getCleaner = (id?: string) => staffList.find(s => s.id === id);

    // Open modal with specific date clicked from calendar
    const openNewModalWithDate = (dateStr: string) => {
        setEditingId(null);
        setFormData({
            ...initialFormState,
            date: dateStr,
            serviceId: services[0]?.id || '',
            price: services[0]?.price || 0
        });
        setIsModalOpen(true);
    };

    const openNewModal = () => {
        setEditingId(null);
        setFormData({
            ...initialFormState,
            serviceId: services[0]?.id || '',
            price: services[0]?.price || 0
        });
        setIsModalOpen(true);
    };

    const handleEdit = (booking: Booking) => {
        const client = clients.find(c => c.id === booking.clientId);
        setEditingId(booking.id);
        setFormData({
            clientId: booking.clientId || '',
            clientName: client?.name || '',
            clientPhone: client?.phone || '+974 ',
            serviceId: booking.serviceId,
            date: booking.date,
            time: booking.time,
            address: booking.address,
            cleanerId: booking.cleanerId || '',
            price: booking.price,
            status: booking.status,
            paymentStatus: booking.paymentStatus
        });
        setIsModalOpen(true);
    };

    const handleServiceSelect = (serviceId: string) => {
        const s = services.find(x => x.id === serviceId);
        setFormData(prev => ({
            ...prev,
            serviceId,
            price: s ? s.price : prev.price
        }));
    };

    const handleClientSelect = (clientId: string) => {
        if (!clientId) {
            setFormData(prev => ({ ...prev, clientId: '', clientName: '', clientPhone: '+974 ', address: '' }));
            return;
        }
        const c = clients.find(x => x.id === clientId);
        if (c) {
            setFormData(prev => ({
                ...prev,
                clientId: c.id,
                clientName: c.name,
                clientPhone: c.phone,
                address: c.address
            }));
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const db = getDB();

        // A cleaner kept by a subscription for another client cannot take this job (unchanged jobs of an existing booking are left alone)
        if (formData.cleanerId && cid) {
            const before = editingId ? db.bookings.find(b => b.id === editingId) : undefined;
            const unchanged = !!before && before.cleanerId === formData.cleanerId && before.date === formData.date;
            const kept = unchanged ? '' : reservedMessage(db, cid, formData.cleanerId, formData.date, formData.clientId || undefined, before?.subscriptionId);
            if (kept) { alert(kept); return; }
            // The same cleaner cannot be in two places at once: warn when this job overlaps another one of hers (same rule as the dispatch board)
            if (formData.status !== 'cancelled') {
                const duration = db.services.find(s => s.id === formData.serviceId)?.durationMinutes || 120;
                const clash = findConflict(db, cid, formData.cleanerId, formData.date, formData.time, duration, editingId || undefined);
                if (clash && !confirm(`${staffName(db, formData.cleanerId)} already has a job at ${clash.time} that overlaps. Save anyway?`)) return;
            }
        }

        let resolvedClientId = formData.clientId;
        // If no existing client was picked, create a new client record automatically
        if (!resolvedClientId && formData.clientName.trim()) {
            const newClient: Client = {
                id: `client-${Date.now()}`,
                companyId: user?.companyId || 'c1',
                name: formData.clientName.trim(),
                phone: formData.clientPhone.trim(),
                address: formData.address.trim(),
                totalSpent: 0,
                createdAt: new Date().toISOString()
            };
            db.clients.push(newClient);
            resolvedClientId = newClient.id;
        }

        if (editingId) {
            const index = db.bookings.findIndex(b => b.id === editingId);
            if (index !== -1) {
                db.bookings[index] = {
                    ...db.bookings[index],
                    clientId: resolvedClientId || db.bookings[index].clientId,
                    serviceId: formData.serviceId,
                    date: formData.date,
                    time: formData.time,
                    address: formData.address,
                    cleanerId: formData.cleanerId || undefined,
                    price: Number(formData.price),
                    status: formData.status,
                    paymentStatus: formData.paymentStatus
                };
            }
        } else {
            const newBooking: Booking = {
                id: `b-${Date.now()}`,
                companyId: user?.companyId || 'c1',
                clientId: resolvedClientId || 'guest',
                serviceId: formData.serviceId,
                date: formData.date,
                time: formData.time,
                address: formData.address,
                cleanerId: formData.cleanerId || undefined,
                price: Number(formData.price),
                status: formData.status,
                paymentStatus: formData.paymentStatus,
                createdAt: new Date().toISOString()
            };
            db.bookings.push(newBooking);
        }

        saveDB(db);
        loadData();
        setIsModalOpen(false);
        setEditingId(null);
    };

    /* ---- WhatsApp messages from the booking window. The text follows what is chosen in the form right now. ---- */
    const savedBooking = editingId ? bookings.find(b => b.id === editingId) : undefined;
    const phoneDigits = whatsappDigits(formData.clientPhone);
    const messageVars = (): MessageVars => {
        const company = getDB().companies.find(c => c.id === user?.companyId);
        return {
            name: formData.clientName.trim(),
            service: services.find(s => s.id === formData.serviceId)?.name || '',
            date: formData.date, time: formData.time,
            cleaner: staffList.find(s => s.id === formData.cleanerId)?.user?.name || '',
            company: company?.name || '', address: formData.address.trim(),
        };
    };
    const openWhatsApp = (text: string) => {
        if (!phoneDigits) { alert('Enter a valid phone number for this client first (for example +974 5512 3456).'); return; }
        window.open(whatsappUrl(phoneDigits, text), '_blank', 'noopener');
    };
    const companySettings = () => getSettings(user?.companyId || '');
    const sendStatusMessage = () => openWhatsApp(statusMessage(formData.status, companySettings(), messageVars()));
    const sendReminder = () => openWhatsApp(renderMessage(companySettings().tplReminder, messageVars()));
    // Preview of the message the main button will send, and a one-click way back to the English + Arabic default
    const [, setTplTick] = useState(0);
    const statusKey = STATUS_KEY[formData.status];
    const statusIsDefault = isModalOpen && companySettings()[statusKey] === DEFAULT_TEMPLATES[statusKey];
    const statusPreview = isModalOpen ? statusMessage(formData.status, companySettings(), messageVars()) : '';
    const useDefaultMessage = () => {
        const companyId = user?.companyId;
        if (!companyId) return;
        const found = readCollection('settings', companyId)[0];
        if (found) updateItem('settings', found.id, { [statusKey]: DEFAULT_TEMPLATES[statusKey] });
        else addItem('settings', companyId, { ...companySettings(), [statusKey]: DEFAULT_TEMPLATES[statusKey] });
        setTplTick(n => n + 1);
    };
    // Unsaved edits that would change the invoice
    const invoiceDirty = !!savedBooking && (savedBooking.serviceId !== formData.serviceId || savedBooking.date !== formData.date
        || Number(savedBooking.price) !== Number(formData.price) || savedBooking.status !== formData.status || savedBooking.clientId !== formData.clientId);
    const sendInvoice = () => {
        const companyId = user?.companyId;
        if (!companyId || !savedBooking) return;
        if (invoiceDirty) { alert('You changed this booking. Save the booking changes first, then send the invoice.'); return; }
        const settings = companySettings();
        const all = readCollection('invoices', companyId);
        let invoice = all.find(i => i.status !== 'cancelled' && i.bookingIds.includes(savedBooking.id));
        if (!invoice) {
            if (!clients.some(c => c.id === savedBooking.clientId)) { alert('This booking has no saved client, so an invoice cannot be created.'); return; }
            const svcName = services.find(s => s.id === savedBooking.serviceId)?.name || 'Cleaning';
            const ok = window.confirm(`There is no invoice for this booking yet.\n\nCreate one for ${fmt(Number(savedBooking.price))} ${settings.currency} and send it?`);
            if (!ok) return;
            const issue = today();
            invoice = addItem('invoices', companyId, {
                number: nextNumber(settings.invoicePrefix, all.map(i => i.number)), clientId: savedBooking.clientId, bookingIds: [savedBooking.id],
                issueDate: issue, dueDate: format(addDays(parseISO(issue), settings.paymentTermsDays), 'yyyy-MM-dd'),
                items: [{ description: `${svcName} on ${dayLabel(savedBooking.date)}`, qty: 1, price: Number(savedBooking.price) }],
                discount: 0, taxRate: settings.taxRate, notes: '', status: 'sent',
            });
            logActivity(companyId, user?.name || 'Owner', 'Created invoice', invoice.number);
        }
        openWhatsApp(renderMessage(settings.tplInvoice, {
            ...messageVars(), number: invoice.number, amount: invoiceTotal(invoice), currency: settings.currency, due: invoice.dueDate,
        }));
    };
    const noReminder = formData.status === 'completed' || formData.status === 'cancelled';

    const handleQuickStatusChange = (bookingId: string, status: BookingStatus) => {
        const db = getDB();
        const index = db.bookings.findIndex(b => b.id === bookingId);
        if (index !== -1) {
            db.bookings[index].status = status;
            saveDB(db);
            loadData();
        }
    };

    const handleDeleteBooking = (id: string) => {
        const db = getDB();
        db.bookings = db.bookings.filter(b => b.id !== id);
        saveDB(db);
        loadData();
        setBookingToDelete(null);
    };

    // Export CSV of Bookings
    const handleExportCSV = () => {
        const headers = ['Booking ID', 'Date', 'Time', 'Client', 'Phone', 'Service', 'Cleaner', 'Address', 'Price (QAR)', 'Payment Status', 'Status'];
        const rows = filteredBookings.map(b => {
            const client = getClient(b.clientId);
            const service = getService(b.serviceId);
            const cleaner = getCleaner(b.cleanerId);
            return [
                b.id,
                b.date,
                b.time,
                `"${client?.name || 'Guest'}"`,
                `"${client?.phone || ''}"`,
                `"${service?.name || ''}"`,
                `"${cleaner?.user?.name || 'Unassigned'}"`,
                `"${b.address || ''}"`,
                b.price,
                b.paymentStatus,
                b.status
            ].join(',');
        });

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `bookings_dispatch_${formatLocalDate(new Date())}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Filtered bookings
    const term = searchTerm.toLowerCase();
    const filteredBookings = bookings.filter(b => {
        const client = getClient(b.clientId);
        const cleaner = getCleaner(b.cleanerId);
        const matchesSearch = !term ||
            (client?.name || '').toLowerCase().includes(term) ||
            (cleaner?.user?.name || '').toLowerCase().includes(term) ||
            (b.address || '').toLowerCase().includes(term) ||
            b.id.toLowerCase().includes(term);

        const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
        const matchesCleaner = cleanerFilter === 'all' || b.cleanerId === cleanerFilter;

        return matchesSearch && matchesStatus && matchesCleaner;
    });

    // Metric Calculations
    const todayStr = formatLocalDate(new Date());
    const todayBookings = bookings.filter(b => b.date === todayStr);
    const todayRevenue = todayBookings.reduce((sum, b) => b.status !== 'cancelled' ? sum + b.price : sum, 0);

    const unassignedBookings = bookings.filter(b => !b.cleanerId && b.status !== 'cancelled');
    const completedBookings = bookings.filter(b => b.status === 'completed');
    const totalRevenueDelivered = completedBookings.reduce((sum, b) => sum + b.price, 0);

    return (
        <div className="animate-fade-in">
            {/* Executive Page Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--color-text-primary)', margin: 0 }}>
                        Bookings & Operations Dispatch
                    </h1>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                        Schedule appointments, dispatch field cleaners, track real-time routes, and monitor daily revenue.
                    </p>
                </div>
                {!fieldOnly && <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button
                        onClick={handleExportCSV}
                        style={{
                            background: '#FFFFFF',
                            border: '1px solid var(--color-border)',
                            borderRadius: '6px',
                            padding: '0.55rem 0.875rem',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            color: 'var(--color-text-primary)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem'
                        }}
                    >
                        <Download size={14} />
                        <span>Export CSV</span>
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={openNewModal}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', padding: '0.55rem 1rem' }}
                    >
                        <Plus size={15} strokeWidth={2.5} />
                        <span>New Booking</span>
                    </button>
                </div>}
            </div>

            {user?.companyId && !fieldOnly && <BookingRequests companyId={user.companyId} actor={user.name || 'Owner'} onChange={loadData} />}

            {/* 4 Executive Metric Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                {/* Total Bookings */}
                <div className="card" style={{ padding: '1.125rem 1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                            Total Bookings
                        </span>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>
                            <Calendar size={16} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.625rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>
                            {bookings.length}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                            all time
                        </span>
                    </div>
                </div>

                {/* Needs Dispatch (Unassigned Alert) */}
                <div
                    className="card"
                    style={{
                        padding: '1.125rem 1.25rem',
                        border: unassignedBookings.length > 0 ? '1px solid #f6bdb9' : '1px solid var(--color-border)',
                        backgroundColor: unassignedBookings.length > 0 ? '#fdeceb' : '#FFFFFF'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: unassignedBookings.length > 0 ? '#d70015' : 'var(--color-text-secondary)' }}>
                            Needs Dispatch
                        </span>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: unassignedBookings.length > 0 ? 'rgba(215, 0, 21, 0.15)' : 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: unassignedBookings.length > 0 ? '#d70015' : 'var(--color-text-secondary)' }}>
                            <AlertTriangle size={16} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.625rem', fontWeight: 700, letterSpacing: '-0.02em', color: unassignedBookings.length > 0 ? '#d70015' : 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>
                            {unassignedBookings.length}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: unassignedBookings.length > 0 ? '#d70015' : 'var(--color-text-tertiary)', fontWeight: 500 }}>
                            {unassignedBookings.length > 0 ? 'unassigned staff' : 'all assigned'}
                        </span>
                    </div>
                </div>

                {/* Today's Schedule */}
                <div className="card" style={{ padding: '1.125rem 1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                            Today's Schedule
                        </span>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
                            <Clock size={16} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.625rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>
                            {todayBookings.length}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>
                            • {todayRevenue.toFixed(0)} QAR
                        </span>
                    </div>
                </div>

                {/* Delivered Revenue */}
                <div className="card" style={{ padding: '1.125rem 1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                            Completed Volume
                        </span>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#248a3d' }}>
                            <CheckCircle2 size={16} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.625rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>
                            {totalRevenueDelivered.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                            QAR delivered
                        </span>
                    </div>
                </div>
            </div>

            {/* Filter & View Mode Controls Bar */}
            <div className="card" style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '260px', maxWidth: '600px' }}>
                    {/* Search Input */}
                    <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={14} color="var(--color-text-tertiary)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            type="text"
                            className="input-field"
                            placeholder="Filter by client, address, cleaner, or ID..."
                            style={{ width: '100%', paddingLeft: '34px', margin: 0, fontSize: '0.8125rem', paddingRight: '0.75rem' }}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Cleaner Filter */}
                    <select
                        value={cleanerFilter}
                        onChange={(e) => setCleanerFilter(e.target.value)}
                        style={{
                            padding: '0.45rem 0.65rem',
                            fontSize: '0.8125rem',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border)',
                            backgroundColor: '#FFFFFF',
                            color: 'var(--color-text-primary)',
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="all">All Cleaners</option>
                        {staffList.map(s => (
                            <option key={s.id} value={s.id}>{s.user?.name}</option>
                        ))}
                    </select>

                    {/* Status Filter */}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{
                            padding: '0.45rem 0.65rem',
                            fontSize: '0.8125rem',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border)',
                            backgroundColor: '#FFFFFF',
                            color: 'var(--color-text-primary)',
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="all">All Statuses</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="in_progress">In Progress</option>
                        <option value="pending">Pending</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                </div>

                {/* View Mode Toggle (Calendar vs List) */}
                <div style={{ display: 'flex', backgroundColor: 'var(--color-bg-subtle)', borderRadius: '6px', padding: '0.2rem', border: '1px solid var(--color-border)' }}>
                    <button
                        onClick={() => setViewMode('calendar')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.35rem 0.75rem',
                            fontSize: '0.8125rem',
                            fontWeight: viewMode === 'calendar' ? 600 : 500,
                            borderRadius: '4px',
                            border: 'none',
                            cursor: 'pointer',
                            backgroundColor: viewMode === 'calendar' ? '#FFFFFF' : 'transparent',
                            color: viewMode === 'calendar' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                            boxShadow: viewMode === 'calendar' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <CalendarDays size={14} />
                        <span>Calendar Grid</span>
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.35rem 0.75rem',
                            fontSize: '0.8125rem',
                            fontWeight: viewMode === 'list' ? 600 : 500,
                            borderRadius: '4px',
                            border: 'none',
                            cursor: 'pointer',
                            backgroundColor: viewMode === 'list' ? '#FFFFFF' : 'transparent',
                            color: viewMode === 'list' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                            boxShadow: viewMode === 'list' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <LayoutList size={14} />
                        <span>Table Ledger</span>
                    </button>
                </div>
            </div>

            {/* Main Content Area (Calendar Grid or Table Ledger) */}
            {viewMode === 'calendar' ? (
                <CalendarView
                    bookings={filteredBookings}
                    staffList={staffList}
                    clients={clients}
                    services={services}
                    onCreateBooking={fieldOnly ? () => undefined : openNewModalWithDate}
                    onEditBooking={fieldOnly ? () => undefined : handleEdit}
                    onDeleteBooking={fieldOnly ? () => undefined : (id) => setBookingToDelete(id)}
                />
            ) : (
                /* Table Ledger View */
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                            Dispatch Ledger
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
                            {filteredBookings.length} records matching filters
                        </span>
                    </div>

                    {filteredBookings.length === 0 ? (
                        <div style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
                            <Calendar size={32} color="var(--color-text-tertiary)" style={{ margin: '0 auto 0.75rem' }} />
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 0.25rem' }}>
                                No bookings found
                            </h3>
                            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.8125rem', margin: '0 0 1rem' }}>
                                Try resetting filters or create a new booking appointment.
                            </p>
                            {!fieldOnly && <button className="btn btn-primary" onClick={openNewModal} style={{ fontSize: '0.8125rem' }}>
                                <Plus size={14} style={{ marginRight: '0.25rem' }} /> Create Booking
                            </button>}
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: '#f5f5f7' }}>
                                        <th style={{ padding: '0.75rem 1.25rem', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Schedule</th>
                                        <th style={{ padding: '0.75rem 1.25rem', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Client</th>
                                        <th style={{ padding: '0.75rem 1.25rem', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Service</th>
                                        <th style={{ padding: '0.75rem 1.25rem', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Assigned Staff</th>
                                        <th style={{ padding: '0.75rem 1.25rem', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Location</th>
                                        <th style={{ padding: '0.75rem 1.25rem', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Price</th>
                                        <th style={{ padding: '0.75rem 1.25rem', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Status</th>
                                        <th style={{ padding: '0.75rem 1.25rem', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredBookings.map(b => {
                                        const client = getClient(b.clientId);
                                        const service = getService(b.serviceId);
                                        const cleaner = getCleaner(b.cleanerId);

                                        return (
                                            <tr key={b.id} style={{ borderBottom: '1px solid var(--color-border)' }} className="hover-bg-subtle">
                                                <td style={{ padding: '0.875rem 1.25rem' }}>
                                                    <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{b.date}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>{b.time}</div>
                                                </td>
                                                <td style={{ padding: '0.875rem 1.25rem' }}>
                                                    <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{client?.name || 'Guest'}</div>
                                                    <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>{client?.phone || 'No phone'}</div>
                                                </td>
                                                <td style={{ padding: '0.875rem 1.25rem', color: 'var(--color-text-primary)', fontWeight: 500 }}>
                                                    {service?.name || 'Standard Service'}
                                                </td>
                                                <td style={{ padding: '0.875rem 1.25rem' }}>
                                                    {cleaner ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                            <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 600 }}>
                                                                {cleaner.photo ? (
                                                                    <img src={cleaner.photo} alt={cleaner.user?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                ) : (
                                                                    cleaner.user?.name.charAt(0).toUpperCase()
                                                                )}
                                                            </div>
                                                            <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{cleaner.user?.name}</span>
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: '#d70015', fontWeight: 600, fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                                            <AlertTriangle size={12} /> Unassigned
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '0.875rem 1.25rem', color: 'var(--color-text-secondary)', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {b.address}
                                                </td>
                                                <td style={{ padding: '0.875rem 1.25rem' }}>
                                                    <div style={{ fontWeight: 700, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
                                                        {b.price.toFixed(2)} QAR
                                                    </div>
                                                    <div style={{ fontSize: '0.6875rem', color: b.paymentStatus === 'paid' ? '#248a3d' : '#d70015', fontWeight: 600 }}>
                                                        {b.paymentStatus}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '0.875rem 1.25rem' }}>
                                                    <span className={`badge badge-${b.status === 'completed' ? 'success' : b.status === 'in_progress' ? 'warning' : b.status === 'confirmed' ? 'primary' : b.status === 'cancelled' ? 'danger' : 'warning'}`}>
                                                        {b.status.replace('_', ' ').toUpperCase()}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.875rem 1.25rem', textAlign: 'right' }}>
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                        {b.status !== 'completed' && (
                                                            <button
                                                                onClick={() => handleQuickStatusChange(b.id, 'completed')}
                                                                style={{
                                                                    background: 'rgba(36, 138, 61, 0.1)',
                                                                    border: '1px solid rgba(36, 138, 61, 0.25)',
                                                                    borderRadius: '4px',
                                                                    padding: '0.25rem 0.45rem',
                                                                    color: '#248a3d',
                                                                    fontSize: '0.6875rem',
                                                                    fontWeight: 600,
                                                                    cursor: 'pointer'
                                                                }}
                                                                title="Mark as completed"
                                                            >
                                                                ✓ Complete
                                                            </button>
                                                        )}
                                                        {!fieldOnly && <><button
                                                            onClick={() => handleEdit(b)}
                                                            style={{
                                                                background: '#FFFFFF',
                                                                border: '1px solid var(--color-border)',
                                                                borderRadius: '4px',
                                                                padding: '0.3rem',
                                                                color: 'var(--color-text-secondary)',
                                                                cursor: 'pointer'
                                                            }}
                                                            title="Edit Booking"
                                                        >
                                                            <Edit2 size={13} />
                                                        </button>
                                                        <button
                                                            onClick={() => setBookingToDelete(b.id)}
                                                            style={{
                                                                background: '#FFFFFF',
                                                                border: '1px solid var(--color-border)',
                                                                borderRadius: '4px',
                                                                padding: '0.3rem',
                                                                color: '#d70015',
                                                                cursor: 'pointer'
                                                            }}
                                                            title="Delete Booking"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button></>}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Create & Edit Booking Modal */}
            {isModalOpen && (
                <div
                    className="sheet sheet-legacy" data-sheet
                >
                    <div
                        className="card"
                        style={{ width: '100%', maxWidth: '560px', padding: '1.75rem', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh', overflowY: 'auto' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div>
                                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
                                    {editingId ? 'Edit Booking Appointment' : 'Schedule New Booking'}
                                </h2>
                                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                                    Dispatch cleaning crew and configure service specifications.
                                </p>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--color-text-secondary)' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Message the client on WhatsApp: the first button follows the selected status */}
                        <div style={{ padding: '0.75rem', border: '1px solid var(--color-border)', borderRadius: '10px', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <button type="button" className="btn btn-primary" onClick={sendStatusMessage} disabled={!phoneDigits}
                                    style={{ fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <MessageCircle size={14} /> {STATUS_BUTTON[formData.status]}
                                </button>
                                <button type="button" className="btn btn-secondary" onClick={sendReminder} disabled={!phoneDigits || noReminder}
                                    title={noReminder ? 'Reminders are for upcoming bookings' : undefined}
                                    style={{ fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Bell size={14} /> Send reminder
                                </button>
                                <button type="button" className="btn btn-secondary" onClick={sendInvoice}
                                    disabled={!phoneDigits || !editingId || formData.status === 'cancelled'}
                                    title={!editingId ? 'Save the booking first' : formData.status === 'cancelled' ? 'This booking is cancelled' : undefined}
                                    style={{ fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <FileText size={14} /> Send invoice
                                </button>
                            </div>
                            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                                {phoneDigits ? 'Opens WhatsApp with the message ready. You press send there.' : 'Add the client\'s phone number to send messages on WhatsApp.'}
                            </div>
                            <details style={{ marginTop: '0.5rem' }}>
                                <summary style={{ cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Preview the message</summary>
                                <div style={{ marginTop: '0.5rem', padding: '0.75rem', borderRadius: 10, background: 'var(--color-bg-subtle)', fontSize: '0.8125rem', lineHeight: 1.55 }}>
                                    {statusPreview.split('\n').map((line, i) => <div key={i} dir="auto" style={{ minHeight: '1.55em' }}>{line}</div>)}
                                </div>
                                {!statusIsDefault && (
                                    <button type="button" className="btn btn-ghost btn-sm" onClick={useDefaultMessage} style={{ marginTop: '0.4rem', fontSize: '0.75rem' }}>
                                        Use the English + Arabic default for this message
                                    </button>
                                )}
                            </details>
                        </div>

                        <form onSubmit={handleSubmit}>
                            {/* Client Section */}
                            <div style={{ padding: '0.875rem', backgroundColor: 'var(--color-bg-subtle)', borderRadius: '8px', border: '1px solid var(--color-border)', marginBottom: '1rem' }}>
                                <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                                    Client Profile
                                </div>
                                <div className="input-group" style={{ marginBottom: '0.5rem' }}>
                                    <label className="input-label" style={{ fontSize: '0.75rem' }}>Select Existing Client</label>
                                    <select
                                        className="input-field"
                                        value={formData.clientId}
                                        onChange={(e) => handleClientSelect(e.target.value)}
                                        style={{ fontSize: '0.8125rem' }}
                                    >
                                        <option value="">-- Or enter new client details below --</option>
                                        {clients.map(c => (
                                            <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                    <div className="input-group" style={{ margin: 0 }}>
                                        <label className="input-label" style={{ fontSize: '0.75rem' }}>Client Name</label>
                                        <input
                                            type="text"
                                            className="input-field"
                                            required
                                            value={formData.clientName}
                                            onChange={e => setFormData({ ...formData, clientName: e.target.value })}
                                            placeholder="Client Full Name"
                                            style={{ fontSize: '0.8125rem' }}
                                        />
                                    </div>
                                    <div className="input-group" style={{ margin: 0 }}>
                                        <label className="input-label" style={{ fontSize: '0.75rem' }}>Phone Number</label>
                                        <input
                                            type="tel"
                                            className="input-field"
                                            required
                                            value={formData.clientPhone}
                                            onChange={e => setFormData({ ...formData, clientPhone: e.target.value })}
                                            placeholder="+974 5512 3456"
                                            style={{ fontSize: '0.8125rem' }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Service & Staff Selection */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                <div className="input-group">
                                    <label className="input-label">Service Package</label>
                                    <select
                                        className="input-field"
                                        value={formData.serviceId}
                                        onChange={e => handleServiceSelect(e.target.value)}
                                        required
                                        style={{ fontSize: '0.8125rem' }}
                                    >
                                        <option value="">-- Select Service --</option>
                                        {services.map(s => (
                                            <option key={s.id} value={s.id}>{s.name} ({s.price} QAR)</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Assigned Cleaner / Staff</label>
                                    <select
                                        className="input-field"
                                        value={formData.cleanerId}
                                        onChange={e => setFormData({ ...formData, cleanerId: e.target.value })}
                                        style={{ fontSize: '0.8125rem' }}
                                    >
                                        <option value="">-- No cleaner (Unassigned) --</option>
                                        {staffList.map(s => {
                                            const kept = !!cid && s.id !== formData.cleanerId && !!reservedMessage(live, cid, s.id, formData.date, formData.clientId || undefined, editingId ? bookings.find(b => b.id === editingId)?.subscriptionId : undefined);
                                            return <option key={s.id} value={s.id} disabled={kept}>{s.user?.name} ★ {s.rating.toFixed(1)}{kept ? ' (kept for a subscription)' : ''}</option>;
                                        })}
                                    </select>
                                </div>
                            </div>

                            {/* Date, Time & Pricing */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                <div className="input-group">
                                    <label className="input-label">Appointment Date</label>
                                    <input
                                        type="date"
                                        className="input-field"
                                        required
                                        value={formData.date}
                                        onChange={e => setFormData({ ...formData, date: e.target.value })}
                                        style={{ fontSize: '0.8125rem' }}
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Appointment Time</label>
                                    <input
                                        type="time"
                                        className="input-field"
                                        required
                                        value={formData.time}
                                        onChange={e => setFormData({ ...formData, time: e.target.value })}
                                        style={{ fontSize: '0.8125rem' }}
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Price (QAR)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        className="input-field"
                                        required
                                        value={formData.price}
                                        onChange={e => setFormData({ ...formData, price: Number(e.target.value) })}
                                        style={{ fontSize: '0.8125rem', fontFamily: 'var(--font-sans)' }}
                                    />
                                </div>
                            </div>

                            {/* Location Address */}
                            <div className="input-group">
                                <label className="input-label">Service Address / Residence</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    required
                                    value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    placeholder="e.g. Villa 24, Street 980, Al Waab, Doha"
                                    style={{ fontSize: '0.8125rem' }}
                                />
                            </div>

                            {/* Status & Payment Status */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div className="input-group">
                                    <label className="input-label">Booking Status</label>
                                    <select
                                        className="input-field"
                                        value={formData.status}
                                        onChange={e => setFormData({ ...formData, status: e.target.value as BookingStatus })}
                                        style={{ fontSize: '0.8125rem' }}
                                    >
                                        <option value="confirmed">Confirmed</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="pending">Pending</option>
                                        <option value="completed">Completed</option>
                                        <option value="cancelled">Cancelled</option>
                                    </select>
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Payment Status</label>
                                    <select
                                        className="input-field"
                                        value={formData.paymentStatus}
                                        onChange={e => setFormData({ ...formData, paymentStatus: e.target.value as PaymentStatus })}
                                        style={{ fontSize: '0.8125rem' }}
                                    >
                                        <option value="unpaid">Unpaid</option>
                                        <option value="paid">Paid</option>
                                        <option value="overdue">Overdue</option>
                                    </select>
                                </div>
                            </div>

                            {/* Submit & Cancel Buttons */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setIsModalOpen(false)}
                                    style={{ fontSize: '0.8125rem' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    style={{ fontSize: '0.8125rem' }}
                                >
                                    {editingId ? 'Save Booking Changes' : 'Confirm & Schedule Booking'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {bookingToDelete && (
                <div className="dialog-back">
                    <div className="card" style={{ width: '100%', maxWidth: '420px', padding: '1.75rem', boxShadow: 'var(--shadow-lg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'rgba(215, 0, 21, 0.1)', color: '#d70015', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <AlertTriangle size={18} />
                            </div>
                            <div>
                                <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
                                    Cancel Booking
                                </h2>
                                <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                    This appointment will be permanently removed from schedule.
                                </p>
                            </div>
                        </div>
                        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.8125rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                            Are you sure you want to delete this booking appointment? Any assigned cleaners will be released from this time slot.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setBookingToDelete(null)}
                                style={{ fontSize: '0.8125rem' }}
                            >
                                Keep Booking
                            </button>
                            <button
                                type="button"
                                className="btn"
                                style={{ backgroundColor: '#d70015', color: 'white', fontSize: '0.8125rem', padding: '0.55rem 1rem' }}
                                onClick={() => handleDeleteBooking(bookingToDelete)}
                            >
                                Delete Appointment
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
