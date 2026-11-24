import React, { useState } from 'react';
import { getDB, saveDB } from '../../services/mockDb';
import type { Booking, Client } from '../../types';
import { Calendar, CreditCard, User, LogOut, CheckCircle2 } from 'lucide-react';
import { ChatWidget } from '../../components/shared/ChatWidget';
import { useNavigate } from 'react-router-dom';
import { isCloud } from '../../services/backend';
import { CloudPortal } from './CloudPortal';

const LocalPortal: React.FC = () => {
    // Demo mode only: shows the first client of this browser (the online portal signs the client in by phone)
    const [client, setClient] = useState<Client | null>(() => getDB().clients[0] || null);
    const [bookings, setBookings] = useState<Booking[]>(() => { const db = getDB(); const c = db.clients[0]; return c ? db.bookings.filter(b => b.clientId === c.id) : []; });
    const navigate = useNavigate();

    const payInvoice = (bookingId: string) => {
        const db = getDB();
        const bIdx = db.bookings.findIndex(b => b.id === bookingId);
        if (bIdx !== -1) {
            db.bookings[bIdx].paymentStatus = 'paid';

            // Re-calculate client total spent
            const cIdx = db.clients.findIndex(c => c.id === client?.id);
            if (cIdx !== -1) {
                db.clients[cIdx].totalSpent = (db.clients[cIdx].totalSpent || 0) + db.bookings[bIdx].price;
                setClient({ ...db.clients[cIdx] });
            }
            saveDB(db);
            setBookings([...db.bookings.filter(b => b.clientId === client?.id)]);
        }
    };

    if (!client) {
        return (
            <div style={{ padding: '4rem', textAlign: 'center' }}>
                <div style={{ maxWidth: '400px', margin: '0 auto', padding: '2rem' }} className="card">
                    <h2>No Client Profile Found</h2>
                    <p>Please log in with a valid customer account or book a service first.</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg-body)', position: 'relative' }}>
            {/* Nav */}
            <header style={{ backgroundColor: 'var(--color-bg-surface)', borderBottom: '1px solid var(--color-border)', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <img src="/logo.jpg" alt="Cleanbase" style={{ height: '32px' }} />
                    <span style={{ fontWeight: 600, fontSize: '1.25rem', color: 'var(--color-text-secondary)', marginLeft: '1rem', borderLeft: '1px solid var(--color-border)', paddingLeft: '1rem' }}>Client Portal</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <span style={{ fontWeight: 500, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <User size={16} /> {client.name}
                    </span>
                    <button onClick={() => navigate('/')} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>
                        <LogOut size={16} /> Logout
                    </button>
                </div>
            </header>

            <main className="container animate-fade-in" style={{ paddingTop: '3rem', paddingBottom: '4rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem' }}>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Welcome back, {client.name.split(' ')[0]} 👋</h1>
                        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.125rem' }}>Manage your cleaning appointments and view history.</p>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '2rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem' }}>Upcoming & Past Bookings</h2>

                        {bookings.length === 0 ? (
                            <div className="card" style={{ padding: '3rem', textAlign: 'center', backgroundColor: 'var(--color-bg-surface)' }}>
                                <Calendar size={48} color="var(--color-text-tertiary)" style={{ margin: '0 auto 1rem' }} />
                                <h3>You have no bookings</h3>
                                <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>Schedule your first cleaning appointment to get started.</p>
                                <button onClick={() => navigate('/book')} className="btn btn-primary">Book a Service</button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {bookings.map(b => (
                                    <div key={b.id} className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderLeft: b.status === 'completed' ? '4px solid var(--color-success)' : b.status === 'in_progress' ? '4px solid var(--color-primary)' : '4px solid var(--color-warning)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                                                <div>
                                                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Date</p>
                                                    <p style={{ fontWeight: 600 }}>{b.date}</p>
                                                </div>
                                                <div>
                                                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Time</p>
                                                    <p style={{ fontWeight: 600 }}>{b.time}</p>
                                                </div>
                                            </div>
                                            <span className={`badge badge-${b.status === 'completed' ? 'success' : b.status === 'in_progress' ? 'primary' : 'warning'}`}>
                                                {b.status.toUpperCase().replace('_', ' ')}
                                            </span>
                                        </div>

                                        <div style={{ height: '1px', backgroundColor: 'var(--color-border)', width: '100%' }}></div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                            <div>
                                                <h4 style={{ fontSize: '1.125rem', marginBottom: '0.25rem' }}>{getDB().services.find(s => s.id === b.serviceId)?.name || 'Cleaning service'}</h4>
                                                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Total Cost: <strong style={{ color: 'var(--color-text-primary)' }}>{b.price.toFixed(2)} QAR</strong></p>
                                            </div>

                                            {b.paymentStatus === 'unpaid' ? (
                                                <button onClick={() => payInvoice(b.id)} className="btn btn-primary" style={{ backgroundColor: '#1d1d1f', display: 'flex', gap: '0.5rem' }}>
                                                    <CreditCard size={16} /> Pay Invoice
                                                </button>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-success)', fontWeight: 600, fontSize: '0.875rem' }}>
                                                    <CheckCircle2 size={16} /> Paid in full
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <div className="card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: 'var(--color-tile-dark)', color: 'white', border: 'none' }}>
                            <h3 style={{ color: 'white', margin: 0, fontSize: '1.25rem' }}>Need a new service?</h3>
                            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.875rem', margin: '0 0 0.5rem 0' }}>Book instantly knowing your details are securely saved.</p>
                            <button onClick={() => navigate('/book')} style={{ backgroundColor: 'white', color: 'var(--color-primary)', border: 'none', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer', transition: 'transform 0.2s', width: '100%' }} onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}>
                                Book New Appointment
                            </button>
                        </div>
                    </div>
                </div>
            </main>

            <ChatWidget />
        </div>
    );
};

export const ClientPortalPage: React.FC = () => (isCloud ? <CloudPortal /> : <LocalPortal />);
