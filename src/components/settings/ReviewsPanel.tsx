import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Save, XCircle } from 'lucide-react';
import { useSettings } from '../../services/erp';
import { renderMessage } from '../../services/bookingMessages';
import { parseGoogleReviewLink, PLACE_ID_FINDER } from '../../services/googleReview';
import type { ReviewMode } from '../../services/googleReview';

const OPTION: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '0.85rem 1rem', borderRadius: 10, cursor: 'pointer', border: '1px solid var(--color-border)' };

/** Settings tab: where review requests send customers. Google Maps (real public reviews) or our private page. */
export const ReviewsPanel: React.FC<{ companyId: string; companyName: string }> = ({ companyId, companyName }) => {
    const { settings, save } = useSettings(companyId);
    const savedMode: ReviewMode = settings.reviewMode ?? 'google';
    const savedUrl = settings.googleReviewUrl || '';
    const [mode, setMode] = useState<ReviewMode>(savedMode);
    const [url, setUrl] = useState(savedUrl);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    // Follow what is saved, for example when the settings finish loading from the cloud
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { setMode(savedMode); setUrl(savedUrl); }, [savedMode, savedUrl]);

    const parsed = useMemo(() => (url.trim() ? parseGoogleReviewLink(url) : null), [url]);
    const dirty = mode !== (settings.reviewMode ?? 'google') || url.trim() !== savedUrl || (settings.reviewMode === undefined && !!parsed?.ok);
    const link = parsed?.ok ? parsed.url : 'https://g.page/r/your-business/review';
    const preview = renderMessage(settings.tplReviewGoogle || '', {
        name: 'Sara', service: '5h cleaning', date: '2026-11-20', time: '', cleaner: 'Maria', company: companyName, address: '', link,
    });

    const onSave = () => {
        setError('');
        if (mode === 'google') {
            const p = parseGoogleReviewLink(url);
            if (!p.ok) { setError(p.error); return; }
            save({ reviewMode: 'google', googleReviewUrl: p.url });
            setUrl(p.url);
        } else {
            // Keep the link written so it is there when Google is switched on again
            const p = url.trim() ? parseGoogleReviewLink(url) : null;
            save({ reviewMode: 'private', googleReviewUrl: p?.ok ? p.url : url.trim() });
        }
        setMessage('Review settings saved');
        setTimeout(() => setMessage(''), 3000);
    };

    return (
        <div className="card" style={{ padding: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: '1.25rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--color-border)' }}>
                <div>
                    <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>Customer reviews</h2>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                        Choose where customers are sent when you ask them for a review after a finished job.
                    </p>
                </div>
                {message && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', fontWeight: 500, padding: '0.4rem 0.75rem', borderRadius: 6, color: '#248a3d', background: 'rgba(36,138,61,.1)' }}>
                        <CheckCircle2 size={15} /><span>{message}</span>
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} role="radiogroup" aria-label="Where to send review requests">
                <label style={{ ...OPTION, borderColor: mode === 'google' ? 'var(--color-primary)' : undefined, background: mode === 'google' ? 'var(--color-bg-subtle)' : undefined }}>
                    <input type="radio" name="reviewMode" checked={mode === 'google'} onChange={() => { setMode('google'); setMessage(''); setError(''); }} style={{ marginTop: 3 }} />
                    <span>
                        <b style={{ fontWeight: 600, fontSize: '0.875rem' }}>Google Maps review (recommended)</b>
                        <span style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                            The customer leaves a real public review on your Google business page. It helps new customers find and trust you.
                        </span>
                    </span>
                </label>
                <label style={{ ...OPTION, borderColor: mode === 'private' ? 'var(--color-primary)' : undefined, background: mode === 'private' ? 'var(--color-bg-subtle)' : undefined }}>
                    <input type="radio" name="reviewMode" checked={mode === 'private'} onChange={() => { setMode('private'); setMessage(''); setError(''); }} style={{ marginTop: 3 }} />
                    <span>
                        <b style={{ fontWeight: 600, fontSize: '0.875rem' }}>Private review page</b>
                        <span style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                            The customer rates the job on a CleanBase page. Nothing is public until you accept it.
                        </span>
                    </span>
                </label>
            </div>

            <div className="input-group" style={{ marginTop: '1.25rem' }}>
                <label className="input-label" htmlFor="google-review-url">Your Google review link</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input id="google-review-url" type="url" inputMode="url" className="input-field" style={{ flex: 1, minWidth: 240, borderColor: parsed && !parsed.ok ? '#d70015' : undefined }}
                        placeholder="https://g.page/r/.../review" value={url} onChange={e => { setUrl(e.target.value); setError(''); setMessage(''); }} />
                    <button type="button" className="btn btn-secondary btn-sm" disabled={!parsed?.ok} onClick={() => parsed?.ok && window.open(parsed.url, '_blank', 'noopener')}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ExternalLink size={13} /> Test link</button>
                </div>
                {parsed?.ok && !parsed.direct && (
                    <div role="note" style={{ marginTop: 8, padding: '0.7rem 0.85rem', borderRadius: 10, background: 'rgba(255,159,10,.12)', fontSize: '0.8125rem', lineHeight: 1.5 }}>
                        <b style={{ fontWeight: 600 }}>This link opens your business page on Google Maps, not the review form.</b> The customer would have to find &quot;Write a review&quot; by themselves.
                        For a link that opens the form directly, use one of these:
                        <ul style={{ margin: '0.35rem 0 0', paddingInlineStart: '1.1rem' }}>
                            <li>Your <b>Place ID</b> (starts with ChIJ): find it with the <a href={PLACE_ID_FINDER} target="_blank" rel="noopener noreferrer">Place ID Finder</a>, search your business, copy the ID and paste it here. We build the review link for you.</li>
                            <li>Or in your <b>Google Business Profile</b>: &quot;Ask for reviews&quot; (&quot;Get more reviews&quot;), copy the link that looks like g.page/r/.../review.</li>
                        </ul>
                    </div>
                )}
                {parsed && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: '0.8125rem', color: parsed.ok ? '#248a3d' : '#d70015' }} role={parsed.ok ? undefined : 'alert'}>
                        {parsed.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                        <span>{parsed.ok ? (parsed.direct ? 'This link opens your review form directly. Press Test link to check it.' : 'This is a valid Google link, but it is not the direct review form (see above).') : parsed.error}</span>
                    </div>
                )}
                <small>
                    Best: paste your Place ID (starts with ChIJ, find it with the <a href={PLACE_ID_FINDER} target="_blank" rel="noopener noreferrer">Place ID Finder</a>) or the review link from your Google Business Profile, &quot;Ask for reviews&quot;.
                    Both open the review form directly. The Share link from Google Maps only opens the business page.
                </small>
            </div>

            <div style={{ marginTop: '1rem' }}>
                <b style={{ fontWeight: 600, fontSize: '0.8125rem' }}>What the customer receives on WhatsApp</b>
                <pre dir="auto" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '0.4rem 0 0', padding: '0.85rem 1rem', borderRadius: 10, background: 'var(--color-bg-subtle)', fontFamily: 'inherit', fontSize: '0.8125rem', lineHeight: 1.5 }}>{preview}</pre>
                <small>You can change the wording in Business rules, Message templates, &quot;Google review request&quot;.</small>
            </div>

            {error && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.875rem', margin: '0.75rem 0 0' }}>{error}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                {dirty && <button type="button" className="btn btn-secondary" onClick={() => { setMode(savedMode); setUrl(savedUrl); setError(''); }} style={{ fontSize: '0.8125rem' }}>Discard changes</button>}
                <button type="button" className="btn btn-primary" onClick={onSave} disabled={!dirty} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', padding: '0.55rem 1rem' }}>
                    <Save size={15} /> <span>Save review settings</span>
                </button>
            </div>
        </div>
    );
};
