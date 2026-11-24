import type { BookingStatus } from '../types';

/* -------------------------------------------------------------------------- */
/*  WhatsApp messages sent to clients, in English and Arabic.                  */
/*  A template is plain text with {placeholders}. Lines written in Arabic get  */
/*  Arabic dates, times and currency, and are kept in right-to-left order      */
/*  even when a name or number in Latin letters sits inside them.              */
/* -------------------------------------------------------------------------- */

export interface MessageVars {
    name: string; service: string;
    /** yyyy-MM-dd */ date: string;
    /** HH:mm */ time: string;
    cleaner: string; company: string; address: string;
    number?: string; amount?: number; currency?: string; /** yyyy-MM-dd */ due?: string;
    link?: string; reason?: string; reasonAr?: string;
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export function formatDate(d: string | undefined, ar: boolean): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
    if (!m) return d || '';
    const month = Number(m[2]) - 1;
    if (month < 0 || month > 11) return d || '';
    return `${Number(m[3])} ${(ar ? MONTHS_AR : MONTHS_EN)[month]} ${m[1]}`;
}

/** "09:30" to "9:30 AM" or "9:30 ص". */
export function formatTime(t: string | undefined, ar: boolean): string {
    const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
    if (!m) return t || '';
    const h = Number(m[1]);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const suffix = h < 12 ? (ar ? 'ص' : 'AM') : (ar ? 'م' : 'PM');
    return `${h12}:${m[2]} ${suffix}`;
}

const money = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const currencyWord = (c: string | undefined, ar: boolean) => { const cur = (c || 'QAR').trim(); return ar && /^qar$/i.test(cur) ? 'ر.ق' : cur; };

const ARABIC = /[؀-ۿ]/;
const FSI = '⁨', PDI = '⁩', RLM = '‏';

function valuesFor(v: MessageVars, ar: boolean): Record<string, string> {
    return {
        name: v.name, service: v.service || (ar ? 'التنظيف' : 'cleaning'), date: formatDate(v.date, ar), time: formatTime(v.time, ar),
        cleaner: v.cleaner, company: v.company, address: v.address,
        number: v.number ?? '', amount: v.amount === undefined ? '' : `${money(v.amount)} ${currencyWord(v.currency, ar)}`,
        due: formatDate(v.due, ar), link: v.link ?? '', reason: ar && v.reasonAr ? v.reasonAr : (v.reason ?? ''),
    };
}

/**
 * Fill a template line by line. A line written in Arabic gets Arabic formats and is kept right-to-left.
 * A line whose placeholders are all empty (no address, no cleaner...) is left out. Unknown {words} stay as they are.
 */
export function renderMessage(tpl: string, v: MessageVars): string {
    const en = valuesFor(v, false), ar = valuesFor(v, true);
    const out: string[] = [];
    for (const line of (tpl || '').replace(/\r\n?/g, '\n').split('\n')) {
        const isAr = ARABIC.test(line);
        const vals = isAr ? ar : en;
        let known = false, anyValue = false;
        const filled = line.replace(/\{(\w+)\}/g, (m, k: string) => {
            if (!(k in vals)) return m;
            known = true;
            const val = vals[k];
            if (val) anyValue = true;
            return val ? (isAr ? `${FSI}${val}${PDI}` : val) : '';
        });
        if (known && !anyValue) continue;
        const text = filled.replace(/ {2,}/g, ' ').trim();
        out.push(isAr && text ? `${RLM}${text}` : text);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ------------------------------ default messages ------------------------------ */

const LINE = '──────────';
const both = (en: string[], ar: string[]) => `${en.join('\n')}\n\n${LINE}\n\n${ar.join('\n')}`;

export const DEFAULT_TEMPLATES = {
    tplConfirmation: both(
        ['Hello {name} 👋', '✅ Your booking is confirmed!', '🧹 Service: {service}', '📅 Date: {date}', '⏰ Time: {time}', '📍 Address: {address}', 'See you then! ✨ {company}'],
        ['مرحباً {name} 👋', '✅ تم تأكيد حجزك!', '🧹 الخدمة: {service}', '📅 التاريخ: {date}', '⏰ الوقت: {time}', '📍 العنوان: {address}', 'نراك قريباً! ✨ {company}']),
    tplReminder: both(
        ['Hello {name} 👋', '⏰ Friendly reminder: your {service} is on {date} at {time}.', '📍 {address}', 'Need to reschedule? Just reply to this message. 💬'],
        ['مرحباً {name} 👋', '⏰ تذكير ودّي: موعد {service} يوم {date} الساعة {time}.', '📍 {address}', 'لتغيير الموعد، يكفي الرد على هذه الرسالة. 💬']),
    tplInvoice: both(
        ['Hello {name} 👋', '🧾 Invoice {number} for {amount} is ready.', '📅 Due: {due}', 'Thank you for choosing {company}! 🙏'],
        ['مرحباً {name} 👋', '🧾 فاتورتك رقم {number} بمبلغ {amount} جاهزة.', '📅 تاريخ الاستحقاق: {due}', 'شكراً لاختيارك {company}! 🙏']),
    tplReview: both(
        ['Hello {name} 👋', '⭐ Thank you for choosing {company}! How was your {service} on {date}?', 'Rate it in one minute: {link}'],
        ['مرحباً {name} 👋', '⭐ شكراً لاختيارك {company}! كيف كانت خدمة {service} بتاريخ {date}؟', 'قيّم الخدمة في دقيقة واحدة: {link}']),
    tplReviewGoogle: `${both(
        ['Hello {name} 👋', '⭐ Thank you for choosing {company}! How was your {service} on {date}?', '🙏 Your honest review on Google helps us a lot, and it takes one minute:'],
        ['مرحباً {name} 👋', '⭐ شكراً لاختيارك {company}! كيف كانت خدمة {service} بتاريخ {date}؟', '🙏 رأيك الصادق على Google يساعدنا كثيراً، ويستغرق دقيقة واحدة:'])}\n\n⭐ {link}`,
    tplPending: both(
        ['Hello {name} 👋', '📝 We received your booking request.', '🧹 Service: {service}', '📅 {date} at {time}', '{company} will confirm it shortly. ⏳'],
        ['مرحباً {name} 👋', '📝 استلمنا طلب الحجز الخاص بك.', '🧹 الخدمة: {service}', '📅 {date} الساعة {time}', 'سيقوم {company} بتأكيده قريباً. ⏳']),
    tplInProgress: both(
        ['Hello {name} 👋', '🧹 Our team has started your {service} today.', '👤 Your cleaner: {cleaner}', 'We will let you know as soon as it is done. ✨'],
        ['مرحباً {name} 👋', '🧹 بدأ فريقنا اليوم تنفيذ خدمة {service}.', '👤 عامل النظافة: {cleaner}', 'سنخبرك فور الانتهاء. ✨']),
    tplCompleted: both(
        ['Hello {name} 👋', '🎉 Your {service} on {date} is complete!', 'Thank you for choosing {company}. We hope you love the result. 💙'],
        ['مرحباً {name} 👋', '🎉 تم الانتهاء من خدمة {service} بتاريخ {date}!', 'شكراً لاختيارك {company}، نتمنى أن ينال العمل رضاك. 💙']),
    tplCancelled: both(
        ['Hello {name} 👋', '❌ Your {service} booking on {date} at {time} has been cancelled.', 'Would you like another time? Just reply to this message. 💬'],
        ['مرحباً {name} 👋', '❌ تم إلغاء حجز {service} بتاريخ {date} الساعة {time}.', 'هل ترغب بموعد آخر؟ يكفي الرد على هذه الرسالة. 💬']),
    tplDeclined: both(
        ['Hello {name} 👋', '😔 Sorry, we cannot take your {service} on {date} at {time}.', 'Reason: {reason}', '🔗 Choose another time: {link}'],
        ['مرحباً {name} 👋', '😔 نعتذر، لا يمكننا تنفيذ خدمة {service} بتاريخ {date} الساعة {time}.', 'السبب: {reason}', '🔗 اختر وقتاً آخر: {link}']),
} as const;
export type TemplateKey = keyof typeof DEFAULT_TEMPLATES;
export const TEMPLATE_KEYS = Object.keys(DEFAULT_TEMPLATES) as TemplateKey[];

/** The English-only defaults of the first version. A company still on one of these is moved to the new default. */
const OLD_DEFAULTS: Partial<Record<TemplateKey, string>> = {
    tplConfirmation: 'Hello {name}, your {service} is booked for {date} at {time}. See you then!',
    tplReminder: 'Reminder: your cleaning is tomorrow at {time}. Reply to reschedule.',
    tplInvoice: 'Hello {name}, invoice {number} for {amount} is ready. Due {due}. Thank you!',
    tplReview: 'Hello {name}, thank you for choosing {company}. How was your {service} on {date}? Rate it in one minute here: {link}',
};

type TemplateFields = { [K in TemplateKey]?: string };

/** Settings with every template filled in: missing ones get the default, untouched old English ones get the new default. */
export function withTemplates<T extends TemplateFields>(s: T): T & Record<TemplateKey, string> {
    const out: Record<string, string | undefined> = { ...s };
    for (const k of TEMPLATE_KEYS) {
        const cur = out[k];
        if (!cur || !cur.trim() || cur === OLD_DEFAULTS[k]) out[k] = DEFAULT_TEMPLATES[k];
    }
    return out as T & Record<TemplateKey, string>;
}

/** Short driver updates for the client: the cleaner is on the way, or has arrived. */
export const driverUpdateMessage = (kind: 'on_the_way' | 'arrived', v: Pick<MessageVars, 'name' | 'cleaner' | 'company' | 'time'>) => renderMessage(
    kind === 'on_the_way'
        ? both(['Hello {name} 👋', '🚗 {cleaner} is on the way to you now.', '⏰ Expected around {time}.', '{company}'],
            ['مرحباً {name} 👋', '🚗 {cleaner} في الطريق إليك الآن.', '⏰ الوصول المتوقع حوالي {time}.', '{company}'])
        : both(['Hello {name} 👋', '✅ {cleaner} has arrived and is starting now.', 'Thank you for choosing {company}! ✨'],
            ['مرحباً {name} 👋', '✅ وصلت {cleaner} وستبدأ الآن.', 'شكراً لاختيارك {company}! ✨']),
    { service: '', date: '', address: '', ...v });

/** Marketing line to share the booking link. */
export const bookingLinkMessage = (company: string, link: string) => renderMessage(both(
    ['Hello 👋', '🧹 Book your cleaning with {company} online, in a minute:', '🔗 {link}'],
    ['مرحباً 👋', '🧹 احجز خدمة التنظيف مع {company} عبر الإنترنت في دقيقة:', '🔗 {link}']),
{ name: '', service: '', date: '', time: '', cleaner: '', company, address: '', link });

/* ------------------------------ by booking status ------------------------------ */

/** What the main button says for each status. */
export const STATUS_BUTTON: Record<BookingStatus, string> = {
    pending: 'Send request received',
    confirmed: 'Send confirmation',
    in_progress: 'Send "in progress" update',
    completed: 'Send completion message',
    cancelled: 'Send cancellation notice',
};

export const STATUS_KEY: Record<BookingStatus, TemplateKey> = {
    pending: 'tplPending', confirmed: 'tplConfirmation', in_progress: 'tplInProgress', completed: 'tplCompleted', cancelled: 'tplCancelled',
};

export const statusMessage = (status: BookingStatus, templates: Record<TemplateKey, string>, v: MessageVars) => renderMessage(templates[STATUS_KEY[status]], v);

/** The decline reasons in Arabic, for the Arabic half of the message. Anything else the owner wrote stays as written. */
const REASONS_AR: [string, string][] = [
    ['Fully booked at that time', 'الجدول ممتلئ في ذلك الوقت'],
    ['Cleaner not available', 'عامل النظافة غير متاح'],
    ['Outside our service area', 'العنوان خارج منطقة خدمتنا'],
    ['Service not available', 'الخدمة غير متاحة'],
];
export function reasonArabic(reason: string): string {
    const hit = REASONS_AR.find(([en]) => reason.startsWith(en));
    if (!hit) return reason;
    const note = reason.slice(hit[0].length).replace(/^[.\s]+/, '');
    return note ? `${hit[1]}. ${note}` : hit[1];
}

/** Phone number to the digits wa.me needs. A local 8 digit Qatar number gets 974. Returns '' when it is not a usable number. */
export function whatsappDigits(phone: string): string {
    const d = (phone || '').replace(/\D/g, '');
    const full = d.length === 8 ? `974${d}` : d;
    return full.length >= 9 && full.length <= 15 ? full : '';
}

/** A phone or tablet opens the WhatsApp app through wa.me. A computer goes straight to the WhatsApp Web chat, skipping the wa.me page that squashes the message into one block. */
export const isMobileDevice = () => typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');

export function whatsappUrl(digits: string, text: string, mobile = isMobileDevice()): string {
    const t = encodeURIComponent(text);
    return mobile ? `https://wa.me/${digits}?text=${t}` : `https://web.whatsapp.com/send?phone=${digits}&text=${t}`;
}
/** Same, when the person picks the chat themselves (sharing a link). */
export function whatsappShareUrl(text: string, mobile = isMobileDevice()): string {
    const t = encodeURIComponent(text);
    return mobile ? `https://wa.me/?text=${t}` : `https://web.whatsapp.com/send?text=${t}`;
}
