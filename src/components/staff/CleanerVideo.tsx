import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Replace, Trash2, Upload, Video } from 'lucide-react';
import { isCloud } from '../../services/backend';
import { checkVideo, deleteVideo, MAX_VIDEO_BYTES, resolveVideo, uploadVideo } from '../../services/videos';

/** Plays a stored cleaner video. The link is created on demand and lasts an hour. */
export const VideoPlayer: React.FC<{ videoRef: string; title?: string }> = ({ videoRef, title }) => {
    const [url, setUrl] = useState('');
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let alive = true;
        resolveVideo(videoRef).then(u => { if (alive) { setUrl(u); setFailed(false); } }).catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [videoRef]);
    if (failed) return <div style={{ padding: '1.25rem', textAlign: 'center', fontSize: '0.8125rem', color: '#d70015', background: 'var(--color-bg-subtle)', borderRadius: 10 }}>This video could not be loaded. Try again in a moment.</div>;
    if (!url) return <div style={{ aspectRatio: '16 / 9', display: 'grid', placeItems: 'center', background: '#000', borderRadius: 10, color: '#fff' }}><Loader2 size={22} className="spin" /></div>;
    return <video key={url} src={url} controls playsInline preload="metadata" aria-label={title ? `Video of ${title}` : 'Cleaner video'} style={{ width: '100%', maxHeight: 360, background: '#000', borderRadius: 10, display: 'block' }} />;
};

interface FieldProps {
    value: string;
    /** The reference the cleaner had when the form was opened. A newly uploaded file replaced during editing is deleted at once. */
    original: string;
    companyId: string;
    name?: string;
    onChange: (ref: string) => void;
    /** Tells the form when an upload is running, so it can hold Save and Cancel until the file is stored. */
    onBusy?: (busy: boolean) => void;
}

/** Upload, preview, replace or remove a cleaner's video inside the edit window. */
export const VideoField: React.FC<FieldProps> = ({ value, original, companyId, name, onChange, onBusy }) => {
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [drag, setDrag] = useState(false);

    const take = async (file?: File | null) => {
        if (!file) return;
        setError('');
        const problem = checkVideo(file);
        if (problem) { setError(problem); return; }
        setBusy(true); onBusy?.(true);
        try {
            const ref = await uploadVideo(file, companyId);
            if (value && value !== original) await deleteVideo(value).catch(() => undefined);   // an earlier draft that was never saved
            onChange(ref);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'The upload failed. Please try again.');
        } finally { setBusy(false); onBusy?.(false); }
    };
    const remove = async () => {
        if (value && value !== original) await deleteVideo(value).catch(() => undefined);
        onChange('');
        setError('');
    };

    if (!isCloud) {
        return <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', background: 'var(--color-bg-subtle)', padding: '0.75rem', borderRadius: 10 }}>Videos need the cloud database, so they are not available in demo mode.</div>;
    }
    return (
        <div>
            {value ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <VideoPlayer videoRef={value} title={name} />
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => input.current?.click()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {busy ? <Loader2 size={13} className="spin" /> : <Replace size={13} />} {busy ? 'Uploading...' : 'Replace video'}
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void remove()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#d70015' }}>
                            <Trash2 size={13} /> Remove
                        </button>
                    </div>
                </div>
            ) : (
                <div
                    onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                    onDrop={e => { e.preventDefault(); setDrag(false); void take(e.dataTransfer.files?.[0]); }}
                    style={{ border: `1.5px dashed ${drag ? 'var(--color-primary)' : 'var(--color-border-hover)'}`, borderRadius: 12, padding: '1.1rem', textAlign: 'center', background: drag ? 'var(--color-bg-subtle)' : 'transparent' }}>
                    <Video size={22} color="var(--color-text-tertiary)" style={{ marginBottom: 6 }} />
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: 8 }}>Add a short video so clients can meet {name ? name.split(' ')[0] : 'the cleaner'}</div>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => input.current?.click()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {busy ? <Loader2 size={13} className="spin" /> : <Upload size={13} />} {busy ? 'Uploading, please wait...' : 'Upload video'}
                    </button>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)', marginTop: 8 }}>MP4, WebM or MOV, up to {MAX_VIDEO_BYTES / 1048576} MB</div>
                </div>
            )}
            <input ref={input} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={e => { void take(e.target.files?.[0]); e.target.value = ''; }} />
            {error && <p role="alert" style={{ margin: '8px 0 0', fontSize: '0.8125rem', color: '#d70015' }}>{error}</p>}
            <p style={{ margin: '8px 0 0', fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>The video is saved when you press Save Changes. Only your team can watch it.</p>
        </div>
    );
};
