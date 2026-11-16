import React, { useState, useEffect } from 'react';
import { getDB } from '../services/mockDb';
import type { Review, Client, Staff, User } from '../types';
import { Star, MessageCircle, StarHalf } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const ReviewsPage: React.FC = () => {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [staffList, setStaffList] = useState<(Staff & { user: User })[]>([]);
    const { user } = useAuth();

    useEffect(() => {
        if (user?.companyId) {
            loadData();
        }
    }, [user?.companyId]);

    const loadData = () => {
        if (!user?.companyId) return;
        const db = getDB();
        setReviews(db.reviews?.filter(r => r.companyId === user.companyId) || []);
        setClients(db.clients.filter(c => c.companyId === user.companyId));

        const joinedStaff = db.staff.filter(s => s.companyId === user.companyId).map(s => {
            const u = db.users.find(u => u.id === s.userId);
            return { ...s, user: u! };
        }).filter(s => s.user !== undefined);
        setStaffList(joinedStaff);
    };

    const getClientName = (id: string) => clients.find(c => c.id === id)?.name || 'Guest';
    const getCleanerName = (id: string) => staffList.find(s => s.id === id)?.user?.name || 'Unknown';

    const renderStars = (rating: number) => {
        const stars = [];
        for (let i = 1; i <= 5; i++) {
            if (i <= rating) {
                stars.push(<Star key={i} size={16} fill="var(--color-warning)" color="var(--color-warning)" />);
            } else if (i === Math.ceil(rating) && !Number.isInteger(rating)) {
                stars.push(<StarHalf key={i} size={16} fill="var(--color-warning)" color="var(--color-warning)" />);
            } else {
                stars.push(<Star key={i} size={16} color="var(--color-border-hover)" />);
            }
        }
        return stars;
    };

    const avgRating = reviews.length > 0 ? (reviews.reduce((acc, curr) => acc + curr.rating, 0) / reviews.length).toFixed(1) : '0.0';

    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ marginBottom: '0.25rem' }}>Customer Reviews</h1>
                    <p style={{ color: 'var(--color-text-secondary)' }}>Monitor feedback and cleaner performance ratings.</p>
                </div>
                <div className="card" style={{ padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: 'var(--color-bg-surface)' }}>
                    <div style={{ display: 'flex' }}>
                        {renderStars(Number(avgRating))}
                    </div>
                    <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>{avgRating}</span>
                    <span style={{ color: 'var(--color-text-tertiary)', fontSize: '0.875rem' }}>({reviews.length} total)</span>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                {reviews.length === 0 ? (
                    <div className="card" style={{ gridColumn: '1 / -1', padding: '4rem 2rem', textAlign: 'center', borderStyle: 'dashed', borderWidth: '2px' }}>
                        <div style={{ width: '64px', height: '64px', backgroundColor: 'var(--color-bg-subtle)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                            <MessageCircle size={32} color="var(--color-text-tertiary)" />
                        </div>
                        <h3 style={{ marginBottom: '0.5rem', fontSize: '1.25rem' }}>No reviews yet</h3>
                        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem', maxWidth: '400px', margin: '0 auto 2rem' }}>Send a review link from the Ask for reviews tab. Approved reviews appear here.</p>
                    </div>
                ) : (
                    reviews.map(review => (
                        <div key={review.id} className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', gap: '0.25rem' }}>{renderStars(review.rating)}</div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>{new Date(review.createdAt).toLocaleDateString()}</span>
                            </div>
                            <p style={{ flex: 1, fontSize: '0.875rem', color: 'var(--color-text-primary)', marginBottom: '1.5rem', fontStyle: 'italic' }}>
                                "{review.comment || 'No comment provided.'}"
                            </p>
                            <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between' }}>
                                <div>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', marginBottom: 0 }}>Client</p>
                                    <p style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0 }}>{getClientName(review.clientId)}</p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', marginBottom: 0 }}>Cleaner</p>
                                    <p style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0 }}>{getCleanerName(review.cleanerId)}</p>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
