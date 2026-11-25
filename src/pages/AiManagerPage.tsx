import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Bell, Clock, Eye, FileText, MessageCircle, Send } from 'lucide-react';
import { fmt0, useDB } from '../services/erp';
import { buildSnapshot, dailyReport, detectLang, findIssues, modelContext, respond } from '../services/aiManager';
import type { Action, Lang, Reply } from '../services/aiManager';
import { askModel, modelEnabled } from '../services/aiModel';
import { hasAiManager, PLANS } from '../services/plans';
import { Kpi, PageHeader, Panel, Pill, Empty } from '../components/shared/ui';

interface Msg { id: number; role: 'me' | 'ai'; text: string; reply?: Reply }

const SUGGESTIONS: Record<Lang, string[]> = {
    en: ['How are sales today?', 'What went wrong today?', 'Which jobs have no cleaner?', 'Who owes us money?', 'Best cleaner this week?', "What's booked for tomorrow?", 'Give me the daily report'],
    ar: ['شحال بعنا اليوم؟', 'شنو المشاكل اللي وقعت اليوم؟', 'شنو الحجوزات بلا عاملة؟', 'شكون خاصو يخلصنا؟', 'شكون أحسن عاملة هاد الأسبوع؟', 'شنو عندنا غدا؟', 'عطيني تقرير اليوم'],
};

const WHATSAPP = 'https://wa.me/97472262228';

export const AiManagerPage: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const companyId = user?.companyId || '';
    const db = useDB();
    const company = db.companies.find(c => c.id === companyId);
    const allowed = hasAiManager(company?.subscriptionPlan);

    const [lang, setLang] = useState<Lang>('en');
    const [msgs, setMsgs] = useState<Msg[]>([]);
    const [input, setInput] = useState('');
    const [thinking, setThinking] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);
    const nextId = useRef(1);

    const snap = useMemo(() => buildSnapshot(db, companyId), [db, companyId]);
    const issues = useMemo(() => findIssues(snap, db, companyId, lang), [snap, db, companyId, lang]);
    const first = (user?.name || '').split(' ')[0];

    // Greeting, built from the real numbers, once per language.
    useEffect(() => {
        if (!allowed) return;
        const h = new Date().getHours();
        const hello = lang === 'ar'
            ? (h < 12 ? 'صباح الخير' : h < 18 ? 'مساء الخير' : 'مساء النور')
            : (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
        const text = lang === 'ar'
            ? `${hello}${first ? ' ' + first : ''}. أنا المدير الذكي ديال ${snap.company}. لحد الآن اليوم: ${fmt0(snap.revenueToday)} ريال من ${snap.completed.length} خدمات منتهية، وباقي ${snap.upcoming.length + snap.inProgress.length} خدمات.${issues.length ? ` كاين ${issues.length} حاجات خاصها انتباه.` : ' ما كاين والو كيقلق دابا.'} سولني أي حاجة.`
            : `${hello}${first ? ' ' + first : ''}. I'm the AI manager for ${snap.company}. So far today: ${fmt0(snap.revenueToday)} QAR from ${snap.completed.length} finished job${snap.completed.length === 1 ? '' : 's'}, with ${snap.upcoming.length + snap.inProgress.length} still to do.${issues.length ? ` ${issues.length} thing${issues.length === 1 ? '' : 's'} need${issues.length === 1 ? 's' : ''} your attention.` : ' Nothing is worrying me right now.'} Ask me anything about your business.`;
        setMsgs([{ id: nextId.current++, role: 'ai', text }]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allowed, lang]);

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, thinking]);

    if (!allowed) {
        const interest = `${WHATSAPP}?text=${encodeURIComponent('Hello, I would like to hear when the CleanBase AI Manager is ready.')}`;
        return (
            <div className="pg">
                <section className="soon" aria-labelledby="soon-title">
                    <div className="soon-copy">
                        <span className="soon-tag"><Clock size={14} /> Coming soon</span>
                        <h1 id="soon-title">Your AI manager is on the way</h1>
                        <p className="soon-lead">Ask your business a question in plain words and get an answer built from your own bookings, money and team. No reports to open, no numbers to add up.</p>
                        <div className="soon-actions">
                            <a className="btn btn-primary" href={interest} target="_blank" rel="noopener noreferrer"><Bell size={15} /> Tell me when it is ready</a>
                            <span className="tiny">Your plan: {PLANS[company?.subscriptionPlan || 'pro']?.name || 'none'}. Nothing to set up now.</span>
                        </div>
                    </div>

                    <div className="soon-demo" aria-hidden="true">
                        <span className="soon-demo-label">Preview</span>
                        <div className="bubble me">How are sales today?</div>
                        <div className="bubble ai">240 QAR from 2 finished jobs, with 1 still to do. Nothing is worrying me right now.</div>
                        <div className="bubble me">Who owes us money?</div>
                        <div className="bubble ai">Two invoices are waiting. The oldest is 6 days late. Want me to write the reminder for WhatsApp?</div>
                    </div>
                </section>

                <div className="soon-grid">
                    <div className="soon-card"><span className="soon-ico"><MessageCircle size={20} /></span><h2>Ask like you would ask a person</h2><p>Type a question in English or Arabic. Sales today, who is free tomorrow, which jobs have no cleaner.</p></div>
                    <div className="soon-card"><span className="soon-ico"><Eye size={20} /></span><h2>Sees what you would miss</h2><p>Late invoices, empty slots and unhappy clients are pointed out before they cost you money.</p></div>
                    <div className="soon-card"><span className="soon-ico"><FileText size={20} /></span><h2>A daily report in one tap</h2><p>The day in a short message you can send to your team on WhatsApp.</p></div>
                </div>
            </div>
        );
    }

    const send = async (raw: string) => {
        const question = raw.trim();
        if (!question || thinking) return;
        setInput('');
        const mine: Msg = { id: nextId.current++, role: 'me', text: question };
        setMsgs(m => [...m, mine]);
        setThinking(true);

        const replyLang: Lang = lang === 'ar' ? 'ar' : detectLang(question);
        const qIssues = findIssues(snap, db, companyId, replyLang);
        const engine = respond(question, snap, qIssues, db, companyId, first, replyLang);

        let reply: Reply = engine;
        let text = engine.text;
        if (modelEnabled) {
            const history = msgs.filter(m => m.id !== 1).map(m => ({ role: m.role === 'me' ? 'user' as const : 'assistant' as const, content: m.text }));
            const phrased = await askModel(question, history, modelContext(snap, qIssues));
            if (phrased) { text = phrased; reply = { text: phrased, actions: engine.actions }; }
        } else {
            await new Promise(r => setTimeout(r, 450));      // a short pause reads more naturally than an instant wall of text
        }
        setMsgs(m => [...m, { id: nextId.current++, role: 'ai', text, reply }]);
        setThinking(false);
    };

    const report = dailyReport(snap, issues, lang);
    const run = (a: Action) => (a.to ? navigate(a.to) : a.href ? window.open(a.href, '_blank', 'noopener') : undefined);

    return (
        <div className="pg" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <PageHeader title="AI Manager" subtitle={lang === 'ar' ? 'مدير كيقرا الحجوزات والفلوس والفريق الحقيقيين ديالك، وكيقولك شنو مهم.' : 'A manager that reads your real bookings, money and team, and tells you what matters.'}>
                <div className="tabs" role="group" aria-label="Language">
                    <button aria-selected={lang === 'en'} onClick={() => setLang('en')}>English</button>
                    <button aria-selected={lang === 'ar'} onClick={() => setLang('ar')}>العربية</button>
                </div>
            </PageHeader>

            <div className="ai-grid">
                <section className="ai-chat" aria-label="Chat with your AI manager">
                    <div className="ai-msgs" role="log" aria-live="polite">
                        {msgs.map(m => (
                            <div key={m.id} className={`bubble ${m.role}`}>
                                <div>{m.text}</div>
                                {m.reply?.items && m.reply.items.length > 0 && <ul>{m.reply.items.map((it, i) => <li key={i}>{it}</li>)}</ul>}
                                {m.reply?.actions && m.reply.actions.length > 0 && (
                                    <div className="acts">
                                        {m.reply.actions.map((a, i) => a.href
                                            ? <a key={i} className="btn btn-secondary btn-sm" href={a.href} target="_blank" rel="noopener noreferrer">{a.label}</a>
                                            : <button key={i} className="btn btn-secondary btn-sm" onClick={() => run(a)}>{a.label}</button>)}
                                    </div>
                                )}
                            </div>
                        ))}
                        {thinking && <div className="bubble ai" aria-label="The manager is thinking"><span className="dots"><i /><i /><i /></span></div>}
                        <div ref={endRef} />
                    </div>
                    <div className="chips">
                        {SUGGESTIONS[lang].map(s => <button key={s} className="chip" onClick={() => void send(s)} disabled={thinking}>{s}</button>)}
                    </div>
                    <form className="ai-input" onSubmit={e => { e.preventDefault(); void send(input); }}>
                        <input value={input} onChange={e => setInput(e.target.value)} placeholder={lang === 'ar' ? 'سولني على المبيعات، الحجوزات، المشاكل...' : 'Ask about sales, bookings, problems...'} aria-label="Your question" />
                        <button type="submit" className="btn btn-primary" disabled={!input.trim() || thinking} aria-label="Send"><Send size={16} /></button>
                    </form>
                </section>

                <div className="stack">
                    <div className="kpis" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <Kpi label={lang === 'ar' ? 'مبيعات اليوم' : 'Sales today'} value={fmt0(snap.revenueToday)} unit="QAR" hint={lang === 'ar' ? `${snap.completed.length} خدمات منتهية` : `${snap.completed.length} jobs done`} />
                        <Kpi label={lang === 'ar' ? 'باقي اليوم' : 'Still to come'} value={fmt0(snap.stillToCome)} unit="QAR" hint={lang === 'ar' ? `${snap.upcoming.length + snap.inProgress.length} خدمات` : `${snap.upcoming.length + snap.inProgress.length} jobs`} />
                    </div>

                    <Panel title={lang === 'ar' ? 'مشاكل خاصها حل' : 'Problems to fix'} subtitle={lang === 'ar' ? 'مرتبة حسب الأهمية، مع الحل المقترح' : 'Most urgent first, each with the suggested fix'}>
                        {issues.length === 0 ? <Empty>{lang === 'ar' ? 'ما كاين والو كيقلق دابا.' : 'Nothing needs fixing right now.'}</Empty> : (
                            <div className="stack" style={{ gap: '0.6rem' }}>
                                {issues.map(i => (
                                    <div className={`issue ${i.severity}`} key={i.id}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{i.title}</b><Pill tone={i.severity === 'high' ? 'bad' : i.severity === 'medium' ? 'warn' : undefined}>{i.severity}</Pill></div>
                                        <div className="fix">{i.detail}</div>
                                        <div className="fix"><b style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{lang === 'ar' ? 'الحل: ' : 'Fix: '}</b>{i.fixes[0]}</div>
                                        <div className="acts" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {i.actions.map((a, n) => a.href
                                                ? <a key={n} className="btn btn-secondary btn-sm" href={a.href} target="_blank" rel="noopener noreferrer">{a.label}</a>
                                                : <Link key={n} className="btn btn-secondary btn-sm" to={a.to || '/app'}>{a.label}</Link>)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Panel>

                    <Panel title={lang === 'ar' ? 'التقرير اليومي' : 'Daily report'} actions={
                        <>
                            <button className="btn btn-secondary btn-sm" onClick={() => void navigator.clipboard.writeText(report)}>{lang === 'ar' ? 'نسخ' : 'Copy'}</button>
                            <a className="btn btn-primary btn-sm" href={`https://wa.me/?text=${encodeURIComponent(report)}`} target="_blank" rel="noopener noreferrer">{lang === 'ar' ? 'شارك فـ WhatsApp' : 'Share on WhatsApp'}</a>
                        </>}>
                        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.875rem', lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>{report}</pre>
                    </Panel>
                </div>
            </div>
        </div>
    );
};
