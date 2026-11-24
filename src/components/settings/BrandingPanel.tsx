import React, { useRef, useState } from 'react';
import { Save, Upload, Trash2, RotateCcw, ExternalLink, AlertTriangle } from 'lucide-react';
import type { Company } from '../../types';
import { brandVars, DEFAULT_PRIMARY, isHex, normalizeHex, PRESETS, resizeLogo, tooLight } from '../../services/branding';
import { storeLink } from '../../services/store';

interface Props { company: Company; setCompany: (c: Company) => void; onSave: () => void; saving: boolean }

/** Settings tab: logo, brand colours and tagline for the public booking page, with a live preview. */
export const BrandingPanel: React.FC<Props> = ({ company, setCompany, onSave, saving }) => {
    const fileRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState('');
    const [dragging, setDragging] = useState(false);

    const primary = isHex(company.brandColor) ? company.brandColor : DEFAULT_PRIMARY;
    const accentSet = isHex(company.brandAccent) ? company.brandAccent : '';
    const vars = brandVars({ primary: company.brandColor, accent: company.brandAccent });
    const accent = vars['--brand-soft'];

    const [hexText, setHexText] = useState(primary);
    const [accentText, setAccentText] = useState(accent);
    const setPrimary = (v: string) => { setHexText(v); const h = normalizeHex(v); if (h) setCompany({ ...company, brandColor: h }); };
    const setAccent = (v: string) => { setAccentText(v); const h = normalizeHex(v); if (h) setCompany({ ...company, brandAccent: h }); };
    const applyPreset = (p: { primary: string; accent: string }) => { setHexText(p.primary); setAccentText(p.accent); setCompany({ ...company, brandColor: p.primary, brandAccent: p.accent }); };
    const reset = () => {
        setHexText(DEFAULT_PRIMARY); setAccentText(brandVars({}) ['--brand-soft']);
        setCompany({ ...company, logo: undefined, brandColor: undefined, brandAccent: undefined, tagline: undefined });
        setError('');
    };

    const takeFile = async (file?: File | null) => {
        if (!file) return;
        setError('');
        try { setCompany({ ...company, logo: await resizeLogo(file) }); }
        catch (e) { setError(e instanceof Error ? e.message : 'Could not use this image.'); }
    };

    const lbl: React.CSSProperties = { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 };
    const section: React.CSSProperties = { marginBottom: '1.5rem' };
    const swatch = (hex: string, on: boolean): React.CSSProperties => ({ width: 28, height: 28, borderRadius: 8, border: on ? '2px solid var(--color-text-primary)' : '1px solid var(--color-border)', background: hex, cursor: 'pointer', padding: 0 });

    return (
        <div className="card" style={{ padding: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: '1.25rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--color-border)' }}>
                <div>
                    <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>Booking page branding</h2>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Your logo and colours appear on the page your clients use to book.</p>
                </div>
                <a href={storeLink(company.id)} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', textDecoration: 'none' }}>
                    <ExternalLink size={14} /> Open booking page
                </a>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', alignItems: 'start' }}>
                <div>
                    {/* Logo */}
                    <div style={section}>
                        <label style={lbl}>Logo</label>
                        <div
                            onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
                            onDrop={e => { e.preventDefault(); setDragging(false); void takeFile(e.dataTransfer.files?.[0]); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 12, border: `1.5px dashed ${dragging ? primary : 'var(--color-border-hover)'}`, background: dragging ? 'var(--color-bg-subtle)' : 'transparent' }}>
                            <div style={{ width: 72, height: 72, borderRadius: 14, border: '1px solid var(--color-border)', background: '#fff', display: 'grid', placeItems: 'center', overflow: 'hidden', flex: 'none' }}>
                                {company.logo ? <img src={company.logo} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                    : <span style={{ fontWeight: 700, fontSize: '1.5rem', color: primary }}>{company.name.charAt(0).toUpperCase()}</span>}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => fileRef.current?.click()}>
                                        <Upload size={14} /> {company.logo ? 'Replace' : 'Upload logo'}
                                    </button>
                                    {company.logo && (
                                        <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: 6, color: '#d70015' }} onClick={() => setCompany({ ...company, logo: undefined })}>
                                            <Trash2 size={14} /> Remove
                                        </button>
                                    )}
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>PNG, JPG or WebP. Drag a file here too. A square logo with a clear background works best.</span>
                            </div>
                            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { void takeFile(e.target.files?.[0]); e.target.value = ''; }} />
                        </div>
                        {error && <p role="alert" style={{ margin: '8px 0 0', fontSize: '0.8125rem', color: '#d70015' }}>{error}</p>}
                    </div>

                    {/* Colours */}
                    <div style={section}>
                        <label style={lbl}>Ready-made palettes</label>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {PRESETS.map(p => (
                                <button key={p.name} type="button" title={p.name} aria-label={`${p.name} palette`} onClick={() => applyPreset(p)}
                                    style={swatch(p.primary, primary.toLowerCase() === p.primary)} />
                            ))}
                        </div>
                    </div>

                    <div style={{ ...section, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div>
                            <label style={lbl}>Main colour (buttons, highlights)</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input type="color" value={primary} onChange={e => setPrimary(e.target.value)} aria-label="Main colour" style={{ width: 42, height: 40, padding: 2, border: '1px solid var(--color-border)', borderRadius: 8, background: '#fff', cursor: 'pointer' }} />
                                <input className="input-field" value={hexText} onChange={e => setPrimary(e.target.value)} onBlur={() => setHexText(primary)} maxLength={7} spellCheck={false} style={{ fontFamily: 'monospace' }} />
                            </div>
                        </div>
                        <div>
                            <label style={lbl}>Soft colour (header, backgrounds)</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input type="color" value={accent} onChange={e => setAccent(e.target.value)} aria-label="Soft colour" style={{ width: 42, height: 40, padding: 2, border: '1px solid var(--color-border)', borderRadius: 8, background: '#fff', cursor: 'pointer' }} />
                                <input className="input-field" value={accentText} onChange={e => setAccent(e.target.value)} onBlur={() => setAccentText(accent)} maxLength={7} spellCheck={false} style={{ fontFamily: 'monospace' }} />
                            </div>
                            {!accentSet && <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>Automatic from the main colour</span>}
                        </div>
                    </div>
                    {tooLight(primary) && (
                        <p style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '-0.5rem 0 1.25rem', fontSize: '0.8125rem', color: '#8a5a00', background: 'rgba(255,159,10,.12)', padding: '8px 10px', borderRadius: 8 }}>
                            <AlertTriangle size={15} style={{ flex: 'none', marginTop: 1 }} /> This main colour is very light. Buttons may be hard to see on a white page. A darker colour reads better.
                        </p>
                    )}

                    <div style={section}>
                        <label style={lbl}>Tagline (optional)</label>
                        <input className="input-field" value={company.tagline || ''} maxLength={80} placeholder="Book a cleaning online"
                            onChange={e => setCompany({ ...company, tagline: e.target.value || undefined })} />
                    </div>
                </div>

                {/* Live preview */}
                <div>
                    <label style={lbl}>Preview</label>
                    <div style={{ ...(vars as React.CSSProperties), border: '1px solid var(--color-border)', borderRadius: 16, overflow: 'hidden', background: '#f5f5f7', maxWidth: 360 }}>
                        <div style={{ background: 'var(--brand-soft)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '3px solid var(--brand)' }}>
                            <div style={{ width: 42, height: 42, borderRadius: 10, background: '#fff', display: 'grid', placeItems: 'center', overflow: 'hidden', flex: 'none' }}>
                                {company.logo ? <img src={company.logo} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                    : <b style={{ color: 'var(--brand)' }}>{company.name.charAt(0).toUpperCase()}</b>}
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--brand-soft-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{company.name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--brand-soft-ink)', opacity: .75 }}>{company.tagline || 'Book a cleaning online'}</div>
                            </div>
                        </div>
                        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <span style={{ flex: 1, height: 4, borderRadius: 4, background: 'var(--brand)' }} />
                                <span style={{ flex: 1, height: 4, borderRadius: 4, background: '#d8d8dc' }} />
                                <span style={{ flex: 1, height: 4, borderRadius: 4, background: '#d8d8dc' }} />
                            </div>
                            <div style={{ background: '#fff', borderRadius: 14, padding: 14, border: '2px solid var(--brand)' }}>
                                <b style={{ fontSize: '0.9375rem' }}>Deep cleaning</b>
                                <div style={{ fontSize: '0.75rem', color: '#6e6e73', margin: '2px 0 8px' }}>Home cleaning, 5h</div>
                                <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>120 <small style={{ fontSize: '0.6875rem', color: '#6e6e73' }}>QAR</small></div>
                            </div>
                            <button type="button" tabIndex={-1} style={{ border: 0, borderRadius: 999, padding: '11px 16px', background: 'var(--brand)', color: 'var(--brand-ink)', fontWeight: 600, cursor: 'default' }}>Continue</button>
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                <button type="button" className="btn btn-secondary" onClick={reset} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem' }}>
                    <RotateCcw size={14} /> Reset to default
                </button>
                <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', padding: '0.55rem 1rem' }}>
                    <Save size={15} /> <span>{saving ? 'Saving...' : 'Save branding'}</span>
                </button>
            </div>
        </div>
    );
};
