import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Star } from 'lucide-react';
import { isCloud, sb } from '../services/backend';
import { dayLabel, readCollection, updateItem } from '../services/erp';
import { Brand } from '../components/shared/Brand';
import '../auth.css';

interface Info { status: string; company: string; service: string; date: string; cleaner?: string }
const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

/** Public page a customer reaches from the WhatsApp link. No login. The link is the only key and works once. */
export const ReviewPage: React.FC = () => {
    const { token = '' } = useParams();
    const [info, setInfo] = useState<Info | null | undefined>(undefined);     // undefined = loading, null = not found
    const [rating, setRating] = useState(0);
    const [hover, setHover] = useState(0);
    const [comment, setComment] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            if (isCloud) {
                const { data } = await sb().rpc('review_lookup', { p_token: token });
                if (alive) setInfo((data as Info | null) ?? null);
            } else {
                const r = readCollection('reviewRequests').find(x => x.token === token);
                if (alive) setInfo(r ? { status: r.status, company: 'Your cleaning company', service: r.serviceName, date: r.serviceDate, cleaner: r.cleanerName } : null);
            }
        })();
        return () => { alive = false; };
    }, [token]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!rating) { setError('Please choose a rating from 1 to 5 stars.'); return; }
        setBusy(true); setError('');
        if (isCloud) {
            const { error: err } = await sb().rpc('review_submit', { p_token: token, p_rating: rating, p_comment: comment });
            setBusy(false);
            if (err) { setError(err.message); return; }
        } else {
            const r = readCollection('reviewRequests').find(x => x.token === token && x.status === 'sent');
            setBusy(false);
            if (!r) { setError('This review link is no longer valid.'); return; }
            updateItem('reviewRequests', r.id, { status: 'submitted', rating, comment: comment.trim(), submittedAt: new Date().toISOString() });
        }
        setDone(true);
    };

    const shown = hover || rating;
    let body: React.ReactNode;
    if (info === undefined) body = <p className="auth-sub">Loading...</p>;
    else if (info === null) body = (<><h1>Link not found</h1><p className="auth-sub">This review link is not valid. Please check the message you received, or ask the company to send it again.</p></>);
    else if (done) body = (<><h1>Thank you!</h1><p className="auth-sub">Your review has been sent to {info.company}. We appreciate you taking the time.</p></>);
    else if (info.status !== 'sent') body = (<><h1>Already answered</h1><p className="auth-sub">This review has already been sent, so the link can not be used again. Thank you for your feedback.</p></>);
    else body = (
        <>
            <h1>How was your cleaning?</h1>
            <p className="auth-sub">{info.company}: {info.service} on {dayLabel(info.date)}{info.cleaner ? `, with ${info.cleaner}` : ''}.</p>
            <form className="auth-form" onSubmit={submit}>
                <div role="radiogroup" aria-label="Your rating" style={{ display: 'flex', gap: 6, justifyContent: 'center' }} onMouseLeave={() => setHover(0)}>
                    {[1, 2, 3, 4, 5].map(i => (
                        <button
                            key={i} type="button" role="radio" aria-checked={rating === i} aria-label={`${i} star${i > 1 ? 's' : ''}, ${LABELS[i]}`}
                            onClick={() => setRating(i)} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(0)}
                            style={{ border: 0, background: 'transparent', padding: 4, cursor: 'pointer', transition: 'transform .15s var(--ease)' }}
                        >
                            <Star size={44} fill={i <= shown ? '#ff9f0a' : 'none'} color={i <= shown ? '#ff9f0a' : '#c7c7cc'} />
                        </button>
                    ))}
                </div>
                <div style={{ textAlign: 'center', minHeight: 24, fontWeight: 600 }} aria-live="polite">{shown ? LABELS[shown] : 'Tap a star'}</div>
                <div className="auth-field">
                    <label htmlFor="rv-note">Tell us more (optional)</label>
                    <textarea
                        id="rv-note" value={comment} maxLength={1000} rows={4} onChange={e => setComment(e.target.value)}
                        placeholder="What went well? What could be better?"
                        style={{ width: '100%', padding: '0.75rem 1rem', border: '1px solid var(--color-border-hover)', borderRadius: 12, font: 'inherit', fontSize: '1rem', resize: 'vertical' }}
                    />
                </div>
                {error && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.9375rem' }}>{error}</p>}
                <button type="submit" className="lp-btn lp-btn-primary auth-submit" disabled={busy}>{busy ? 'Sending...' : 'Send my review'}</button>
                <p className="tiny" style={{ textAlign: 'center' }}>The company reads your review before it is published.</p>
            </form>
        </>
    );

    return (
        <div className="auth">
            <div className="auth-top"><Brand size={20} /></div>
            <main className="auth-main"><div className="auth-card">{body}</div></main>
        </div>
    );
};
