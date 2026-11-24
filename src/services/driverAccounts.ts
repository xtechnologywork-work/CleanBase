/* -------------------------------------------------------------------------- */
/*  Driver accounts.                                                          */
/*  A driver signs in with a phone number and a password, on a page that     */
/*  belongs to ONE company. Behind the scenes the account is a normal login   */
/*  whose email is made from the phone number and the company id:             */
/*      97455123456@c-1794572420522.driver.cleanbase.app                      */
/*  The email is never shown and never receives mail. Because the company id  */
/*  is part of it, the same phone number can be a driver in two companies.    */
/*  The Edge Function supabase/functions/driver-admin builds the same email.  */
/* -------------------------------------------------------------------------- */
import { renderMessage } from './bookingMessages';

export const DRIVER_EMAIL_DOMAIN = 'driver.cleanbase.app';
export const DRIVER_PASSWORD_MIN = 8;
/** Which company's driver page this browser used last, so a signed-out driver comes back to the right page. */
export const DRIVER_COMPANY_KEY = 'cb_driver_company';

/** Phone number to digits with the country code. A local 8 digit Qatar number gets 974; "00" and "+" are dropped. '' when unusable. */
export function driverDigits(phone: string): string {
    let d = (phone || '').replace(/\D/g, '').replace(/^00/, '');
    if (d.length === 8) d = `974${d}`;
    return d.length >= 9 && d.length <= 15 ? d : '';
}

/** The hidden login email of a driver. '' when the phone number is not usable. */
export function driverEmail(companyId: string, phone: string): string {
    const digits = driverDigits(phone);
    const slug = (companyId || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
    return digits && slug ? `${digits}@${slug}.${DRIVER_EMAIL_DOMAIN}` : '';
}
export const isDriverEmail = (email: string) => (email || '').toLowerCase().endsWith(`.${DRIVER_EMAIL_DOMAIN}`);

/** The page a company gives to its drivers. */
export const driverLoginUrl = (companyId: string, origin = typeof window !== 'undefined' ? window.location.origin : '') =>
    `${origin}/driver/login?c=${encodeURIComponent(companyId)}`;

/** "+974 5512 3456" for display. */
export function prettyPhone(digits: string): string {
    const d = (digits || '').replace(/\D/g, '');
    if (d.startsWith('974') && d.length === 11) return `+974 ${d.slice(3, 7)} ${d.slice(7)}`;
    return d ? `+${d}` : '';
}

/** The message the owner sends to a new driver: the page, the phone number and the password. English and Arabic. */
export function driverWelcomeMessage(p: { name: string; company: string; link: string; phone: string; password: string }): string {
    const both = (en: string[], ar: string[]) => `${en.join('\n')}\n\n──────────\n\n${ar.join('\n')}`;
    // number = the phone number, reason = the password (the only free text fields of the message engine)
    return renderMessage(both(
        ['Hello {name} 👋', '🚗 Your driver account at {company} is ready.', '🔗 Open this link and sign in:', '{link}', '📱 Phone: {number}', '🔑 Password: {reason}'],
        ['مرحباً {name} 👋', '🚗 حسابك كسائق لدى {company} جاهز.', '🔗 افتح هذا الرابط وسجّل الدخول:', '{link}', '📱 رقم الهاتف: {number}', '🔑 كلمة المرور: {reason}']),
    { name: p.name, service: '', date: '', time: '', cleaner: '', company: p.company, address: '', link: p.link, number: p.phone, reason: p.password });
}
