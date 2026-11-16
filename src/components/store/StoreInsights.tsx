import React, { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { isCloud } from '../../services/backend';
import { fetchInsights, FUNNEL } from '../../services/storeInsights';
import type { Insights } from '../../services/storeInsights';
import { Empty, Kpi, Panel, Tabs } from '../shared/ui';

type Range = '7' | '30' | '90';
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Who opened the booking store, how far they got, and how many sent a request. Refreshes every 20 seconds. */
export const StoreInsights: React.FC<{ companyId: string }> = ({ companyId }) => {
    const [range, setRange] = useState<Range>('30');
    const [data, setData] = useState<Insights | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        const run = () => fetchInsights(companyId, Number(range))
            .then(d => { if (alive) { setData(d); setFailed(false); } })
            .catch(() => { if (alive) setFailed(true); });
        void run();
        const timer = window.setInterval(run, 20_000);
        window.addEventListener('cleanbase-data-changed', run);
        return () => { alive = false; window.clearInterval(timer); window.removeEventListener('cleanbase-data-changed', run); };
    }, [companyId, range]);

    const visitors = data?.steps.view || 0;
    const sent = data?.steps.request || 0;
    const chart = (data?.daily || []).map(d => ({ ...d, name: short(d.day) }));

    return (
        <Panel title="Store insights" subtitle="Who opened your link and how many booked. Visitors are counted with no personal data."
            actions={<Tabs value={range} onChange={setRange} tabs={[{ id: '7', label: '7 days' }, { id: '30', label: '30 days' }, { id: '90', label: '90 days' }]} />}>
            {failed ? <Empty>Insights are not set up yet. Run the latest MASTER_SETUP.sql in Supabase, then reload this page.</Empty> : !data ? <p className="tiny">Loading...</p> : (
                <div className="stack">
                    <div className="kpis">
                        <Kpi label="Visitors" value={visitors} hint="People who opened your store link" />
                        <Kpi label="Live now" value={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: data.activeNow ? 'var(--color-success)' : 'var(--color-border-hover)' }} />{data.activeNow}</span>}
                            hint="On the store in the last 2 minutes" />
                        <Kpi label="Requests" value={data.requests} hint={`${data.accepted} accepted`} />
                        <Kpi label="Conversion rate" value={pct(sent, visitors)} unit="%" tone={visitors && !sent ? 'warn' : undefined} hint="Visitors who sent a request" />
                    </div>

                    {visitors === 0 ? <Empty>No visits in this period yet. Share your store link on WhatsApp, Instagram or Google to start getting bookings.</Empty> : (
                        <div className="grid2e">
                            <div className="stack" style={{ gap: 12 }}>
                                <b style={{ fontWeight: 600 }}>Where visitors stop</b>
                                {FUNNEL.map((f, i) => {
                                    const n = data.steps[f.step] || 0;
                                    const prev = i ? data.steps[FUNNEL[i - 1].step] || 0 : 0;
                                    return (
                                        <div key={f.step}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                                                <span>{f.label}</span>
                                                <span className="tiny">{n} · {pct(n, visitors)}%{i > 0 && prev > n ? ` · ${prev - n} left here` : ''}</span>
                                            </div>
                                            <div style={{ height: 8, background: 'var(--color-bg-body)', borderRadius: 99, overflow: 'hidden' }} aria-hidden="true">
                                                <div style={{ width: `${Math.min(100, pct(n, visitors))}%`, height: '100%', background: f.step === 'request' ? 'var(--color-success)' : '#0066cc', borderRadius: 99 }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div>
                                <b style={{ fontWeight: 600 }}>Day by day</b>
                                <div style={{ height: 240, marginTop: 8 }} role="img" aria-label="Visitors and requests per day">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chart} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ededf0" />
                                            <XAxis dataKey="name" stroke="#86868b" fontSize={11} tickLine={false} axisLine={false} minTickGap={18} />
                                            <YAxis allowDecimals={false} stroke="#86868b" fontSize={11} tickLine={false} axisLine={false} />
                                            <Tooltip contentStyle={{ borderRadius: 10, border: 'none', fontSize: 12, boxShadow: 'var(--shadow-lg)' }} />
                                            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                                            <Bar dataKey="visitors" name="Visitors" fill="#0066cc" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="requests" name="Requests" fill="#248a3d" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    )}
                    {isCloud && <div className="tiny">Your own visits while you are signed in are not counted.</div>}
                </div>
            )}
        </Panel>
    );
};
