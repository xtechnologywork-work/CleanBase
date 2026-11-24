import { isCloud } from '../services/backend';
import React, { useMemo, useState } from 'react';
import { useDB } from '../services/erp';
import { useAuth } from '../contexts/AuthContext';
import { getDB, saveDB } from '../services/mockDb';
import type { Company, UserRole, User } from '../types';
import { Save, Building, MapPin, CheckCircle2, Users, Plus, X, Trash2, Palette, Clock, Star, Car } from 'lucide-react';
import { BrandingPanel } from '../components/settings/BrandingPanel';
import { ReviewsPanel } from '../components/settings/ReviewsPanel';
import { WorkingHoursPanel } from '../components/settings/WorkingHoursPanel';
import { DriversPanel } from '../components/settings/DriversPanel';

type Tab = 'general' | 'branding' | 'hours' | 'reviews' | 'drivers' | 'areas' | 'team';

export const SettingsPage: React.FC = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>('general');
    // The form edits a copy of the company; it is read once when the page opens
    const [company, setCompany] = useState<Company | null>(() => {
        const found = user?.companyId ? getDB().companies.find(c => c.id === user.companyId) : undefined;
        return found ? { ...found, serviceAreas: found.serviceAreas || [] } : null;
    });
    const [saving, setSaving] = useState(false);
    const [savedMessage, setSavedMessage] = useState('');
    const live = useDB();

    const handleSaveGeneral = (e: React.FormEvent) => {
        e.preventDefault();
        saveCompanyData();
    };

    const saveCompanyData = () => {
        if (!company) return;
        setSaving(true);
        setTimeout(() => {
            const db = getDB();
            const index = db.companies.findIndex(c => c.id === company.id);
            if (index !== -1) {
                // Only what the owner edits here is written. Plan, price, license and approval belong to the
                // platform admin, so the latest saved values are kept (the database enforces this too).
                const { subscriptionPlan: _p, monthlyRevenue: _m, licenseUntil: _l, approvedAt: _a, adminNotes: _n, createdAt: _c, id: _i, ...editable } = company;
                void _p; void _m; void _l; void _a; void _n; void _c; void _i;
                db.companies[index] = { ...db.companies[index], ...editable };
                saveDB(db);
                setSavedMessage('Settings saved successfully');
                setTimeout(() => setSavedMessage(''), 3000);
            }
            setSaving(false);
        }, 400);
    };

    const addServiceArea = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && e.currentTarget.value.trim() !== '') {
            e.preventDefault();
            const newArea = e.currentTarget.value.trim();
            if (company && !company.serviceAreas?.includes(newArea)) {
                const updatedAreas = [...(company.serviceAreas || []), newArea];
                setCompany({ ...company, serviceAreas: updatedAreas });
                e.currentTarget.value = '';
            }
        }
    };

    const removeServiceArea = (area: string) => {
        if (company) {
            setCompany({ ...company, serviceAreas: company.serviceAreas?.filter(a => a !== area) });
        }
    };

    // Live list: someone added or removed on another device shows up here too
    const teamMembers = useMemo<User[]>(() => live.users.filter(u => u.companyId === company?.id && u.id !== user?.id && u.role !== 'driver'), [live, company?.id, user?.id]);
    const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
    const [newTeamMember, setNewTeamMember] = useState({ name: '', email: '', password: '', role: 'staff' as UserRole });

    const handleCreateTeamMember = (e: React.FormEvent) => {
        e.preventDefault();
        const db = getDB();
        const email = newTeamMember.email.trim().toLowerCase();
        if (db.users.some(u => (u.email || '').trim().toLowerCase() === email)) {
            alert('This email already has an account. Use another email.');
            return;
        }
        if (!isCloud && newTeamMember.password.length < 8) {
            alert('The password needs at least 8 characters.');
            return;
        }
        const newUser: User = {
            id: `u-${Date.now()}`,
            name: newTeamMember.name.trim(),
            email,
            password: isCloud ? undefined : newTeamMember.password,
            role: newTeamMember.role,
            companyId: company!.id,
            status: 'active',
            createdAt: new Date().toISOString()
        };
        db.users.push(newUser);

        if (['staff', 'driver', 'cleaner'].includes(newUser.role)) {
            db.staff.push({
                id: `staff-${Date.now()}`,
                companyId: company!.id,
                userId: newUser.id,
                phone: '',
                rating: 5.0,
                completedJobsCount: 0,
                revenueGenerated: 0,
                createdAt: new Date().toISOString()
            });
        }

        saveDB(db);
        setIsTeamModalOpen(false);
        setNewTeamMember({ name: '', email: '', password: '', role: 'staff' });
        setSavedMessage('Team member created successfully');
        setTimeout(() => setSavedMessage(''), 3000);
    };

    const handleDeleteTeamMember = (memberId: string) => {
        if (!window.confirm("Are you sure you want to delete this team member?")) return;

        const db = getDB();
        db.users = db.users.filter(u => u.id !== memberId);
        db.staff = db.staff.filter(s => s.userId !== memberId);
        saveDB(db);

        setSavedMessage('Team member removed');
        setTimeout(() => setSavedMessage(''), 3000);
    };

    if (!company) return <div>Loading settings...</div>;

    return (
        <div className="animate-fade-in">
            {/* Page Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--color-text-primary)', margin: 0 }}>
                        Workspace Settings
                    </h1>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                        Manage company profile, operational coverage zones, and authorized team members.
                    </p>
                </div>
                {savedMessage && (
                    <div style={{
                        backgroundColor: 'rgba(36, 138, 61, 0.1)',
                        color: '#248a3d',
                        border: '1px solid rgba(36, 138, 61, 0.2)',
                        padding: '0.4rem 0.75rem',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.8125rem',
                        fontWeight: 500
                    }}>
                        <CheckCircle2 size={15} />
                        <span>{savedMessage}</span>
                    </div>
                )}
            </div>

            <div className="settings-grid">
                {/* Clean Sub-navigation */}
                <div className="card settings-nav" style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <button
                        onClick={() => setActiveTab('general')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.625rem',
                            padding: '0.6rem 0.75rem',
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.8125rem',
                            fontWeight: activeTab === 'general' ? 600 : 500,
                            backgroundColor: activeTab === 'general' ? 'var(--color-bg-subtle)' : 'transparent',
                            color: activeTab === 'general' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                            textAlign: 'left',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <Building size={15} color={activeTab === 'general' ? 'var(--color-primary)' : 'currentColor'} />
                        <span>General Profile</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('branding')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.625rem',
                            padding: '0.6rem 0.75rem',
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.8125rem',
                            fontWeight: activeTab === 'branding' ? 600 : 500,
                            backgroundColor: activeTab === 'branding' ? 'var(--color-bg-subtle)' : 'transparent',
                            color: activeTab === 'branding' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                            textAlign: 'left',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <Palette size={15} color={activeTab === 'branding' ? 'var(--color-primary)' : 'currentColor'} />
                        <span>Branding</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('hours')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.625rem',
                            padding: '0.6rem 0.75rem',
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.8125rem',
                            fontWeight: activeTab === 'hours' ? 600 : 500,
                            backgroundColor: activeTab === 'hours' ? 'var(--color-bg-subtle)' : 'transparent',
                            color: activeTab === 'hours' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                            textAlign: 'left',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <Clock size={15} color={activeTab === 'hours' ? 'var(--color-primary)' : 'currentColor'} />
                        <span>Working Hours</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('reviews')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.625rem',
                            padding: '0.6rem 0.75rem',
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.8125rem',
                            fontWeight: activeTab === 'reviews' ? 600 : 500,
                            backgroundColor: activeTab === 'reviews' ? 'var(--color-bg-subtle)' : 'transparent',
                            color: activeTab === 'reviews' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                            textAlign: 'left',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <Star size={15} color={activeTab === 'reviews' ? 'var(--color-primary)' : 'currentColor'} />
                        <span>Reviews</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('drivers')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.625rem',
                            padding: '0.6rem 0.75rem',
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.8125rem',
                            fontWeight: activeTab === 'drivers' ? 600 : 500,
                            backgroundColor: activeTab === 'drivers' ? 'var(--color-bg-subtle)' : 'transparent',
                            color: activeTab === 'drivers' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                            textAlign: 'left',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <Car size={15} color={activeTab === 'drivers' ? 'var(--color-primary)' : 'currentColor'} />
                        <span>Drivers</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('areas')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.625rem',
                            padding: '0.6rem 0.75rem',
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.8125rem',
                            fontWeight: activeTab === 'areas' ? 600 : 500,
                            backgroundColor: activeTab === 'areas' ? 'var(--color-bg-subtle)' : 'transparent',
                            color: activeTab === 'areas' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                            textAlign: 'left',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <MapPin size={15} color={activeTab === 'areas' ? 'var(--color-primary)' : 'currentColor'} />
                        <span>Service Zones</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('team')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.625rem',
                            padding: '0.6rem 0.75rem',
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.8125rem',
                            fontWeight: activeTab === 'team' ? 600 : 500,
                            backgroundColor: activeTab === 'team' ? 'var(--color-bg-subtle)' : 'transparent',
                            color: activeTab === 'team' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                            textAlign: 'left',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <Users size={15} color={activeTab === 'team' ? 'var(--color-primary)' : 'currentColor'} />
                        <span>Team Members</span>
                    </button>
                </div>

                {/* Content Area */}
                <div>
                    {/* General Settings Tab */}
                    {activeTab === 'general' && (
                        <div className="card" style={{ padding: '1.75rem' }}>
                            <div style={{ marginBottom: '1.25rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--color-border)' }}>
                                <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
                                    Company Profile
                                </h2>
                                <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                                    Basic identifying information displayed to clients on quotes and booking receipts.
                                </p>
                            </div>

                            <form onSubmit={handleSaveGeneral}>
                                <div className="input-group">
                                    <label className="input-label">Company Trade Name</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        value={company.name}
                                        onChange={e => setCompany({ ...company, name: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="input-group">
                                    <label className="input-label">Standard Operating Hours</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="e.g. Sat - Thu: 08:00 AM - 08:00 PM"
                                        value={company.workingHours || ''}
                                        onChange={e => setCompany({ ...company, workingHours: e.target.value })}
                                    />
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                                    <button
                                        type="submit"
                                        className="btn btn-primary"
                                        disabled={saving}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', padding: '0.55rem 1rem' }}
                                    >
                                        <Save size={15} />
                                        <span>{saving ? 'Saving...' : 'Save Changes'}</span>
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Branding Tab */}
                    {activeTab === 'branding' && (
                        <BrandingPanel company={company} setCompany={setCompany} onSave={saveCompanyData} saving={saving} />
                    )}

                    {/* Working Hours Tab */}
                    {activeTab === 'hours' && <WorkingHoursPanel companyId={company.id} />}

                    {/* Reviews Tab */}
                    {activeTab === 'reviews' && <ReviewsPanel companyId={company.id} companyName={company.name} />}

                    {/* Drivers Tab */}
                    {activeTab === 'drivers' && <DriversPanel companyId={company.id} companyName={company.name} actor={user?.name || 'Owner'} />}

                    {/* Service Areas Tab */}
                    {activeTab === 'areas' && (
                        <div className="card" style={{ padding: '1.75rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--color-border)' }}>
                                <div>
                                    <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
                                        Operational Coverage Zones
                                    </h2>
                                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                                        Municipalities or districts where your cleaners and fleets operate.
                                    </p>
                                </div>
                                <button
                                    onClick={saveCompanyData}
                                    className="btn btn-primary"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', padding: '0.45rem 0.85rem' }}
                                    disabled={saving}
                                >
                                    <Save size={14} />
                                    <span>Save</span>
                                </button>
                            </div>

                            <div className="input-group">
                                <label className="input-label">Add Coverage District (Press Enter to add)</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="e.g. West Bay, The Pearl, Lusail..."
                                    onKeyDown={addServiceArea}
                                />
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
                                {(company.serviceAreas || []).length === 0 ? (
                                    <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8125rem', fontStyle: 'italic' }}>
                                        No specific service zones added yet.
                                    </span>
                                ) : (
                                    company.serviceAreas?.map(area => (
                                        <div
                                            key={area}
                                            style={{
                                                padding: '0.3rem 0.6rem',
                                                backgroundColor: 'var(--color-bg-subtle)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: '6px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.4rem',
                                                fontSize: '0.8125rem',
                                                color: 'var(--color-text-primary)'
                                            }}
                                        >
                                            <span>{area}</span>
                                            <button
                                                onClick={() => removeServiceArea(area)}
                                                style={{ border: 'none', background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                                                title="Remove"
                                            >
                                                <X size={13} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* Team Members Tab */}
                    {activeTab === 'team' && (
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)' }}>
                                <div>
                                    <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
                                        Dashboard Accounts & Team
                                    </h2>
                                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                                        Members authorized to access dispatch tools and manage appointments. Drivers have their own tab.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setIsTeamModalOpen(true)}
                                    className="btn btn-primary"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', padding: '0.45rem 0.85rem' }}
                                >
                                    <Plus size={14} />
                                    <span>Add Member</span>
                                </button>
                            </div>

                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-subtle)' }}>
                                            <th style={{ padding: '0.75rem 1.25rem', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>User</th>
                                            <th style={{ padding: '0.75rem 1.25rem', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Email</th>
                                            <th style={{ padding: '0.75rem 1.25rem', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Role</th>
                                            <th style={{ padding: '0.75rem 1.25rem', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Password</th>
                                            <th style={{ padding: '0.75rem 1.25rem', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {teamMembers.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                                                    No additional team members registered.
                                                </td>
                                            </tr>
                                        ) : (
                                            teamMembers.map(m => (
                                                <tr key={m.id} style={{ borderBottom: '1px solid var(--color-border)' }} className="hover-bg-subtle">
                                                    <td style={{ padding: '0.875rem 1.25rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                                        {m.name}
                                                    </td>
                                                    <td style={{ padding: '0.875rem 1.25rem', color: 'var(--color-text-secondary)' }}>
                                                        {m.email}
                                                    </td>
                                                    <td style={{ padding: '0.875rem 1.25rem' }}>
                                                        <span style={{
                                                            fontSize: '0.6875rem',
                                                            fontWeight: 600,
                                                            padding: '0.2rem 0.45rem',
                                                            borderRadius: '4px',
                                                            backgroundColor: 'var(--color-bg-subtle)',
                                                            border: '1px solid var(--color-border)',
                                                            color: 'var(--color-text-primary)'
                                                        }}>
                                                            {m.role}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.875rem 1.25rem', fontFamily: 'var(--font-sans)', color: 'var(--color-text-tertiary)', fontSize: '0.75rem' }}>
                                                        {m.password || '••••••'}
                                                    </td>
                                                    <td style={{ padding: '0.875rem 1.25rem', textAlign: 'right' }}>
                                                        <button
                                                            onClick={() => handleDeleteTeamMember(m.id)}
                                                            style={{
                                                                background: 'transparent',
                                                                border: '1px solid var(--color-border)',
                                                                borderRadius: '6px',
                                                                padding: '0.35rem',
                                                                color: '#d70015',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center'
                                                            }}
                                                            title="Delete member"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Team Members Modal */}
                    {activeTab === 'team' && isTeamModalOpen && (
                        <div className="sheet sheet-legacy" data-sheet>
                            <div className="card" style={{ width: '100%', maxWidth: '420px', padding: '1.75rem', boxShadow: 'var(--shadow-lg)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                                    <div>
                                        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em', color: 'var(--color-text-primary)' }}>
                                            Add Team Member
                                        </h3>
                                        <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                                            Provide login credentials for dashboard access.
                                        </p>
                                    </div>
                                    <button onClick={() => setIsTeamModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--color-text-secondary)' }}>
                                        <X size={18} />
                                    </button>
                                </div>
                                <form onSubmit={handleCreateTeamMember}>
                                    <div className="input-group">
                                        <label className="input-label">Full Name</label>
                                        <input
                                            type="text"
                                            className="input-field"
                                            required
                                            value={newTeamMember.name}
                                            onChange={e => setNewTeamMember({ ...newTeamMember, name: e.target.value })}
                                            placeholder="e.g. Alex Rivera"
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label className="input-label">Work Email</label>
                                        <input
                                            type="email"
                                            className="input-field"
                                            required
                                            value={newTeamMember.email}
                                            onChange={e => setNewTeamMember({ ...newTeamMember, email: e.target.value })}
                                            placeholder="alex@company.com"
                                        />
                                    </div>
                                    {isCloud ? (
                                        <p style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", margin: "0 0 1rem" }}>
                                            They set their own password: ask them to open the sign-in page, choose Start for free, and sign up with this email. They are linked to your company automatically.
                                        </p>
                                    ) : (
                                        <div className="input-group">
                                            <label className="input-label">Initial Password</label>
                                            <input
                                                type="text"
                                                className="input-field"
                                                autoComplete="new-password"
                                                required
                                                value={newTeamMember.password}
                                                onChange={e => setNewTeamMember({ ...newTeamMember, password: e.target.value })}
                                                placeholder="Temporary password"
                                            />
                                        </div>
                                    )}
                                    <div className="input-group">
                                        <label className="input-label">Role</label>
                                        <select
                                            className="input-field"
                                            value={newTeamMember.role}
                                            onChange={e => setNewTeamMember({ ...newTeamMember, role: e.target.value as UserRole })}
                                        >
                                            <option value="manager">Manager (everything except settings)</option>
                                            <option value="dispatcher">Dispatcher</option>
                                            <option value="accountant">Accountant</option>
                                            <option value="staff">Operations Staff</option>
                                            <option value="cleaner">Field Cleaner</option>
                                        </select>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                                        <button type="button" className="btn btn-secondary" onClick={() => setIsTeamModalOpen(false)} style={{ fontSize: '0.8125rem' }}>
                                            Cancel
                                        </button>
                                        <button type="submit" className="btn btn-primary" style={{ fontSize: '0.8125rem' }}>
                                            Create Account
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
