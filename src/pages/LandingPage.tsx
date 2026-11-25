import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Brand } from '../components/shared/Brand';
import '../landing.css';

/* ---------- content ---------- */

const PHONE_DISPLAY = '+974 72262228';
const PHONE_TEL = 'tel:+97472262228';
const WHATSAPP = 'https://wa.me/97472262228';

interface Job {
    id: string;
    cleaner: string;
    start: number;
    end: number;
    client: string;
    service: string;
}

/* Sample day, shown in the product fragment. Names are placeholders. */
const DAY_START = 8;
const DAY_END = 17;
const CLEANERS = ['Amal', 'Joseph', 'Priya'];
const JOBS: Job[] = [
    { id: 'a1', cleaner: 'Amal', start: 8, end: 10.5, client: 'Villa 12', service: 'Deep clean' },
    { id: 'a2', cleaner: 'Amal', start: 11, end: 13, client: 'Al Sadd Office', service: 'Office' },
    { id: 'a3', cleaner: 'Amal', start: 14, end: 16, client: 'Tower 3, 14B', service: 'Move-out' },
    { id: 'j1', cleaner: 'Joseph', start: 8.5, end: 11, client: 'Villa 7', service: 'Deep clean' },
    { id: 'j2', cleaner: 'Joseph', start: 12, end: 14, client: 'Pearl 21', service: 'Apartment' },
    { id: 'j3', cleaner: 'Joseph', start: 15, end: 16.5, client: 'Lusail 9', service: 'Carpets' },
    { id: 'p1', cleaner: 'Priya', start: 9, end: 11, client: 'West Bay 5A', service: 'Apartment' },
    { id: 'p2', cleaner: 'Priya', start: 13, end: 15.5, client: 'Corniche Office', service: 'Office' },
];

const HOURS = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);
const fmtHour = (h: number) => `${h > 12 ? h - 12 : h}${h >= 12 ? 'pm' : 'am'}`;
const fmtTime = (h: number) => {
    const whole = Math.floor(h);
    const mins = Math.round((h - whole) * 60);
    const base = whole > 12 ? whole - 12 : whole;
    return `${base}${mins ? ':' + String(mins).padStart(2, '0') : ''}${whole >= 12 ? 'pm' : 'am'}`;
};

const SOLUTIONS = [
    {
        cls: 'lp-field-a',
        title: 'Smart booking management',
        text: 'Manage every cleaning appointment in one place. Schedule jobs, assign cleaners, and track booking status without manual work.',
    },
    {
        cls: 'lp-field-b',
        title: 'Artificial intelligence',
        text: 'Cut manual tasks with automated workflows, booking confirmations, and customer notifications. The AI Master plan adds an AI manager that reports on your business and flags problems.',
    },
    {
        cls: 'lp-field-c',
        title: 'Growth engine',
        text: 'Adapts as your team expands, your users increase, and your operations get more complex.',
    },
    {
        cls: 'lp-field-d',
        title: 'Team and staff management',
        text: 'Organize your cleaners, assign jobs, and track team performance from a single dashboard.',
    },
];

const STEPS = [
    {
        title: 'Set up your company',
        text: 'Add your services, your prices and your cleaners.',
    },
    {
        title: 'Take bookings',
        text: 'Clients book online from your booking page, or you add a job yourself in a few clicks.',
    },
    {
        title: 'Dispatch and track',
        text: 'Assign cleaners, follow every job on the calendar, and see its status as it moves from booked to done.',
    },
];

/* ---------- page ---------- */

export const LandingPage: React.FC = () => {
    const rootRef = useRef<HTMLDivElement>(null);
    const [done, setDone] = useState<Record<string, boolean>>({ a1: true, j1: true, p1: true });

    /* Arm entrance animations before first paint, reveal each part once as it enters. */
    useLayoutEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        root.classList.add('lp-js');

        const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-r]'));
        if (!('IntersectionObserver' in window)) {
            targets.forEach(t => t.classList.add('in'));
            return;
        }
        const io = new IntersectionObserver(
            entries => {
                entries.forEach(e => {
                    if (e.isIntersecting) {
                        e.target.classList.add('in');
                        io.unobserve(e.target);
                    }
                });
            },
            { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
        );
        targets.forEach(t => io.observe(t));
        return () => io.disconnect();
    }, []);

    const doneCount = useMemo(() => JOBS.filter(j => done[j.id]).length, [done]);
    const toggleJob = (id: string) => setDone(prev => ({ ...prev, [id]: !prev[id] }));

    const span = DAY_END - DAY_START;

    return (
        <div className="lp" ref={rootRef}>
            {/* Navigation */}
            <header className="lp-nav">
                <div className="lp-wrap lp-nav-in">
                    <Link to="/" className="lp-brand" aria-label="CleanBase home">
                        <Brand size={20} />
                    </Link>
                    <nav className="lp-nav-links" aria-label="Sections">
                        <a href="#solutions">Solutions</a>
                        <a href="#how">How it works</a>
                        <a href="#contact">Contact us</a>
                    </nav>
                    <div className="lp-nav-actions">
                        <Link to="/login" className="lp-btn lp-btn-ghost lp-btn-sm">Login</Link>
                        <Link to="/register" className="lp-btn lp-btn-primary lp-btn-sm">Sign up</Link>
                    </div>
                </div>
            </header>

            <main>
                {/* Hero */}
                <section className="lp-hero" aria-labelledby="hero-title">
                    <div className="lp-wrap">
                        <h1 id="hero-title" className="lp-h1" data-r style={{ ['--d' as string]: 0 }}>
                            Run your business smarter.
                        </h1>
                        <p className="lp-lead" data-r style={{ ['--d' as string]: 1 }}>
                            CleanBase System is an all-in-one CRM for cleaning companies. It automates operations,
                            manages bookings, and helps you scale faster.
                        </p>
                        <div className="lp-hero-cta" data-r style={{ ['--d' as string]: 2 }}>
                            <a href="#how" className="lp-btn lp-btn-primary">How it works</a>
                            <a href={PHONE_TEL} className="lp-btn lp-btn-dark">{PHONE_DISPLAY}</a>
                        </div>

                        <div className="lp-hero-stage">
                            <div className="lp-ui" data-ui data-r style={{ ['--d' as string]: 3 }}>
                                <div className="lp-ui-bar">
                                    <div>
                                        <div className="lp-ui-title">Today's schedule</div>
                                        <div className="lp-ui-sub">{JOBS.length} jobs across {CLEANERS.length} cleaners. Tap a job to mark it done.</div>
                                    </div>
                                    <div className="lp-ui-progress" aria-live="polite">
                                        <span>{doneCount} of {JOBS.length} done</span>
                                        <span className="lp-ui-meter" aria-hidden="true">
                                            <i style={{ width: `${(doneCount / JOBS.length) * 100}%` }} />
                                        </span>
                                    </div>
                                </div>
                                <div className="lp-sched">
                                    <div className="lp-sched-hours" aria-hidden="true">
                                        <span />
                                        {HOURS.map(h => <span key={h}>{fmtHour(h)}</span>)}
                                    </div>
                                    {CLEANERS.map(name => (
                                        <div className="lp-sched-row" key={name}>
                                            <div className="lp-sched-who">
                                                <span className="lp-avatar" aria-hidden="true">{name[0]}</span>
                                                {name}
                                            </div>
                                            <div className="lp-sched-track">
                                                {JOBS.filter(j => j.cleaner === name).map(j => (
                                                    <button
                                                        key={j.id}
                                                        type="button"
                                                        className="lp-job"
                                                        aria-pressed={!!done[j.id]}
                                                        onClick={() => toggleJob(j.id)}
                                                        aria-label={`${j.service} at ${j.client}, ${fmtTime(j.start)} to ${fmtTime(j.end)}, ${done[j.id] ? 'done' : 'not done'}`}
                                                        style={{
                                                            left: `${((j.start - DAY_START) / span) * 100}%`,
                                                            width: `calc(${((j.end - j.start) / span) * 100}% - 4px)`,
                                                        }}
                                                    >
                                                        <span>{j.client}</span>
                                                        <small>{j.service}</small>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <p className="lp-ui-note">Sample data.</p>
                            </div>
                        </div>
                    </div>
                    <div style={{ height: 'clamp(64px, 9vw, 128px)' }} />
                </section>

                {/* Problems */}
                <section className="lp-tile lp-dark" aria-labelledby="problems-title">
                    <div className="lp-wrap">
                        <h2 id="problems-title" className="lp-h2" data-r style={{ ['--d' as string]: 0 }}>
                            The core problems cleaning companies face
                        </h2>
                        <div className="lp-problems-grid">
                            <div>
                                <p className="lp-lead" data-r style={{ ['--d' as string]: 1 }}>
                                    Running a cleaning business shouldn't be chaotic. Many companies still rely on phone
                                    calls, spreadsheets, and manual scheduling, which leads to missed bookings, lost
                                    revenue, and operational stress.
                                </p>
                                <div className="lp-stats">
                                    <div className="lp-stat" data-r style={{ ['--d' as string]: 2 }}>
                                        <div className="lp-stat-n">60%</div>
                                        <h3>Scheduling chaos</h3>
                                        <p>Most cleaning companies struggle with manual booking management, which causes double bookings and missed appointments.</p>
                                    </div>
                                    <div className="lp-stat" data-r style={{ ['--d' as string]: 3 }}>
                                        <div className="lp-stat-n">50%</div>
                                        <h3>Lost revenue</h3>
                                        <p>Without a proper system to track bookings and payments, many cleaning businesses lose potential revenue every month.</p>
                                    </div>
                                </div>
                            </div>
                            <div className="lp-photo" data-r style={{ ['--d' as string]: 2 }}>
                                <img
                                    src="/team.jpg"
                                    alt="Two colleagues going through paperwork at a desk with a laptop"
                                    width={1400}
                                    height={738}
                                    loading="lazy"
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* Solutions */}
                <section id="solutions" className="lp-tile lp-white" aria-labelledby="solutions-title">
                    <div className="lp-wrap">
                        <div className="lp-solutions-head">
                            <h2 id="solutions-title" className="lp-h2" data-r style={{ ['--d' as string]: 0 }}>
                                The solution for modern cleaning businesses
                            </h2>
                            <p className="lp-lead" data-r style={{ ['--d' as string]: 1 }}>
                                CleanBase is an all-in-one platform that simplifies operations for cleaning companies,
                                from managing bookings and teams to tracking revenue and automating daily workflows.
                            </p>
                        </div>
                        <div className="lp-bento">
                            {SOLUTIONS.map((s, i) => (
                                <article key={s.title} className={`lp-field ${s.cls}`} data-r style={{ ['--d' as string]: i % 2 }}>
                                    <h3>{s.title}</h3>
                                    <p>{s.text}</p>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                {/* How it works */}
                <section id="how" className="lp-tile lp-parchment" aria-labelledby="how-title">
                    <div className="lp-wrap lp-how">
                        <div className="lp-how-head">
                            <h2 id="how-title" className="lp-h2" data-r style={{ ['--d' as string]: 0 }}>
                                How it works
                            </h2>
                            <p className="lp-lead" data-r style={{ ['--d' as string]: 1, marginTop: 20 }}>
                                Three steps from an empty workspace to a full day of jobs.
                            </p>
                            <Link to="/register" className="lp-btn lp-btn-primary" data-r style={{ ['--d' as string]: 2 }}>
                                Create your account
                            </Link>
                        </div>
                        <ol className="lp-steps">
                            {STEPS.map((s, i) => (
                                <li key={s.title} className="lp-step" data-r style={{ ['--d' as string]: i }}>
                                    <h3>{s.title}</h3>
                                    <p>{s.text}</p>
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>

                {/* Call to action */}
                <section id="contact" className="lp-tile lp-white" aria-labelledby="cta-title">
                    <div className="lp-wrap lp-cta">
                        <div>
                            <h2 id="cta-title" className="lp-h2" data-r style={{ ['--d' as string]: 0 }}>
                                Want to know our plans and prices?
                            </h2>
                            <p className="lp-lead" data-r style={{ ['--d' as string]: 1, marginTop: 20 }}>
                                Contact us and we will recommend the right plan for your cleaning company and agree the price together.
                            </p>
                            <div className="lp-cta-actions" data-r style={{ ['--d' as string]: 2 }}>
                                <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="lp-btn lp-btn-primary">
                                    Contact us
                                </a>
                            </div>
                        </div>
                        <div className="lp-cta-right" data-r style={{ ['--d' as string]: 2 }}>
                            <p className="lp-body">Prefer to talk? Call us.</p>
                            <a href={PHONE_TEL} className="lp-phone">{PHONE_DISPLAY}</a>
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="lp-footer">
                <div className="lp-wrap">
                    <div className="lp-foot-top">
                        <div>
                            <Brand size={22} />
                            <p>Automate operations, manage staff, and grow revenue faster.</p>
                        </div>
                        <a
                            href="https://xtechnology.group/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="lp-powered"
                        >
                            <img src="/xtech.png" alt="" />
                            <span>Powered by <b>XTechnology Group</b></span>
                        </a>
                    </div>
                    <div className="lp-bigname" aria-hidden="true">
                        <svg viewBox="0 0 1000 150" role="presentation">
                            <text
                                x="0"
                                y="128"
                                textLength="1000"
                                lengthAdjust="spacingAndGlyphs"
                                fontFamily="Inter, system-ui, sans-serif"
                                fontWeight="700"
                                fontSize="168"
                                letterSpacing="-6"
                                fill="currentColor"
                            >
                                CleanBase
                            </text>
                        </svg>
                    </div>
                    <p className="lp-copy">&copy; {new Date().getFullYear()} CleanBase. All rights reserved. Built for cleaning services. <Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy</Link></p>
                </div>
            </footer>
        </div>
    );
};
