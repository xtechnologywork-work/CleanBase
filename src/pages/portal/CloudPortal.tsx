import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { sb } from '../../services/backend';
import { Brand } from '../../components/shared/Brand';
import '../../auth.css';

interface PortalBooking { id: string; date: string; time: string; status: string; paymentStatus: string; price: number; service: string | null }
interface PortalData { client: { name: string; phone: string; address: string }; bookings: PortalBooking[] }

/** Client portal: a customer looks up their bookings with the phone number they booked with. */
export const CloudPortal: React.FC = () => {
    const [params] = useSearchParams();
    const company = params.get('c') || '';
    const [phone, setPhone] = useState('');
    const [data, setData] = useState<PortalData | null>(null);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);

    const lookup = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true); setMessage('');
        const { data: res, error } = await sb().rpc('portal_lookup', { p_company: company, p_phone: phone.trim() });
        setBusy(false);
        if (error) { setMessage(error.message); return; }
        if (!res) { setMessage('We could not find bookings for that phone number.'); return; }
        setData(res as PortalData);
    };

    return (
        <div className="auth">
            <div className="auth-top"><Link to="/" aria-label="CleanBase home"><Brand size={20} /></Link></div>
            <main className="auth-main" style={{ alignItems: 'flex-start' }}>
                <div className="auth-card" style={{ maxWidth: 640 }}>
                    <h1>Your bookings</h1>
                    {!company ? (
                        <p className="auth-sub">This page needs the link your cleaning company sent you.</p>
                    ) : !data ? (
                        <>
                            <p className="auth-sub">Enter the phone number you booked with.</p>
                            <form className="auth-form" onSubmit={lookup}>
                                <div className="auth-field">
                                    <label htmlFor="portal-phone">Phone number</label>
                                    <div className="auth-input">
                                        <input id="portal-phone" style={{ paddingLeft: 16 }} type="tel" placeholder="+974 5555 0000" value={phone} onChange={e => setPhone(e.target.value)} required />
                                    </div>
                                </div>
                                {message && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.9375rem' }}>{message}</p>}
                                <button type="submit" className="lp-btn lp-btn-primary auth-submit" disabled={busy}>{busy ? 'Looking...' : 'Show my bookings'}</button>
                            </form>
                        </>
                    ) : (
                        <>
                            <p className="auth-sub">{data.client.name}</p>
                            <div style={{ marginTop: 20 }}>
                                {data.bookings.length === 0 ? <p className="auth-sub">No bookings yet.</p> : data.bookings.map(b => (
                                    <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '0.75rem 0', borderBottom: '1px solid var(--color-border)' }}>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{b.service || 'Cleaning'}</div>
                                            <div style={{ color: 'var(--color-text-tertiary)', fontSize: '0.875rem' }}>{b.date} at {b.time}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div>{Number(b.price).toFixed(2)} QAR</div>
                                            <div style={{ color: 'var(--color-text-tertiary)', fontSize: '0.875rem' }}>{b.status.replace('_', ' ')} · {b.paymentStatus}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <p className="auth-switch">To pay or change a booking, contact your cleaning company.</p>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
};
