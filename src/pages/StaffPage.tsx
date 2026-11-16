import React, { useState, useEffect } from 'react';
import { getDB, saveDB } from '../services/mockDb';
import type { Staff, User, Booking, Service, Subscription, Client } from '../types';
import {
    Plus, Search, Star, CheckCircle2, Trophy, Phone, MapPin, Calendar,
    Clock, TrendingUp, Camera, Edit2, Repeat, X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { CleanerSchedule } from '../components/bookings/CleanerSchedule';

export const StaffPage: React.FC = () => {
    const [staffList, setStaffList] = useState<(Staff & { user: User })[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [services, setServices] = useState<Service[]>([]);
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [clients, setClients] = useState<Client[]>([]);

    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
    const [formData, setFormData] = useState({ name: '', phone: '', age: '', nationality: '', photo: '' });

    // Cleaner Schedule Modal State
    const [viewingCleanerId, setViewingCleanerId] = useState<string | null>(null);
    const [viewingCleanerName, setViewingCleanerName] = useState<string>('');

    const { user } = useAuth();
    const canEdit = user?.role === 'superadmin' || user?.role === 'companyadmin';

    useEffect(() => {
        if (user?.companyId) {
            loadData();
        }
    }, [user?.companyId]);

    const loadData = () => {
        if (!user?.companyId) return;
        const db = getDB();
        const joined = db.staff
            .filter(s => s.companyId === user.companyId)
            .map(s => {
                const u = db.users.find(u => u.id === s.userId);
                return { ...s, user: u! };
            }).filter(s => s.user !== undefined);

        setStaffList(joined);
        setBookings(db.bookings.filter(b => b.companyId === user.companyId));
        setServices(db.services.filter(s => s.companyId === user.companyId));
        setSubscriptions(db.subscriptions?.filter(s => s.companyId === user.companyId) || []);
        setClients(db.clients.filter(c => c.companyId === user.companyId));
    };

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 150;
                const MAX_HEIGHT = 150;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                setFormData(prev => ({ ...prev, photo: dataUrl }));
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const db = getDB();

        if (editingStaffId) {
            const staffIndex = db.staff.findIndex(s => s.id === editingStaffId);
            if (staffIndex !== -1) {
                const userIndex = db.users.findIndex(u => u.id === db.staff[staffIndex].userId);
                if (userIndex !== -1) {
                    db.users[userIndex].name = formData.name;
                }

                db.staff[staffIndex].phone = formData.phone;
                db.staff[staffIndex].age = parseInt(formData.age) || undefined;
                db.staff[staffIndex].nationality = formData.nationality;
                db.staff[staffIndex].photo = formData.photo || undefined;
            }
        } else {
            const newUser: User = {
                id: `u-${Date.now()}`,
                email: `${formData.name.replace(/\s+/g, '').toLowerCase()}${Date.now()}@cleanbase.local`,
                name: formData.name,
                role: 'cleaner',
                companyId: user?.companyId || 'c1',
                createdAt: new Date().toISOString()
            };
            db.users.push(newUser);

            const newStaff: Staff = {
                id: `staff-${Date.now()}`,
                companyId: user?.companyId || 'c1',
                userId: newUser.id,
                phone: formData.phone,
                age: parseInt(formData.age) || undefined,
                nationality: formData.nationality,
                photo: formData.photo || undefined,
                rating: 5.0,
                completedJobsCount: 0,
                revenueGenerated: 0,
                createdAt: new Date().toISOString()
            };
            db.staff.push(newStaff);
        }

        saveDB(db);
        loadData();
        setIsModalOpen(false);
        setEditingStaffId(null);
        setFormData({ name: '', phone: '', age: '', nationality: '', photo: '' });
    };

    const filteredStaff = staffList.filter(s =>
        (s.user?.role === 'cleaner' || s.user?.role === 'driver') &&
        (s.user?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.nationality && s.nationality.toLowerCase().includes(searchTerm.toLowerCase())))
    );

    // Calculate dynamic stats per staff
    const staffStats = filteredStaff.map(staff => {
        const staffBookings = bookings.filter(b => b.cleanerId === staff.id);
        const assignedSubs = subscriptions.filter(s => s.cleanerId === staff.id);

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const sevenDaysAgo = today - (7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = today - (30 * 24 * 60 * 60 * 1000);

        let jobsToday = 0;
        let jobs7Days = 0;
        let jobs30Days = 0;
        let hoursWorked = 0;

        staffBookings.forEach(b => {
            if (b.status === 'completed') {
                const service = services.find(s => s.id === b.serviceId);
                const durationHours = service && service.durationMinutes ? service.durationMinutes / 60 : 2;
                hoursWorked += durationHours;

                const bookingTime = new Date(b.date).getTime();
                if (bookingTime >= today) jobsToday++;
                if (bookingTime >= sevenDaysAgo) jobs7Days++;
                if (bookingTime >= thirtyDaysAgo) jobs30Days++;
            }
        });

        if (staff.completedJobsCount > 0 && jobs30Days === 0) {
            jobs30Days = staff.completedJobsCount;
            hoursWorked = staff.completedJobsCount * 2.5;
            jobs7Days = Math.floor(staff.completedJobsCount / 4);
        }

        return {
            ...staff,
            jobsToday,
            jobs7Days,
            jobs30Days,
            hoursWorked,
            assignedSubs
        };
    });

    const topCleaner = [...staffStats].sort((a, b) => b.completedJobsCount - a.completedJobsCount)[0];

    const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || 'Client';

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--color-text-primary)', margin: 0 }}>
                        Field Operations & Cleaners
                    </h1>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                        Monitor cleaner dispatch availability, workload metrics, assigned recurring contracts, and job performance.
                    </p>
                </div>
                {canEdit && (
                    <button
                        className="btn btn-primary"
                        onClick={() => {
                            setEditingStaffId(null);
                            setFormData({ name: '', phone: '', age: '', nationality: '', photo: '' });
                            setIsModalOpen(true);
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', padding: '0.55rem 1rem' }}
                    >
                        <Plus size={15} strokeWidth={2.5} />
                        <span>Add Cleaner</span>
                    </button>
                )}
            </div>

            {/* Top Cleaner Spotlight Card */}
            {topCleaner && topCleaner.completedJobsCount > 0 && (
                <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem 1.5rem', border: '1px solid var(--color-border)', backgroundColor: '#FFFFFF' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ position: 'relative' }}>
                                <div style={{
                                    width: '56px',
                                    height: '56px',
                                    borderRadius: '10px',
                                    backgroundColor: 'var(--color-bg-subtle)',
                                    border: '1px solid var(--color-border)',
                                    color: 'var(--color-text-primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 700,
                                    fontSize: '1.25rem',
                                    overflow: 'hidden'
                                }}>
                                    {topCleaner.photo ? (
                                        <img src={topCleaner.photo} alt={topCleaner.user?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        topCleaner.user?.name.charAt(0).toUpperCase()
                                    )}
                                </div>
                                <div style={{
                                    position: 'absolute',
                                    bottom: '-4px',
                                    right: '-4px',
                                    backgroundColor: '#1d1d1f',
                                    color: '#ff9f0a',
                                    padding: '0.2rem',
                                    borderRadius: '4px',
                                    border: '2px solid white',
                                    display: 'flex'
                                }}>
                                    <Trophy size={11} />
                                </div>
                            </div>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                    <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
                                        {topCleaner.user?.name}
                                    </h2>
                                    <span style={{
                                        backgroundColor: 'var(--color-bg-subtle)',
                                        border: '1px solid var(--color-border)',
                                        color: 'var(--color-text-secondary)',
                                        fontSize: '0.625rem',
                                        fontWeight: 600,
                                        padding: '0.15rem 0.4rem',
                                        borderRadius: '4px'
                                    }}>
                                        Top Performer
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                        <Star size={12} fill="#ff9f0a" color="#ff9f0a" /> {topCleaner.rating.toFixed(1)} rating
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                        <CheckCircle2 size={12} color="#248a3d" /> {topCleaner.completedJobsCount} lifetime jobs
                                    </span>
                                    {topCleaner.assignedSubs.length > 0 && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--color-primary)', fontWeight: 600 }}>
                                            <Repeat size={12} /> {topCleaner.assignedSubs.length} recurring contracts
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1.75rem', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                                    Jobs (30D)
                                </div>
                                <div style={{ fontSize: '1.375rem', fontWeight: 700, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
                                    {topCleaner.jobs30Days}
                                </div>
                            </div>
                            <div style={{ width: '1px', height: '28px', backgroundColor: 'var(--color-border)' }} />
                            <div>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                                    Volume Delivered
                                </div>
                                <div style={{ fontSize: '1.375rem', fontWeight: 700, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>
                                    {topCleaner.revenueGenerated.toFixed(0)} <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>QAR</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Search Filter */}
            <div className="card" style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: '420px' }}>
                    <Search size={15} color="var(--color-text-tertiary)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                        type="text"
                        className="input-field"
                        placeholder="Search cleaners by name or nationality..."
                        style={{ width: '100%', paddingLeft: '36px', margin: 0, fontSize: '0.8125rem' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', marginLeft: 'auto', fontFamily: 'var(--font-sans)' }}>
                    {filteredStaff.length} cleaners active
                </div>
            </div>

            {/* Cleaners Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
                {staffStats.length === 0 ? (
                    <div className="card" style={{ gridColumn: '1 / -1', padding: '3.5rem 2rem', textAlign: 'center' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: 'var(--color-text-secondary)' }}>
                            <Star size={20} />
                        </div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.25rem' }}>No cleaners found</h3>
                        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.8125rem', margin: 0 }}>
                            Add cleaners to start dispatching jobs and managing individual schedules.
                        </p>
                    </div>
                ) : (
                    staffStats.map(staff => (
                        <div
                            key={staff.id}
                            className="card hover-bg-subtle"
                            style={{
                                padding: 0,
                                overflow: 'hidden',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                            onClick={() => {
                                setViewingCleanerId(staff.id);
                                setViewingCleanerName(staff.user?.name || '');
                            }}
                        >
                            {/* Card Header Profile */}
                            <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--color-border)' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{
                                            width: '44px',
                                            height: '44px',
                                            borderRadius: '8px',
                                            backgroundColor: 'var(--color-bg-subtle)',
                                            border: '1px solid var(--color-border)',
                                            color: 'var(--color-text-primary)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontWeight: 600,
                                            fontSize: '1rem',
                                            overflow: 'hidden'
                                        }}>
                                            {staff.photo ? (
                                                <img src={staff.photo} alt={staff.user?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                staff.user?.name.charAt(0).toUpperCase()
                                            )}
                                        </div>
                                        <div>
                                            <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, margin: 0, color: 'var(--color-text-primary)' }}>
                                                {staff.user?.name}
                                            </h3>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.25rem' }}>
                                                {staff.nationality && (
                                                    <span style={{ fontSize: '0.625rem', fontWeight: 600, backgroundColor: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', padding: '0.1rem 0.35rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.2rem', color: 'var(--color-text-secondary)' }}>
                                                        <MapPin size={9} /> {staff.nationality}
                                                    </span>
                                                )}
                                                {staff.age && (
                                                    <span style={{ fontSize: '0.625rem', fontWeight: 600, backgroundColor: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', padding: '0.1rem 0.35rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.2rem', color: 'var(--color-text-secondary)' }}>
                                                        <Calendar size={9} /> {staff.age}y
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {canEdit && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingStaffId(staff.id);
                                                setFormData({
                                                    name: staff.user?.name || '',
                                                    phone: staff.phone || '',
                                                    age: staff.age?.toString() || '',
                                                    nationality: staff.nationality || '',
                                                    photo: staff.photo || ''
                                                });
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
                                            title="Edit profile"
                                        >
                                            <Edit2 size={13} />
                                        </button>
                                    )}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                    <Phone size={12} color="var(--color-text-tertiary)" />
                                    <span style={{ fontFamily: 'var(--font-sans)' }}>{staff.phone || 'No phone'}</span>
                                </div>
                            </div>

                            {/* Assigned Subscriptions Section in Cleaner Card */}
                            <div style={{ padding: '0.75rem 1.25rem', backgroundColor: '#FFFFFF', borderBottom: '1px solid var(--color-border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                                    <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <Repeat size={11} color="var(--color-primary)" />
                                        <span>Assigned Subscriptions</span>
                                    </div>
                                    <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: staff.assignedSubs.length > 0 ? 'var(--color-primary)' : 'var(--color-text-tertiary)' }}>
                                        {staff.assignedSubs.length} active
                                    </span>
                                </div>

                                {staff.assignedSubs.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        {staff.assignedSubs.slice(0, 2).map(sub => (
                                            <div key={sub.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-text-primary)' }}>
                                                <span style={{ fontWeight: 500 }}>{getClientName(sub.clientId)}</span>
                                                <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>
                                                    {sub.frequency}
                                                </span>
                                            </div>
                                        ))}
                                        {staff.assignedSubs.length > 2 && (
                                            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
                                                +{staff.assignedSubs.length - 2} more clients
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                                        No recurring contracts assigned
                                    </div>
                                )}
                            </div>

                            {/* Card Body Stats */}
                            <div style={{ padding: '1rem 1.25rem', backgroundColor: 'var(--color-bg-subtle)' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                                    <div style={{ backgroundColor: '#FFFFFF', padding: '0.625rem 0.75rem', borderRadius: '6px', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Clock size={14} color="var(--color-text-secondary)" />
                                        <div>
                                            <div style={{ fontSize: '0.625rem', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>Total Hours</div>
                                            <div style={{ fontSize: '0.9375rem', fontWeight: 700, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>{staff.hoursWorked}h</div>
                                        </div>
                                    </div>
                                    <div style={{ backgroundColor: '#FFFFFF', padding: '0.625rem 0.75rem', borderRadius: '6px', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <TrendingUp size={14} color="#248a3d" />
                                        <div>
                                            <div style={{ fontSize: '0.625rem', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>Completed</div>
                                            <div style={{ fontSize: '0.9375rem', fontWeight: 700, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>{staff.completedJobsCount}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Mini Timeline */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem', borderTop: '1px solid var(--color-border)' }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.875rem', fontWeight: 700, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>{staff.jobsToday}</div>
                                        <div style={{ fontSize: '0.625rem', color: 'var(--color-text-tertiary)' }}>Today</div>
                                    </div>
                                    <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--color-border)' }} />
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.875rem', fontWeight: 700, fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)' }}>{staff.jobs7Days}</div>
                                        <div style={{ fontSize: '0.625rem', color: 'var(--color-text-tertiary)' }}>7 Days</div>
                                    </div>
                                    <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--color-border)' }} />
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.875rem', fontWeight: 700, fontFamily: 'var(--font-sans)', color: 'var(--color-primary)' }}>{staff.jobs30Days}</div>
                                        <div style={{ fontSize: '0.625rem', color: 'var(--color-text-tertiary)' }}>30 Days</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Cleaner Calendar & Schedule Modal */}
            {viewingCleanerId && (
                <CleanerSchedule
                    cleanerId={viewingCleanerId}
                    cleanerName={viewingCleanerName}
                    bookings={bookings}
                    onClose={() => setViewingCleanerId(null)}
                />
            )}

            {/* Add / Edit Cleaner Modal */}
            {isModalOpen && (
                <div className="sheet sheet-legacy" data-sheet>
                    <div className="card" style={{ width: '100%', maxWidth: '480px', padding: '1.75rem', boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div>
                                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
                                    {editingStaffId ? 'Edit Cleaner Profile' : 'Onboard Cleaner'}
                                </h2>
                                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                                    Assign staff member to job scheduling, contracts, and tracking.
                                </p>
                            </div>
                            <button
                                onClick={() => { setIsModalOpen(false); setEditingStaffId(null); setFormData({ name: '', phone: '', age: '', nationality: '', photo: '' }); }}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--color-text-secondary)' }}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.25rem' }}>
                                <div
                                    style={{
                                        width: '64px',
                                        height: '64px',
                                        borderRadius: '8px',
                                        backgroundColor: 'var(--color-bg-subtle)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        position: 'relative',
                                        overflow: 'hidden',
                                        border: '1px dashed var(--color-border)',
                                        cursor: 'pointer'
                                    }}
                                    onClick={() => document.getElementById('photo-upload')?.click()}
                                >
                                    {formData.photo ? (
                                        <img src={formData.photo} alt="Upload preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <Camera color="var(--color-text-tertiary)" size={24} />
                                    )}
                                </div>
                                <input id="photo-upload" type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
                                <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)', marginTop: '0.375rem' }}>Upload photo (optional)</span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="input-label">Full Name</label>
                                    <input type="text" className="input-field" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Maria Gonzalez" required />
                                </div>

                                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="input-label">Phone Number</label>
                                    <input type="tel" className="input-field" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="+974 5500 1234" />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Age</label>
                                    <input type="number" min="18" max="100" className="input-field" value={formData.age} onChange={e => setFormData({ ...formData, age: e.target.value })} placeholder="28" />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Nationality</label>
                                    <input type="text" className="input-field" value={formData.nationality} onChange={e => setFormData({ ...formData, nationality: e.target.value })} placeholder="e.g. Filipino" />
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => { setIsModalOpen(false); setEditingStaffId(null); setFormData({ name: '', phone: '', age: '', nationality: '', photo: '' }); }} style={{ fontSize: '0.8125rem' }}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" style={{ fontSize: '0.8125rem' }}>
                                    {editingStaffId ? 'Save Changes' : 'Add Cleaner'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
