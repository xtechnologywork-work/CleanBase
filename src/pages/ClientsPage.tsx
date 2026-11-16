import React, { useState, useEffect } from 'react';
import { getDB, saveDB } from '../services/mockDb';
import type { Client, Subscription, Service, Staff, User, Booking } from '../types';
import {
    Plus, Search, Phone, MapPin, User as UserIcon, Edit2, Trash2, X,
    AlertTriangle, Repeat, UserCheck, Calendar, Clock
} from 'lucide-react';
import { clientLifetimePaid, useCollection } from '../services/erp';
import { useAuth } from '../contexts/AuthContext';
import { Link, useNavigate } from 'react-router-dom';

export const ClientsPage: React.FC = () => {
    const [clients, setClients] = useState<Client[]>([]);
    const { user: authUser } = useAuth();
    useCollection('payments', authUser?.companyId || '');
    useCollection('invoices', authUser?.companyId || '');
    const spentOf = (c: Client) => clientLifetimePaid(c.companyId, c.id);
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [services, setServices] = useState<Service[]>([]);
    const [staffList, setStaffList] = useState<(Staff & { user: User })[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);

    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [viewingClient, setViewingClient] = useState<Client | null>(null);
    const [editingClientId, setEditingClientId] = useState<string | null>(null);
    const [deletingClientId, setDeletingClientId] = useState<string | null>(null);
    const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
    const [formData, setFormData] = useState({ name: '', phone: '', address: '' });

    const { user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (user?.companyId) {
            loadData();
        }
    }, [user?.companyId]);

    const loadData = () => {
        if (!user?.companyId) return;
        const db = getDB();
        setClients(db.clients.filter(c => c.companyId === user.companyId));
        setSubscriptions(db.subscriptions?.filter(s => s.companyId === user.companyId) || []);
        setServices(db.services.filter(s => s.companyId === user.companyId));
        setBookings(db.bookings.filter(b => b.companyId === user.companyId));

        const joinedStaff = db.staff
            .filter(s => s.companyId === user.companyId)
            .map(s => {
                const u = db.users.find(u => u.id === s.userId);
                return { ...s, user: u! };
            })
            .filter(s => s.user !== undefined);
        setStaffList(joinedStaff);
    };

    const getClientSubscriptions = (clientId: string) => {
        return subscriptions.filter(s => s.clientId === clientId);
    };

    const getServiceName = (serviceId: string) => {
        return services.find(s => s.id === serviceId)?.name || 'Standard Service';
    };

    const getCleaner = (cleanerId?: string) => {
        return staffList.find(s => s.id === cleanerId);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const db = getDB();

        if (editingClientId) {
            const index = db.clients.findIndex(c => c.id === editingClientId);
            if (index !== -1) {
                db.clients[index] = {
                    ...db.clients[index],
                    name: formData.name,
                    phone: formData.phone,
                    address: formData.address
                };
            }
        } else {
            const newClient: Client = {
                id: `client-${Date.now()}`,
                companyId: user?.companyId || 'c1',
                name: formData.name,
                phone: formData.phone,
                address: formData.address,
                totalSpent: 0,
                createdAt: new Date().toISOString()
            };
            db.clients.push(newClient);
        }

        saveDB(db);
        loadData();
        setIsModalOpen(false);
        setEditingClientId(null);
        setFormData({ name: '', phone: '', address: '' });
    };

    const handleDelete = () => {
        if (deleteConfirmationText.toLowerCase() === 'delete' && deletingClientId) {
            const db = getDB();
            db.clients = db.clients.filter(c => c.id !== deletingClientId);
            saveDB(db);
            loadData();
            setDeletingClientId(null);
            setDeleteConfirmationText('');
            if (viewingClient?.id === deletingClientId) {
                setViewingClient(null);
            }
        }
    };

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm) ||
        c.address.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalLTV = clients.reduce((acc, c) => acc + spentOf(c), 0);

    return (
        <div className="animate-fade-in">
            {/* Page Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--color-text-primary)', margin: 0 }}>
                        Client Directory
                    </h1>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                        Manage customer accounts, service locations, active subscriptions, and assigned staff.
                    </p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        setEditingClientId(null);
                        setFormData({ name: '', phone: '', address: '' });
                        setIsModalOpen(true);
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', padding: '0.55rem 1rem' }}
                >
                    <Plus size={15} strokeWidth={2.5} />
                    <span>Add Client</span>
                </button>
            </div>

            {/* Quick Metrics Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="card" style={{ padding: '1.125rem 1.25rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
                        Total Registered Clients
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>
                        {clients.length}
                    </div>
                </div>
                <div className="card" style={{ padding: '1.125rem 1.25rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
                        Aggregate Customer Spend
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>
                        {totalLTV.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>QAR</span>
                    </div>
                </div>
                <div className="card" style={{ padding: '1.125rem 1.25rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
                        Average Client LTV
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>
                        {(clients.length > 0 ? (totalLTV / clients.length) : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>QAR</span>
                    </div>
                </div>
            </div>

            {/* Filter / Search Bar */}
            <div className="card" style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: '420px' }}>
                    <Search size={15} color="var(--color-text-tertiary)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                        type="text"
                        className="input-field"
                        placeholder="Search clients by name, phone, or address..."
                        style={{ width: '100%', paddingLeft: '36px', margin: 0, fontSize: '0.8125rem' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', marginLeft: 'auto', fontFamily: 'var(--font-sans)' }}>
                    {filteredClients.length} of {clients.length} displayed
                </div>
            </div>

            {/* Clients Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
                {filteredClients.length === 0 ? (
                    <div className="card" style={{ gridColumn: '1 / -1', padding: '3.5rem 2rem', textAlign: 'center' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: 'var(--color-text-secondary)' }}>
                            <UserIcon size={20} />
                        </div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.25rem' }}>No matching clients</h3>
                        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.8125rem', margin: 0 }}>
                            {searchTerm ? 'Try adjusting your search criteria.' : 'Add your first client to start recording bookings.'}
                        </p>
                    </div>
                ) : (
                    filteredClients.map(client => {
                        const clientSubs = getClientSubscriptions(client.id);
                        const activeClientSubs = clientSubs.filter(s => s.status === 'active');

                        return (
                            <div
                                key={client.id}
                                className="card hover-bg-subtle"
                                style={{
                                    padding: '1.25rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                                onClick={() => setViewingClient(client)}
                            >
                                {/* Card Top: Initials & Actions */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{
                                            width: '40px',
                                            height: '40px',
                                            borderRadius: '8px',
                                            backgroundColor: 'var(--color-bg-subtle)',
                                            border: '1px solid var(--color-border)',
                                            color: 'var(--color-text-primary)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontWeight: 600,
                                            fontSize: '0.9375rem',
                                            fontFamily: 'var(--font-sans)'
                                        }}>
                                            {client.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, margin: 0, color: 'var(--color-text-primary)' }}>
                                                <Link to={`/app/clients/${client.id}`} onClick={e => e.stopPropagation()} style={{ color: 'inherit' }} title="Open full profile">{client.name}</Link>
                                            </h3>
                                            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
                                                Joined {new Date(client.createdAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.25rem' }} onClick={e => e.stopPropagation()}>
                                        <button
                                            onClick={() => {
                                                setEditingClientId(client.id);
                                                setFormData({ name: client.name, phone: client.phone, address: client.address });
                                                setIsModalOpen(true);
                                            }}
                                            style={{
                                                background: 'transparent',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: '6px',
                                                padding: '0.35rem',
                                                color: 'var(--color-text-secondary)',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                            title="Edit client details"
                                        >
                                            <Edit2 size={13} />
                                        </button>
                                        <button
                                            onClick={() => setDeletingClientId(client.id)}
                                            style={{
                                                background: 'transparent',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: '6px',
                                                padding: '0.35rem',
                                                color: '#d70015',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                            title="Delete client"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </div>

                                {/* Contact Details */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.875rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-secondary)', fontSize: '0.8125rem' }}>
                                        <Phone size={13} style={{ color: 'var(--color-text-tertiary)' }} />
                                        <span style={{ fontFamily: 'var(--font-sans)' }}>{client.phone}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: 'var(--color-text-secondary)', fontSize: '0.8125rem' }}>
                                        <MapPin size={13} style={{ marginTop: '2px', color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                                        <span style={{ lineHeight: 1.4 }}>{client.address}</span>
                                    </div>
                                </div>

                                {/* Active Subscriptions Profile Section */}
                                <div style={{ marginBottom: '1rem', flex: 1 }}>
                                    {activeClientSubs.length > 0 ? (
                                        <div style={{
                                            padding: '0.625rem 0.75rem',
                                            backgroundColor: 'var(--color-bg-subtle)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: '6px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                                                    <Repeat size={11} />
                                                    <span>{activeClientSubs.length} Active Plan</span>
                                                </div>
                                                <span style={{ fontSize: '0.6875rem', fontWeight: 700, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
                                                    {activeClientSubs[0].pricePerVisit.toFixed(2)} QAR
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.2rem' }}>
                                                {getServiceName(activeClientSubs[0].serviceId)}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--color-text-secondary)' }}>
                                                <span style={{ textTransform: 'capitalize' }}>{activeClientSubs[0].frequency}</span>
                                                {activeClientSubs[0].cleanerId ? (
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--color-text-primary)', fontWeight: 500 }}>
                                                        <UserCheck size={11} color="var(--color-primary)" />
                                                        {getCleaner(activeClientSubs[0].cleanerId)?.user?.name || 'Assigned'}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>Cleaner: Unassigned</span>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ padding: '0.5rem 0.75rem', border: '1px dashed var(--color-border)', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
                                            No active recurring subscription
                                        </div>
                                    )}
                                </div>

                                {/* Card Footer: LTV & Inspect Prompt */}
                                <div style={{
                                    paddingTop: '0.75rem',
                                    borderTop: '1px solid var(--color-border)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'baseline'
                                }}>
                                    <span style={{ color: 'var(--color-text-tertiary)', fontSize: '0.6875rem', fontWeight: 600 }}>
                                        Lifetime Spend
                                    </span>
                                    <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>
                                        {spentOf(client).toFixed(2)} <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>QAR</span>
                                    </span>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Client Full Profile Modal */}
            {viewingClient && (
                <div className="sheet sheet-legacy" data-sheet>
                    <div className="card" style={{ width: '100%', maxWidth: '640px', padding: '1.75rem', boxShadow: 'var(--shadow-lg)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        {/* Profile Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{
                                    width: '52px',
                                    height: '52px',
                                    borderRadius: '10px',
                                    backgroundColor: 'var(--color-bg-subtle)',
                                    border: '1px solid var(--color-border)',
                                    color: 'var(--color-text-primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 700,
                                    fontSize: '1.25rem',
                                    fontFamily: 'var(--font-sans)'
                                }}>
                                    {viewingClient.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
                                        {viewingClient.name}
                                    </h2>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginTop: '0.2rem' }}>
                                        Client Account #{viewingClient.id} • Registered {new Date(viewingClient.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setViewingClient(null)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--color-text-secondary)' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Contact & LTV Details */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                            <div style={{ padding: '1rem', backgroundColor: 'var(--color-bg-subtle)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                                <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                                    Client Contact & Address
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-primary)' }}>
                                        <Phone size={13} color="var(--color-text-tertiary)" />
                                        <span style={{ fontFamily: 'var(--font-sans)' }}>{viewingClient.phone}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: 'var(--color-text-secondary)' }}>
                                        <MapPin size={13} color="var(--color-text-tertiary)" style={{ marginTop: '2px', flexShrink: 0 }} />
                                        <span>{viewingClient.address}</span>
                                    </div>
                                </div>
                            </div>

                            <div style={{ padding: '1rem', backgroundColor: 'var(--color-bg-subtle)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                                <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                                    Account Financials
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
                                    {spentOf(viewingClient).toFixed(2)} <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>QAR</span>
                                </div>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)', marginTop: '0.25rem' }}>
                                    Total paid by this client
                                </div>
                            </div>
                        </div>

                        {/* Recurring Subscriptions in Profile */}
                        <div style={{ marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                    <Repeat size={15} color="var(--color-primary)" />
                                    <span>Recurring Subscriptions & Cleaner Assignments</span>
                                </div>
                                <button
                                    onClick={() => {
                                        setViewingClient(null);
                                        navigate('/app/subscriptions');
                                    }}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--color-primary)',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        padding: 0
                                    }}
                                >
                                    Manage in Subscriptions &rarr;
                                </button>
                            </div>

                            {getClientSubscriptions(viewingClient.id).length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--color-bg-subtle)', borderRadius: '8px', border: '1px dashed var(--color-border)' }}>
                                    <Repeat size={24} color="var(--color-text-tertiary)" style={{ margin: '0 auto 0.5rem' }} />
                                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>No active contracts for this client</div>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: '0.25rem 0 1rem' }}>Set up an ongoing weekly, monthly, or live-in cleaning contract.</p>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => {
                                            setViewingClient(null);
                                            navigate('/app/subscriptions');
                                        }}
                                        style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}
                                    >
                                        <Plus size={13} style={{ marginRight: '0.25rem' }} /> Create Subscription
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {getClientSubscriptions(viewingClient.id).map(sub => {
                                        const cleaner = getCleaner(sub.cleanerId);
                                        return (
                                            <div
                                                key={sub.id}
                                                style={{
                                                    padding: '1rem',
                                                    border: '1px solid var(--color-border)',
                                                    borderRadius: '8px',
                                                    backgroundColor: '#FFFFFF',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '0.75rem'
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                                                {getServiceName(sub.serviceId)}
                                                            </span>
                                                            <span className={`badge badge-${sub.status === 'active' ? 'success' : sub.status === 'paused' ? 'warning' : 'danger'}`}>
                                                                {sub.status.toUpperCase()}
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)', marginTop: '0.2rem' }}>
                                                            Contract #{sub.id} • Cadence: {sub.frequency.toUpperCase()}
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
                                                            {sub.pricePerVisit.toFixed(2)} QAR
                                                        </div>
                                                        <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
                                                            {['live-in', 'monthly'].includes(sub.frequency) ? 'per month' : 'per appointment'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
                                                    {/* Cleaner Assignment in Profile */}
                                                    <div>
                                                        <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>
                                                            Assigned Cleaner
                                                        </div>
                                                        {cleaner ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                                                                <div style={{ width: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 600 }}>
                                                                    {cleaner.photo ? (
                                                                        <img src={cleaner.photo} alt={cleaner.user?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                    ) : (
                                                                        cleaner.user?.name.charAt(0).toUpperCase()
                                                                    )}
                                                                </div>
                                                                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                                                    {cleaner.user?.name}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', fontStyle: 'italic', marginTop: '0.25rem', display: 'block' }}>
                                                                Unassigned
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Dates */}
                                                    <div>
                                                        <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>
                                                            Contract Timeline
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                                                            Started: {new Date(sub.startDate).toLocaleDateString()}
                                                            {sub.endDate ? ` • Ends: ${new Date(sub.endDate).toLocaleDateString()}` : ' • Active'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Recent Completed Bookings */}
                        <div>
                            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Calendar size={15} color="var(--color-text-secondary)" />
                                <span>Recent Booking History</span>
                            </div>
                            {(() => {
                                const clientBookings = bookings.filter(b => b.clientId === viewingClient.id);
                                if (clientBookings.length === 0) {
                                    return (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                                            No one-off bookings logged for this client yet.
                                        </div>
                                    );
                                }
                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {clientBookings.slice(0, 3).map(b => (
                                            <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.75rem', backgroundColor: 'var(--color-bg-subtle)', borderRadius: '6px', fontSize: '0.75rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <Clock size={12} color="var(--color-text-tertiary)" />
                                                    <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{b.date} • {b.time}</span>
                                                    <span style={{ color: 'var(--color-text-secondary)' }}>{getServiceName(b.serviceId)}</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600 }}>{b.price.toFixed(2)} QAR</span>
                                                    <span className={`badge badge-${b.status === 'completed' ? 'success' : b.status === 'in_progress' ? 'warning' : 'primary'}`} style={{ fontSize: '0.625rem' }}>
                                                        {b.status.toUpperCase()}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Close button */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                            <button className="btn btn-secondary" onClick={() => setViewingClient(null)} style={{ fontSize: '0.8125rem' }}>
                                Close Profile
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create/Edit Client Modal */}
            {isModalOpen && (
                <div className="sheet sheet-legacy" data-sheet>
                    <div className="card" style={{ width: '100%', maxWidth: '480px', padding: '1.75rem', boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div>
                                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
                                    {editingClientId ? 'Edit Client Record' : 'Register New Client'}
                                </h2>
                                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                                    Save client contact details for booking dispatches.
                                </p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--color-text-secondary)' }}>
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="input-group">
                                <label className="input-label">Full Name</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="e.g. Sarah Jenkins"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Phone Number</label>
                                <input
                                    type="tel"
                                    className="input-field"
                                    placeholder="e.g. +974 5512 3456"
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Primary Address / Residence</label>
                                <textarea
                                    className="input-field"
                                    rows={3}
                                    placeholder="e.g. Tower 4, Porto Arabia, The Pearl, Doha"
                                    value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    required
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)} style={{ fontSize: '0.8125rem' }}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" style={{ fontSize: '0.8125rem' }}>
                                    {editingClientId ? 'Save Changes' : 'Create Client'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deletingClientId && (
                <div className="dialog-back">
                    <div className="card" style={{ width: '100%', maxWidth: '420px', padding: '1.75rem', boxShadow: 'var(--shadow-lg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'rgba(215, 0, 21, 0.1)', color: '#d70015', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <AlertTriangle size={18} />
                            </div>
                            <div>
                                <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
                                    Delete Client Record
                                </h2>
                                <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                    This action is permanent and cannot be undone.
                                </p>
                            </div>
                        </div>
                        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.8125rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                            Deleting this client will remove their profile. Associated past bookings will retain their records but lose active profile referencing.
                        </p>
                        <div className="input-group">
                            <label className="input-label" style={{ fontSize: '0.75rem' }}>
                                Type <strong style={{ color: '#d70015' }}>delete</strong> to confirm
                            </label>
                            <input
                                type="text"
                                className="input-field"
                                value={deleteConfirmationText}
                                onChange={e => setDeleteConfirmationText(e.target.value)}
                                placeholder="delete"
                                autoFocus
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => { setDeletingClientId(null); setDeleteConfirmationText(''); }}
                                style={{ fontSize: '0.8125rem' }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn"
                                style={{ backgroundColor: '#d70015', color: 'white', fontSize: '0.8125rem', padding: '0.55rem 1rem' }}
                                onClick={handleDelete}
                                disabled={deleteConfirmationText.toLowerCase() !== 'delete'}
                            >
                                Delete Client
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
