import React, { useState, useMemo } from 'react';
import type { Booking, Staff, User, Client, Service } from '../../types';
import {
    ChevronLeft, ChevronRight, UserCheck, Plus, MapPin, AlertTriangle, Filter,
    Phone, Trash2, Edit2, X
} from 'lucide-react';

interface CalendarViewProps {
    bookings: Booking[];
    staffList: (Staff & { user: User })[];
    clients: Client[];
    services: Service[];
    onCreateBooking?: (dateStr: string) => void;
    onEditBooking?: (booking: Booking) => void;
    onDeleteBooking?: (bookingId: string) => void;
}

/** The short state word on a calendar chip (translated with the rest of the dashboard). */
const STATUS_SHORT: Record<string, string> = { pending: 'Pending', confirmed: 'Confirmed', in_progress: 'In Progress', completed: 'Done', cancelled: 'Cancelled' };

const formatLocalDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

export const CalendarView: React.FC<CalendarViewProps> = ({
    bookings,
    clients,
    staffList,
    services,
    onCreateBooking,
    onEditBooking,
    onDeleteBooking
}) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
    const [cleanerFilter, setCleanerFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');

    const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    // Monday-based week start (0 = Mon, 6 = Sun)
    const getFirstDayOfMonth = (date: Date) => {
        const day = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
        return day === 0 ? 6 : day - 1;
    };

    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    const setToday = () => setCurrentDate(new Date());

    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);

    const getClient = (id: string) => clients.find(c => c.id === id);
    const getCleaner = (id?: string) => staffList.find(s => s.id === id);
    const getService = (id: string) => services.find(s => s.id === id);

    const formatDuration = (minutes: number) => {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        if (h > 0 && m > 0) return `${h}h ${m}m`;
        if (h > 0) return `${h}h`;
        return `${m}m`;
    };

    // Filter bookings based on cleaner and status filters
    const filteredBookings = useMemo(() => {
        return bookings.filter(b => {
            if (cleanerFilter !== 'all' && b.cleanerId !== cleanerFilter) return false;
            if (statusFilter !== 'all' && b.status !== statusFilter) return false;
            return true;
        });
    }, [bookings, cleanerFilter, statusFilter]);

    // Monthly analytics
    const monthFilterPrefix = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
    const monthlyBookings = filteredBookings.filter(b => b.date.startsWith(monthFilterPrefix));
    const unassignedCount = monthlyBookings.filter(b => !b.cleanerId && b.status !== 'cancelled').length;
    const monthlyRevenue = monthlyBookings.reduce((sum, b) => {
        if (b.status !== 'cancelled') return sum + (b.price || 0);
        return sum;
    }, 0);

    const getStatusTheme = (status: Booking['status']) => {
        switch (status) {
            case 'completed':
                return { bg: 'rgba(36, 138, 61, 0.08)', color: '#248a3d', border: '#a5e0b3', label: 'Completed' };
            case 'in_progress':
                return { bg: 'rgba(0, 102, 204, 0.08)', color: '#0066cc', border: '#2997ff', label: 'In Progress' };
            case 'confirmed':
                return { bg: 'rgba(99, 102, 241, 0.08)', color: '#0066cc', border: '#c6dcf3', label: 'Confirmed' };
            case 'pending':
                return { bg: 'rgba(217, 119, 6, 0.08)', color: '#b25000', border: '#fbe3b0', label: 'Pending' };
            case 'cancelled':
                return { bg: 'rgba(215, 0, 21, 0.08)', color: '#d70015', border: '#f6bdb9', label: 'Cancelled' };
            default:
                return { bg: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)', border: 'var(--color-border)', label: status };
        }
    };

    const handleDayClick = (dateStr: string) => {
        if (onCreateBooking) {
            onCreateBooking(dateStr);
        }
    };

    const handleBookingClick = (e: React.MouseEvent, booking: Booking) => {
        e.stopPropagation();
        setSelectedBooking(booking);
    };

    const todayStr = formatLocalDate(new Date());

    const renderDays = () => {
        const cells = [];
        const monthFilter = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

        // Previous month filler days
        const prevMonthDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
        const prevMonthDays = prevMonthDate.getDate();
        for (let i = firstDay - 1; i >= 0; i--) {
            const dayNum = prevMonthDays - i;
            cells.push(
                <div
                    key={`prev-${dayNum}`}
                    style={{
                        minHeight: '140px',
                        backgroundColor: '#f5f5f7',
                        borderRight: '1px solid var(--color-border)',
                        borderBottom: '1px solid var(--color-border)',
                        padding: '0.625rem',
                        opacity: 0.45,
                        pointerEvents: 'none'
                    }}
                >
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
                        {dayNum}
                    </span>
                </div>
            );
        }

        // Current month days
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${monthFilter}-${String(d).padStart(2, '0')}`;
            const dayBookings = filteredBookings.filter(b => b.date === dateStr).sort((a, b) => a.time.localeCompare(b.time));
            const isToday = dateStr === todayStr;

            cells.push(
                <div
                    key={dateStr}
                    onClick={() => handleDayClick(dateStr)}
                    className="calendar-day-cell hover-bg-subtle"
                    style={{
                        minHeight: '140px',
                        backgroundColor: isToday ? 'rgba(15, 23, 42, 0.02)' : '#FFFFFF',
                        borderRight: '1px solid var(--color-border)',
                        borderBottom: '1px solid var(--color-border)',
                        padding: '0.625rem',
                        display: 'flex',
                        flexDirection: 'column',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'background-color 0.15s ease'
                    }}
                    title={`Click to add a booking on ${dateStr}`}
                >
                    {/* Day Cell Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <div style={{
                                width: '26px',
                                height: '26px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.8125rem',
                                fontWeight: 700,
                                fontFamily: 'var(--font-sans)',
                                backgroundColor: isToday ? '#1d1d1f' : 'transparent',
                                color: isToday ? '#FFFFFF' : 'var(--color-text-primary)'
                            }}>
                                {d}
                            </div>
                            {isToday && (
                                <span style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                                    Today
                                </span>
                            )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            {dayBookings.length > 0 && (
                                <span style={{
                                    fontSize: '0.6875rem',
                                    fontWeight: 700,
                                    fontFamily: 'var(--font-sans)',
                                    padding: '0.1rem 0.35rem',
                                    borderRadius: '4px',
                                    backgroundColor: 'var(--color-bg-subtle)',
                                    border: '1px solid var(--color-border)',
                                    color: 'var(--color-text-secondary)'
                                }}>
                                    {dayBookings.length}
                                </span>
                            )}
                            {/* Hover Plus Button Cue */}
                            <div
                                className="day-add-btn"
                                style={{
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: 'var(--color-bg-subtle)',
                                    color: 'var(--color-text-secondary)'
                                }}
                                title="Add Booking"
                            >
                                <Plus size={12} />
                            </div>
                        </div>
                    </div>

                    {/* Bookings Stack in Day Cell */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', flex: 1, overflowY: 'auto' }}>
                        {dayBookings.map(b => {
                            const client = getClient(b.clientId);
                            const cleaner = getCleaner(b.cleanerId);
                            const service = getService(b.serviceId);
                            const theme = getStatusTheme(b.status);

                            return (
                                <div
                                    key={b.id}
                                    onClick={(e) => handleBookingClick(e, b)}
                                    style={{
                                        padding: '0.35rem 0.5rem',
                                        backgroundColor: '#FFFFFF',
                                        borderRadius: '6px',
                                        border: `1px solid ${theme.border}`,
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                                        position: 'relative',
                                        cursor: 'pointer',
                                        transition: 'transform 0.1s ease, box-shadow 0.1s ease',
                                        overflow: 'hidden'
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                                    onMouseOut={(e) => e.currentTarget.style.transform = 'none'}
                                    title={`${b.time} - ${client?.name || 'Client'}: ${service?.name || 'Cleaning'}`}
                                >
                                    {/* Left Accent Stripe */}
                                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px', backgroundColor: theme.color }} />

                                    <div style={{ paddingLeft: '0.25rem' }}>
                                        {/* Time & Price */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.15rem' }}>
                                            <span style={{ fontSize: '0.6875rem', fontWeight: 700, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
                                                {b.time}
                                            </span>
                                            <span style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>
                                                {b.price.toFixed(0)} QAR
                                            </span>
                                        </div>

                                        {/* Client Name */}
                                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {client?.name || 'Guest Client'}
                                        </div>

                                        {/* Cleaner Assignment indicator */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.2rem', fontSize: '0.65rem' }}>
                                            {cleaner ? (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: 'var(--color-text-secondary)', maxWidth: '90px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    <UserCheck size={10} color="#248a3d" />
                                                    {cleaner.user?.name}
                                                </span>
                                            ) : (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: '#d70015', fontWeight: 600 }}>
                                                    <AlertTriangle size={10} /> Unassigned
                                                </span>
                                            )}

                                            <span style={{
                                                fontSize: '0.5625rem',
                                                fontWeight: 700,
                                                padding: '0.05rem 0.25rem',
                                                borderRadius: '3px',
                                                backgroundColor: theme.bg,
                                                color: theme.color
                                            }}>
                                                {STATUS_SHORT[b.status] || b.status}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        }

        // Next month filler days to complete grid (up to 35 or 42 cells)
        const totalRendered = firstDay + daysInMonth;
        const remaining = (7 - (totalRendered % 7)) % 7;
        for (let i = 1; i <= remaining; i++) {
            cells.push(
                <div
                    key={`next-${i}`}
                    style={{
                        minHeight: '140px',
                        backgroundColor: '#f5f5f7',
                        borderRight: '1px solid var(--color-border)',
                        borderBottom: '1px solid var(--color-border)',
                        padding: '0.625rem',
                        opacity: 0.45,
                        pointerEvents: 'none'
                    }}
                >
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
                        {i}
                    </span>
                </div>
            );
        }

        return cells;
    };

    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}>
            {/* Top Calendar Toolbar */}
            <div style={{
                padding: '1rem 1.5rem',
                borderBottom: '1px solid var(--color-border)',
                backgroundColor: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem'
            }}>
                {/* Month Navigator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <button
                            onClick={prevMonth}
                            style={{
                                background: '#FFFFFF',
                                border: '1px solid var(--color-border)',
                                borderRadius: '6px',
                                padding: '0.4rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--color-text-primary)'
                            }}
                            title="Previous Month"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button
                            onClick={setToday}
                            style={{
                                background: '#FFFFFF',
                                border: '1px solid var(--color-border)',
                                borderRadius: '6px',
                                padding: '0.4rem 0.75rem',
                                fontSize: '0.8125rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                color: 'var(--color-text-primary)'
                            }}
                        >
                            Today
                        </button>
                        <button
                            onClick={nextMonth}
                            style={{
                                background: '#FFFFFF',
                                border: '1px solid var(--color-border)',
                                borderRadius: '6px',
                                padding: '0.4rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--color-text-primary)'
                            }}
                            title="Next Month"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
                            {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </h2>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
                            ({monthlyBookings.length} scheduled)
                        </span>
                    </div>
                </div>

                {/* Filter Controls (Cleaner & Status) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {/* Unassigned Warning Pill */}
                    {unassignedCount > 0 && (
                        <div style={{
                            padding: '0.35rem 0.65rem',
                            borderRadius: '6px',
                            backgroundColor: 'rgba(215, 0, 21, 0.1)',
                            border: '1px solid rgba(215, 0, 21, 0.25)',
                            color: '#d70015',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                        }}>
                            <AlertTriangle size={13} />
                            <span>{unassignedCount} Needs Dispatch</span>
                        </div>
                    )}

                    {/* Estimated Month Revenue */}
                    <div style={{
                        padding: '0.35rem 0.65rem',
                        borderRadius: '6px',
                        backgroundColor: 'var(--color-bg-subtle)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        fontFamily: 'var(--font-sans)'
                    }}>
                        {monthlyRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} QAR Est.
                    </div>

                    {/* Filter by Cleaner */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Filter size={13} color="var(--color-text-tertiary)" />
                        <select
                            value={cleanerFilter}
                            onChange={(e) => setCleanerFilter(e.target.value)}
                            style={{
                                padding: '0.35rem 0.65rem',
                                fontSize: '0.75rem',
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
                    </div>

                    {/* Filter by Status */}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{
                            padding: '0.35rem 0.65rem',
                            fontSize: '0.75rem',
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
            </div>

            {/* Calendar Day Column Headers (Mon-Sun) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', backgroundColor: '#f5f5f7', borderBottom: '1px solid var(--color-border)' }}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                    <div
                        key={day}
                        style={{
                            padding: '0.625rem 0.5rem',
                            textAlign: 'center',
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            color: 'var(--color-text-secondary)',
                            borderRight: '1px solid var(--color-border)'
                        }}
                    >
                        {day}
                    </div>
                ))}
            </div>

            {/* Calendar Cells Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', backgroundColor: '#FFFFFF' }}>
                {renderDays()}
            </div>

            {/* Clicked Booking Details Drawer / Modal */}
            {selectedBooking && (
                <div
                    className="sheet sheet-legacy" data-sheet
                >
                    <div
                        className="card"
                        style={{ width: '100%', maxWidth: '520px', padding: '1.75rem', boxShadow: 'var(--shadow-lg)' }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--color-border)' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
                                        Booking #{selectedBooking.id}
                                    </h2>
                                    <span style={{
                                        fontSize: '0.6875rem',
                                        fontWeight: 700,
                                        padding: '0.2rem 0.5rem',
                                        borderRadius: '4px',
                                        backgroundColor: getStatusTheme(selectedBooking.status).bg,
                                        color: getStatusTheme(selectedBooking.status).color,
                                        border: `1px solid ${getStatusTheme(selectedBooking.status).border}`
                                    }}>
                                        {getStatusTheme(selectedBooking.status).label}
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginTop: '0.2rem' }}>
                                    Scheduled for {new Date(selectedBooking.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })} at {selectedBooking.time}
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedBooking(null)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--color-text-secondary)' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Client & Address Info */}
                            <div style={{ padding: '0.875rem 1rem', backgroundColor: 'var(--color-bg-subtle)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                                <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.35rem' }}>
                                    Client & Service Location
                                </div>
                                <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '0.25rem' }}>
                                    {getClient(selectedBooking.clientId)?.name || 'Guest Client'}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>
                                    <Phone size={12} color="var(--color-text-tertiary)" />
                                    <span style={{ fontFamily: 'var(--font-sans)' }}>{getClient(selectedBooking.clientId)?.phone || 'No phone'}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                    <MapPin size={12} color="var(--color-text-tertiary)" style={{ marginTop: '2px', flexShrink: 0 }} />
                                    <span>{selectedBooking.address}</span>
                                </div>
                            </div>

                            {/* Service & Cleaner Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div style={{ padding: '0.875rem', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>
                                        Service Package
                                    </div>
                                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '0.2rem' }}>
                                        {getService(selectedBooking.serviceId)?.name || 'Standard Service'}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.15rem' }}>
                                        Est. {getService(selectedBooking.serviceId) ? formatDuration(getService(selectedBooking.serviceId)!.durationMinutes) : '2h'}
                                    </div>
                                </div>

                                <div style={{ padding: '0.875rem', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>
                                        Assigned Staff
                                    </div>
                                    {getCleaner(selectedBooking.cleanerId) ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                                            <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 600 }}>
                                                {getCleaner(selectedBooking.cleanerId)?.user?.name?.charAt(0).toUpperCase()}
                                            </div>
                                            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                                {getCleaner(selectedBooking.cleanerId)?.user?.name}
                                            </span>
                                        </div>
                                    ) : (
                                        <div style={{ color: '#d70015', fontSize: '0.8125rem', fontWeight: 600, marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                            <AlertTriangle size={13} />
                                            <span>Unassigned</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Billing & Rate */}
                            <div style={{ padding: '0.875rem 1rem', border: '1px solid var(--color-border)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>
                                        Total Amount
                                    </div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
                                        {selectedBooking.price.toFixed(2)} QAR
                                    </div>
                                </div>
                                <span style={{
                                    fontSize: '0.6875rem',
                                    fontWeight: 700,
                                    padding: '0.2rem 0.5rem',
                                    borderRadius: '4px',
                                    backgroundColor: selectedBooking.paymentStatus === 'paid' ? 'rgba(36, 138, 61, 0.1)' : 'rgba(215, 0, 21, 0.1)',
                                    color: selectedBooking.paymentStatus === 'paid' ? '#248a3d' : '#d70015',
                                    border: `1px solid ${selectedBooking.paymentStatus === 'paid' ? 'rgba(36, 138, 61, 0.2)' : 'rgba(215, 0, 21, 0.2)'}`
                                }}>
                                    {selectedBooking.paymentStatus.toUpperCase()}
                                </span>
                            </div>

                            {/* Modal Footer Controls */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--color-border)', marginTop: '0.5rem' }}>
                                {onDeleteBooking ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const id = selectedBooking.id;
                                            setSelectedBooking(null);
                                            onDeleteBooking(id);
                                        }}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#d70015',
                                            fontSize: '0.8125rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.35rem',
                                            padding: 0
                                        }}
                                    >
                                        <Trash2 size={13} />
                                        <span>Cancel Job</span>
                                    </button>
                                ) : <div />}

                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    {onEditBooking && (
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            onClick={() => {
                                                const b = selectedBooking;
                                                setSelectedBooking(null);
                                                onEditBooking(b);
                                            }}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8125rem' }}
                                        >
                                            <Edit2 size={13} />
                                            <span>Edit Booking</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
