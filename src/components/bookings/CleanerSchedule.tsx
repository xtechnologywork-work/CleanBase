import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { Booking } from '../../types';
import { ChevronLeft, ChevronRight, XCircle, MapPin, Clock, CalendarDays, Calendar as CalendarIcon, User, Briefcase, CreditCard, Repeat } from 'lucide-react';
import { getDB } from '../../services/mockDb';

interface Props {
    cleanerId: string;
    cleanerName: string;
    bookings: Booking[];
    onClose: () => void;
}

const formatLocalDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

export const CleanerSchedule: React.FC<Props> = ({ cleanerId, cleanerName, bookings, onClose }) => {
    const [viewDate, setViewDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<'day' | 'week'>('week');
    const [currentTime, setCurrentTime] = useState(new Date());
    const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
    const [mockData, setMockData] = useState<{ clients: any[], services: any[], subscriptions: any[] }>({ clients: [], services: [], subscriptions: [] });
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const db = getDB();
        setMockData({ clients: db.clients, services: db.services, subscriptions: db.subscriptions || [] });
    }, []);

    // Update current time every minute for the red line
    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    // Initial scroll to 7 AM
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 7 * 60; // 60px per hour
        }
    }, [viewMode]);

    const cleanerBookings = useMemo(() => bookings.filter(b => b.cleanerId === cleanerId), [bookings, cleanerId]);
    const cleanerSubscriptions = useMemo(() => {
        return (mockData.subscriptions || []).filter((s: any) => s.cleanerId === cleanerId);
    }, [mockData.subscriptions, cleanerId]);

    const changeDate = (amount: number) => {
        const newDate = new Date(viewDate);
        if (viewMode === 'day') {
            newDate.setDate(newDate.getDate() + amount);
        } else {
            newDate.setDate(newDate.getDate() + (amount * 7));
        }
        setViewDate(newDate);
    };

    const setToday = () => setViewDate(new Date());

    // Generate days depending on view
    const daysToShow = useMemo(() => {
        if (viewMode === 'day') {
            return [viewDate];
        }

        // Week view: Find Sunday of current week
        const day = viewDate.getDay();
        const diff = viewDate.getDate() - day; // Sunday start
        const week = [];
        for (let i = 0; i < 7; i++) {
            const nextDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), diff + i, 12, 0, 0);
            week.push(nextDay);
        }
        return week;
    }, [viewDate, viewMode]);

    const formatHour = (hour: number) => {
        if (hour === 0) return '12 AM';
        if (hour === 12) return '12 PM';
        return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
    };

    const displayDateRange = useMemo(() => {
        if (viewMode === 'day') {
            return viewDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        }
        const start = daysToShow[0];
        const end = daysToShow[6];
        if (start.getMonth() === end.getMonth()) {
            return `${start.toLocaleDateString('en-US', { month: 'long' })} ${start.getDate()} - ${end.getDate()}, ${start.getFullYear()}`;
        }
        return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }, [viewDate, viewMode, daysToShow]);

    // Assuming 2 hours per booking for visualization if not specified
    const getBookingStyle = (booking: Booking, leftOffset: string, width: string) => {
        const [h, m] = booking.time.split(':').map(Number);
        const top = (h * 60 + m); // 60px per hour

        // Find the service duration to accurately size the block
        let height = 120; // 2 hours = 120px default fallback
        const service = mockData.services.find(s => s.id === booking.serviceId);
        if (service && service.durationMinutes) {
            height = service.durationMinutes; // 1 pixel = 1 minute because 60px = 60 mins
        }

        let bgColor = '#0066cc'; // default blue
        if (booking.status === 'completed') bgColor = '#248a3d'; // green
        if (booking.status === 'in_progress') bgColor = '#ff9f0a'; // amber
        if (booking.status === 'cancelled') bgColor = '#d70015'; // red

        return {
            top: `${top}px`,
            height: `${height}px`,
            backgroundColor: bgColor,
            left: leftOffset,
            width: width,
        };
    };

    const hours = Array.from({ length: 24 }, (_, i) => i);

    const isToday = (d: Date) => {
        const today = new Date();
        return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    };

    // Calculate current time line position
    const currentTimeTop = (currentTime.getHours() * 60) + currentTime.getMinutes();

    return (
        <div className="sheet sheet-legacy sheet-fill" data-sheet onClick={onClose}>
            <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '1200px', backgroundColor: 'var(--color-bg-body)', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '90vh', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <div>
                            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.25rem', color: '#1d1d1f' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#e8f1fb', color: '#0066cc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Clock size={18} />
                                </div>
                                {cleanerName}'s Schedule
                            </h2>
                        </div>

                        <div style={{ display: 'flex', backgroundColor: '#f5f5f7', borderRadius: '8px', padding: '0.25rem' }}>
                            <button
                                onClick={() => setViewMode('day')}
                                style={{ padding: '0.4rem 1rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: viewMode === 'day' ? '#fff' : 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', boxShadow: viewMode === 'day' ? '0 1px 2px 0 rgba(0,0,0,0.2)' : 'none', fontWeight: viewMode === 'day' ? 600 : 500, color: viewMode === 'day' ? '#0066cc' : '#6e6e73' }}
                            >
                                <CalendarIcon size={14} /> Day
                            </button>
                            <button
                                onClick={() => setViewMode('week')}
                                style={{ padding: '0.4rem 1rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: viewMode === 'week' ? '#fff' : 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', boxShadow: viewMode === 'week' ? '0 1px 2px 0 rgba(0,0,0,0.2)' : 'none', fontWeight: viewMode === 'week' ? 600 : 500, color: viewMode === 'week' ? '#0066cc' : '#6e6e73' }}
                            >
                                <CalendarDays size={14} /> Week
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <button onClick={setToday} style={{ padding: '0.4rem 1rem', borderRadius: '4px', fontWeight: 600, fontSize: '0.875rem', background: 'transparent', border: '1px solid #d2d2d7', cursor: 'pointer', color: '#1d1d1f' }}>Today</button>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                                <button onClick={() => changeDate(-1)} style={{ padding: '0.4rem', borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', color: '#6e6e73' }} className="hover-bg-subtle"><ChevronLeft size={18} /></button>
                                <button onClick={() => changeDate(1)} style={{ padding: '0.4rem', borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', color: '#6e6e73' }} className="hover-bg-subtle"><ChevronRight size={18} /></button>
                            </div>
                            <div style={{ fontWeight: 400, fontSize: '1.375rem', color: '#1d1d1f', minWidth: '200px' }}>
                                {displayDateRange}
                            </div>
                        </div>

                        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6e6e73', padding: '0.5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="hover-bg-subtle">
                            <XCircle size={24} />
                        </button>
                    </div>
                </div>

                {/* Assigned Recurring Contracts Banner */}
                {cleanerSubscriptions.length > 0 && (
                    <div style={{ padding: '0.625rem 1.5rem', backgroundColor: '#f5f5f7', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                            <Repeat size={13} />
                            <span>Recurring Client Contracts ({cleanerSubscriptions.length}):</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {cleanerSubscriptions.map((sub: any) => {
                                const client = mockData.clients.find((c: any) => c.id === sub.clientId);
                                const service = mockData.services.find((s: any) => s.id === sub.serviceId);
                                return (
                                    <div key={sub.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.5rem', backgroundColor: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '0.75rem' }}>
                                        <strong style={{ color: 'var(--color-text-primary)' }}>{client?.name || 'Client'}</strong>
                                        <span style={{ color: 'var(--color-text-secondary)' }}>• {service?.name || 'Cleaning'}</span>
                                        <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)', textTransform: 'capitalize' }}>({sub.frequency})</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Days Header Grid (for Week view or single day) */}
                <div style={{ display: 'flex', borderBottom: '1px solid #d2d2d7', backgroundColor: '#ffffff', paddingLeft: '60px' }}>
                    {daysToShow.map((day, i) => (
                        <div key={i} style={{ flex: 1, textAlign: 'center', padding: '1rem 0', borderLeft: i > 0 || viewMode === 'day' ? '1px solid #d2d2d7' : 'none' }}>
                            <div style={{ fontSize: '0.6875rem', color: isToday(day) ? '#0066cc' : '#6e6e73', fontWeight: 500, marginBottom: '0.25rem' }}>
                                {day.toLocaleDateString('en-US', { weekday: 'short' })}
                            </div>
                            <div style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: '46px', height: '46px', borderRadius: '50%',
                                backgroundColor: isToday(day) ? '#0066cc' : 'transparent',
                                color: isToday(day) ? '#ffffff' : '#1d1d1f',
                                fontSize: '1.625rem', fontWeight: 400
                            }}>
                                {day.getDate()}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Calendar Body (Scrollable) */}
                <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', position: 'relative', backgroundColor: '#ffffff', scrollBehavior: 'smooth' }}>
                    {/* Time Grid Wrapper */}
                    <div style={{ display: 'flex', position: 'relative', minHeight: `${24 * 60}px` }}>

                        {/* Time Labels Column */}
                        <div style={{ width: '60px', flexShrink: 0, position: 'relative' }}>
                            {hours.map(hour => (
                                <div key={hour} style={{ height: '60px', position: 'relative' }}>
                                    {hour > 0 && (
                                        <span style={{ position: 'absolute', right: '12px', top: '-8px', fontSize: '0.625rem', color: '#6e6e73', fontWeight: 500 }}>
                                            {formatHour(hour)}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Days Columns */}
                        <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
                            {daysToShow.map((day, dayIndex) => {
                                const dateStr = formatLocalDate(day);
                                const dayBookings = cleanerBookings.filter(b => b.date === dateStr);

                                return (
                                    <div key={dayIndex} style={{ flex: 1, position: 'relative', borderLeft: '1px solid #d2d2d7' }}>

                                        {/* Horizontal Grid lines */}
                                        {hours.map(hour => (
                                            <div key={hour} style={{ position: 'absolute', top: `${hour * 60}px`, left: 0, right: 0, height: '1px', backgroundColor: '#d2d2d7', opacity: 0.5 }}></div>
                                        ))}

                                        {/* Current Time Line */}
                                        {isToday(day) && (
                                            <div style={{ position: 'absolute', top: `${currentTimeTop}px`, left: 0, right: 0, height: '2px', backgroundColor: '#d70015', zIndex: 20 }}>
                                                <div style={{ position: 'absolute', left: '-6px', top: '-4px', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#d70015' }}></div>
                                            </div>
                                        )}

                                        {/* Bookings Blocks */}
                                        {dayBookings.map(booking => {
                                            const style = getBookingStyle(booking, '4px', 'calc(100% - 12px)');
                                            return (
                                                <div key={booking.id} style={{
                                                    position: 'absolute',
                                                    ...style,
                                                    borderRadius: '4px',
                                                    padding: '0.4rem 0.6rem',
                                                    color: 'white',
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                                    border: '1px solid rgba(0,0,0,0.1)',
                                                    overflow: 'hidden',
                                                    zIndex: 10,
                                                    cursor: 'pointer',
                                                    transition: 'filter 0.2s, transform 0.1s',
                                                    transform: selectedBooking?.id === booking.id ? 'scale(0.98)' : 'scale(1)'
                                                }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedBooking(booking);
                                                    }}
                                                    onMouseOver={(e) => e.currentTarget.style.filter = 'brightness(1.1)'}
                                                    onMouseOut={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                                                    title={`${booking.time} - ${booking.address}`}
                                                >
                                                    <div style={{ fontWeight: 500, fontSize: '0.75rem', marginBottom: '2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', lineHeight: 1.2 }}>
                                                        <span>{booking.time}</span>
                                                    </div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: '2px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                        {booking.status.replace('_', ' ').toUpperCase()}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', opacity: 0.9, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                        {booking.address}
                                                    </div>
                                                </div>
                                            );
                                        })}

                                    </div>
                                );
                            })}
                        </div>

                    </div>
                </div>

            </div>

            {/* Selected Booking Modal */}
            {selectedBooking && (
                <div className="dialog-back" onClick={(e) => { e.stopPropagation(); setSelectedBooking(null); }}>
                    <div className="animate-fade-in" style={{ width: '100%', maxWidth: '420px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid #e8e8ed', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', backgroundColor: '#f5f5f7' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1d1d1f', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: selectedBooking.status === 'completed' ? '#248a3d' : selectedBooking.status === 'in_progress' ? '#ff9f0a' : selectedBooking.status === 'cancelled' ? '#d70015' : '#0066cc' }}></span>
                                    {selectedBooking.status.replace('_', ' ').toUpperCase()}
                                </h3>
                                <p style={{ margin: '0.25rem 0 0', color: '#6e6e73', fontSize: '0.875rem' }}>{selectedBooking.date} • {selectedBooking.time}</p>
                            </div>
                            <button onClick={() => setSelectedBooking(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#86868b', padding: '0.25rem' }} className="hover-bg-subtle">
                                <XCircle size={20} />
                            </button>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                <User size={18} color="#6e6e73" style={{ marginTop: '0.125rem' }} />
                                <div>
                                    <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1d1d1f' }}>Client Details</div>
                                    <div style={{ fontSize: '0.875rem', color: '#515154', marginTop: '0.25rem' }}>
                                        {mockData.clients.find(c => c.id === selectedBooking.clientId)?.name || 'Guest User'}<br />
                                        <a href={`tel:${mockData.clients.find(c => c.id === selectedBooking.clientId)?.phone}`} style={{ color: '#0066cc', textDecoration: 'none' }}>{mockData.clients.find(c => c.id === selectedBooking.clientId)?.phone || 'No phone provided'}</a>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                <MapPin size={18} color="#6e6e73" style={{ marginTop: '0.125rem' }} />
                                <div>
                                    <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1d1d1f' }}>Location</div>
                                    <div style={{ fontSize: '0.875rem', color: '#515154', marginTop: '0.25rem', lineHeight: 1.4 }}>
                                        {selectedBooking.address}
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem', paddingTop: '1.25rem', borderTop: '1px solid #e8e8ed' }}>
                                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                    <Briefcase size={16} color="#6e6e73" />
                                    <div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6e6e73' }}>Service</div>
                                        <div style={{ fontSize: '0.875rem', color: '#1d1d1f', marginTop: '0.125rem', fontWeight: 500 }}>
                                            {mockData.services.find(s => s.id === selectedBooking.serviceId)?.name || 'Standard Cleaning'}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                    <CreditCard size={16} color="#6e6e73" />
                                    <div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6e6e73' }}>Payment</div>
                                        <div style={{ fontSize: '0.875rem', color: '#1d1d1f', marginTop: '0.125rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            ${selectedBooking.price.toFixed(2)}
                                            <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '1rem', backgroundColor: selectedBooking.paymentStatus === 'paid' ? '#dff3e4' : '#fbd5d3', color: selectedBooking.paymentStatus === 'paid' ? '#166534' : '#a30011', fontWeight: 700, marginLeft: '0.25rem' }}>
                                                {selectedBooking.paymentStatus.toUpperCase()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
