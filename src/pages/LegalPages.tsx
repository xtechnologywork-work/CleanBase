import React from 'react';
import { Link } from 'react-router-dom';
import { Brand } from '../components/shared/Brand';
import '../auth.css';

const UPDATED = '25 November 2026';
const CONTACT = '+974 72262228';

const Shell: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="auth">
        <div className="auth-top"><Link to="/" aria-label="CleanBase home"><Brand size={20} /></Link></div>
        <main className="auth-main legal-main">
            <article className="legal">
                <h1>{title}</h1>
                <p className="auth-hint">Last updated {UPDATED}</p>
                {children}
                <p className="legal-nav"><Link to="/terms">Terms of Service</Link> · <Link to="/privacy">Privacy Policy</Link> · <Link to="/">Back to CleanBase</Link></p>
            </article>
        </main>
    </div>
);

export const TermsPage: React.FC = () => (
    <Shell title="Terms of Service">
        <p>These terms govern your use of CleanBase, a management platform for cleaning companies (bookings, clients, staff, invoicing and reports). By creating an account or using CleanBase you agree to them.</p>
        <h2>1. Accounts and approval</h2>
        <p>New company accounts are reviewed by the CleanBase team before they open. We may approve, refuse or suspend an account, for example when the details given are false or the service is misused. You are responsible for the accuracy of the details you give and for keeping your password secret.</p>
        <h2>2. Plans and payment</h2>
        <p>The plan, price and license period are agreed with the CleanBase team and recorded for your company. Access may be paused when a license ends or a payment agreed with us is not received.</p>
        <h2>3. Your data</h2>
        <p>The information you enter (clients, bookings, staff, invoices and so on) belongs to your company. You are responsible for having the right to store it and for the people you give access to. We process it only to provide the service, as described in the <Link to="/privacy">Privacy Policy</Link>.</p>
        <h2>4. Acceptable use</h2>
        <p>Do not use CleanBase to break the law, to attack or overload the service, to access another company&apos;s data, or to send unwanted messages.</p>
        <h2>5. Availability</h2>
        <p>We work to keep CleanBase available and to back up data, but we cannot promise it will never be interrupted. We may update or maintain the service, and will try to tell you about planned work that affects you.</p>
        <h2>6. Liability</h2>
        <p>To the extent the law allows, CleanBase is provided &quot;as is&quot;, and we are not liable for indirect losses such as lost profit. Nothing here limits liability that cannot be limited by law.</p>
        <h2>7. Ending the agreement</h2>
        <p>You may stop using CleanBase at any time and ask for your company&apos;s data to be exported or deleted. We may end access for serious or repeated breaches of these terms.</p>
        <h2>8. Changes and contact</h2>
        <p>We may update these terms and will show the date above. Questions: call or WhatsApp {CONTACT}.</p>
    </Shell>
);

export const PrivacyPage: React.FC = () => (
    <Shell title="Privacy Policy">
        <p>This policy explains what CleanBase collects and how it is used.</p>
        <h2>What we collect</h2>
        <ul>
            <li><b>Account details:</b> your name, email address, company name and contact number.</li>
            <li><b>Business data you enter:</b> clients and their addresses, bookings, staff and drivers, invoices, expenses, documents and photos.</li>
            <li><b>Booking page visits:</b> anonymous counts of visits and bookings, with no personal details.</li>
            <li><b>Technical data:</b> what is needed to keep you signed in and to keep the service secure.</li>
        </ul>
        <h2>How it is used</h2>
        <p>To run your workspace, to review new accounts, to contact you about your account, and to keep the service safe. We do not sell personal data and we do not use it for advertising.</p>
        <h2>Who can see it</h2>
        <p>Each company can see only its own data. People in your company see what their role allows. The CleanBase team can access company data to give support and to review accounts. Data is stored with our hosting and database provider, which processes it for us.</p>
        <h2>Your clients&apos; data</h2>
        <p>For the clients and staff you add, your company decides why and how their data is used, and CleanBase processes it on your behalf. Make sure you may share it and that your own clients are informed.</p>
        <h2>Your rights</h2>
        <p>You can ask us to correct, export or delete your data. To do so, or for any privacy question, call or WhatsApp {CONTACT}.</p>
        <h2>Security and retention</h2>
        <p>Access is protected by sign-in and by rules that keep each company&apos;s data separate. We keep data while your account is active and for as long as the law requires afterwards, then delete it.</p>
        <h2>Changes</h2>
        <p>We may update this policy and will show the date above.</p>
    </Shell>
);
