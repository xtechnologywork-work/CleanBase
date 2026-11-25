import React from 'react';

/**
 * Catches a crash while a screen is drawing, so the person sees a message and a way out instead of a blank page.
 * A page file that is no longer on the server (the site was updated while the tab was open) is fixed by reloading once, automatically.
 */
const RELOAD_KEY = 'cb_chunk_reload';
const isChunkError = (e: unknown) => /dynamically imported module|Importing a module script failed|error loading dynamically|Loading chunk/i.test(String((e as Error)?.message || e));

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError() { return { failed: true }; }

    componentDidCatch(error: unknown) {
        console.error('[CleanBase] a screen crashed:', error);
        if (isChunkError(error)) {
            try {
                if (sessionStorage.getItem(RELOAD_KEY) !== '1') { sessionStorage.setItem(RELOAD_KEY, '1'); window.location.reload(); }
            } catch { /* storage blocked: the message below is shown */ }
        }
    }

    render() {
        if (!this.state.failed) return this.props.children;
        return (
            <div role="alert" style={{ maxWidth: 480, margin: '14vh auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif', color: '#1d1d1f', textAlign: 'center' }}>
                <h1 style={{ fontSize: '1.5rem', margin: 0, letterSpacing: '-0.02em' }}>Something went wrong</h1>
                <p style={{ color: '#5f5f68', lineHeight: 1.5 }}>
                    This screen could not be shown. Your data is safe. Reload the page, and if it keeps happening, contact the CleanBase team.
                </p>
                <button type="button" onClick={() => { try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* ignore */ } window.location.reload(); }}
                    style={{ marginTop: 8, minHeight: 46, padding: '0 28px', border: 0, borderRadius: 9999, background: '#0066cc', color: '#fff', font: 'inherit', fontSize: 16, cursor: 'pointer' }}>
                    Reload the page
                </button>
            </div>
        );
    }
}
