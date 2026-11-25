import React, { useEffect, useState } from 'react';
import { isCloud } from '../../services/backend';
import type { SyncState } from '../../services/replicate';

/** Small status pill: shows when changes are saving, offline, or refused by the database. */
export const SyncStatus: React.FC = () => {
    const [state, setState] = useState<SyncState>('idle');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (!isCloud) return;
        let hide: ReturnType<typeof setTimeout> | undefined;
        const h = (e: Event) => {
            const d = (e as CustomEvent<{ state: SyncState; message?: string }>).detail;
            setState(d.state);
            setMessage(d.message || '');
            if (hide) clearTimeout(hide);
            if (d.state === 'saved') hide = setTimeout(() => setState('idle'), 1800);
            if (d.state === 'error') hide = setTimeout(() => setState('idle'), 20000);
        };
        window.addEventListener('cleanbase-sync', h);
        return () => { window.removeEventListener('cleanbase-sync', h); if (hide) clearTimeout(hide); };
    }, []);

    if (!isCloud || state === 'idle') return null;
    const text = state === 'saving' ? 'Saving...' : state === 'saved' ? 'All changes saved' : message || 'Offline';
    const bad = state === 'error' || state === 'offline';
    return (
        <div
            role="status"
            aria-live="polite"
            onClick={() => { if (bad) setState('idle'); }}
            title={bad ? 'Click to dismiss' : undefined}
            style={{
                cursor: bad ? 'pointer' : undefined,
                position: 'fixed', left: 16, bottom: 16, zIndex: 300, maxWidth: 360,
                padding: '0.5rem 0.9rem', borderRadius: 9999, fontSize: '0.8125rem', fontWeight: 600,
                background: bad ? 'var(--color-danger)' : 'var(--color-tile-dark)', color: '#fff',
            }}
        >
            {text}
        </div>
    );
};
