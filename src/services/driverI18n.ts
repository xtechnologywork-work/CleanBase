/* -------------------------------------------------------------------------- */
/*  Driver app languages: English and Arabic (right to left).                 */
/*  Names of people, clients and places are shown exactly as they were typed. */
/* -------------------------------------------------------------------------- */
import type { TripStage } from './trips';

export type DriverLang = 'en' | 'ar';
export const DRIVER_LANG_KEY = 'cb_driver_lang';

/** The saved choice, then the phone's language. */
export function initialDriverLang(): DriverLang {
    try { const s = localStorage.getItem(DRIVER_LANG_KEY); if (s === 'ar' || s === 'en') return s; } catch { /* storage blocked */ }
    return typeof navigator !== 'undefined' && /^ar/i.test(navigator.language || '') ? 'ar' : 'en';
}
export function saveDriverLang(l: DriverLang) { try { localStorage.setItem(DRIVER_LANG_KEY, l); } catch { /* storage blocked */ } }

/** Keeps a name or number from scrambling the order of the Arabic sentence around it. */
export const isolate = (s: string, lang: DriverLang) => (lang === 'ar' && s ? `⁨${s}⁩` : s);

/** "Maria", "Maria and Joy", "Maria, Joy and Sara". */
export function listNames(names: string[], lang: DriverLang): string {
    const n = names.map(x => isolate(x, lang));
    if (n.length <= 1) return n[0] || '';
    const and = lang === 'ar' ? ' و' : ' and ';
    return lang === 'ar' ? `${n.slice(0, -1).join('، ')}${and}${n[n.length - 1]}` : `${n.slice(0, -1).join(', ')}${and}${n[n.length - 1]}`;
}

/** Arabic count word: 1 عاملة, 2 عاملتين, 3 to 10 عاملات, 11 and more عاملة. */
const arCleaners = (n: number) => (n === 1 ? 'عاملة' : n === 2 ? 'عاملتين' : n >= 3 && n <= 10 ? `${n} عاملات` : `${n} عاملة`);
const arMinutes = (n: number) => (n === 1 ? 'دقيقة' : n === 2 ? 'دقيقتان' : n >= 3 && n <= 10 ? `${n} دقائق` : `${n} دقيقة`);
const arHours = (n: number) => (n === 1 ? 'ساعة' : n === 2 ? 'ساعتان' : n >= 3 && n <= 10 ? `${n} ساعات` : `${n} ساعة`);

/** How late: "12 min", "1h 05m", "a day"  /  "12 دقيقة", "ساعة و5 دقائق", "يوم". */
export function lateLabel(minutes: number, lang: DriverLang): string {
    const m = Math.max(0, Math.round(minutes));
    if (lang === 'en') return m >= 1440 ? 'a day' : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
    if (m >= 1440) return 'يوم';
    if (m < 60) return arMinutes(m);
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${arHours(h)} و${arMinutes(r)}` : arHours(h);
}

export interface StageText { label: string; action: string; short: string }

export interface DriverStrings {
    langButton: string; langAria: string;
    hello: string; driverView: string; today: string; tomorrow: string; rides: string; done: string; late: string; yourDay: string; tomorrowHeading: string;
    timeNow: string; signOut: string; backToBoard: string; seeDayOf: string; dayGroup: string;
    notLinkedTitle: string; notLinkedText: string; noDriversTitle: string; noDriversText: string;
    noRidesTitle: (tomorrow: boolean) => string; noRidesText: string; allDoneTitle: string; allDoneText: string;
    undoStep: (label: string) => string; stepUndone: string;
    chipDone: string; chipLate: string; chipCleaning: string; chipPlanned: string;
    kickerFirst: string; kickerCleaning: string; kickerNow: string; kickerLate: (m: string) => string;
    pickUp: (names: string) => string; take: (cleaner: string, client: string) => string; collect: (cleaner: string, client: string) => string; bringHome: (names: string) => string;
    noAccommodation: string; noAddress: string; dueBy: (label: string, time: string) => string; stepAria: (n: number) => string;
    personLine: (client: string, from: string, to: string) => string; call: (name: string) => string; noHomeFor: (names: string) => string;
    tomorrowNote: string; navigate: string; callClient: string; onTheWay: string; arrived: string;
    everyoneInCar: string; goingToPickUpMany: (n: number) => string;
    noCleaner: string; client: string;
    outTitle: (cleaner: string, client: string) => string; backTitle: (cleaner: string) => string; fromPlace: (place: string) => string;
    stages: Record<TripStage, StageText>;
    // sign in page
    loginTitle: string; loginTagline: string; loginLead: string; phoneLabel: string; phoneHint: string; passwordLabel: string; showPassword: string;
    signIn: string; signingIn: string; wrongLogin: string; badPhone: string; notDriver: string; wrongCompany: string; inactive: string;
    needLink: string; badLink: string; loading: string; forgot: string;
}

const EN: DriverStrings = {
    langButton: 'العربية', langAria: 'Switch to Arabic',
    hello: 'Hello', driverView: 'Driver view', today: 'Today', tomorrow: 'Tomorrow', rides: 'Rides', done: 'Done', late: 'Late', yourDay: 'Your day', tomorrowHeading: 'Tomorrow',
    timeNow: 'Time now', signOut: 'Sign out', backToBoard: 'Back to the driver board', seeDayOf: 'See the day of', dayGroup: 'Day',
    notLinkedTitle: 'Your account is not linked yet', notLinkedText: 'Ask the office to add you as a driver in the team.',
    noDriversTitle: 'No drivers yet', noDriversText: 'Add your drivers in Settings, Drivers.',
    noRidesTitle: tomorrow => `No rides ${tomorrow ? 'tomorrow' : 'today'}`, noRidesText: 'When the office gives you a ride it shows up here by itself.',
    allDoneTitle: 'All rides done', allDoneText: 'Great work. Everyone is home.',
    undoStep: label => `Undo "${label}"`, stepUndone: 'Step undone',
    chipDone: 'Done', chipLate: 'Late', chipCleaning: 'Cleaning', chipPlanned: 'Planned',
    kickerFirst: 'First ride', kickerCleaning: 'Cleaning now', kickerNow: 'Now', kickerLate: m => `Late by ${m}`,
    pickUp: names => `Pick up ${names}`, take: (c, cl) => `Take ${c} to ${cl}`, collect: (c, cl) => `Collect ${c} from ${cl}`, bringHome: names => `Bring ${names} home`,
    noAccommodation: 'Accommodation not set', noAddress: 'No address saved', dueBy: (label, time) => `${label} by ${time}`, stepAria: n => `Step ${n} of 6`,
    personLine: (client, from, to) => `${client} · ${from} to ${to}`, call: name => `Call ${name}`,
    noHomeFor: names => `No accommodation saved for ${names}. Ask the office where to go.`,
    tomorrowNote: "Tomorrow's plan. The buttons appear on the day.", navigate: 'Navigate', callClient: 'Call client', onTheWay: 'On the way', arrived: 'Arrived',
    everyoneInCar: 'Everyone is in the car', goingToPickUpMany: n => `I'm going to pick up ${n}`,
    noCleaner: 'No cleaner assigned', client: 'Client',
    outTitle: (c, cl) => `${c} to ${cl}`, backTitle: c => `${c} home`, fromPlace: place => `From ${place}`,
    loginTitle: 'Driver sign in', loginTagline: 'Driver app', loginLead: 'Sign in with your phone number and your password.',
    phoneLabel: 'Phone number', phoneHint: 'The number your company saved for you. A number from another country: start with + and the country code.',
    passwordLabel: 'Password', showPassword: 'Show password', signIn: 'Sign in', signingIn: 'Signing in...',
    wrongLogin: 'Wrong phone number or password.', badPhone: 'Enter your phone number.',
    notDriver: 'This page is for drivers only. Ask your company to create a driver account for you.',
    wrongCompany: 'This account belongs to another company. Use the link your company gave you.',
    inactive: "Your company's account is not active. Contact the office.",
    needLink: 'Open the sign in link your company gave you.', badLink: 'This link is not valid, or the company is not active.',
    loading: 'Loading...', forgot: 'Forgot your password? Ask your company to set a new one for you.',
    stages: {
        scheduled: { label: 'Scheduled', action: '', short: 'Planned' },
        to_pickup: { label: 'Going to pick up', action: "I'm going to pick up", short: 'Going' },
        onboard: { label: 'Cleaner in the car', action: 'Cleaner is in the car', short: 'In car' },
        dropped: { label: 'Dropped at client', action: 'Dropped at the client', short: 'At client' },
        to_return: { label: 'Going back to collect', action: "I'm going to collect", short: 'Collecting' },
        return_onboard: { label: 'Cleaner back in the car', action: 'Cleaner is in the car', short: 'In car' },
        returned: { label: 'Back home', action: 'Back at the accommodation', short: 'Done' },
    },
};

const AR: DriverStrings = {
    langButton: 'English', langAria: 'التبديل إلى الإنجليزية',
    hello: 'مرحباً', driverView: 'عرض السائق', today: 'اليوم', tomorrow: 'غداً', rides: 'الرحلات', done: 'المنجزة', late: 'المتأخرة', yourDay: 'يومك', tomorrowHeading: 'غداً',
    timeNow: 'الوقت الآن', signOut: 'تسجيل الخروج', backToBoard: 'العودة إلى لوحة السائقين', seeDayOf: 'عرض يوم', dayGroup: 'اليوم',
    notLinkedTitle: 'حسابك غير مرتبط بعد', notLinkedText: 'اطلب من المكتب إضافتك كسائق ضمن الفريق.',
    noDriversTitle: 'لا يوجد سائقون بعد', noDriversText: 'أضف السائقين من الإعدادات ثم السائقون.',
    noRidesTitle: tomorrow => (tomorrow ? 'لا توجد رحلات غداً' : 'لا توجد رحلات اليوم'), noRidesText: 'عندما يسند لك المكتب رحلة ستظهر هنا تلقائياً.',
    allDoneTitle: 'اكتملت جميع الرحلات', allDoneText: 'عمل رائع. الجميع في السكن.',
    undoStep: label => `التراجع عن «${label}»`, stepUndone: 'تم التراجع عن الخطوة',
    chipDone: 'تمت', chipLate: 'متأخر', chipCleaning: 'جارٍ التنظيف', chipPlanned: 'مجدولة',
    kickerFirst: 'أول رحلة', kickerCleaning: 'التنظيف جارٍ الآن', kickerNow: 'الآن', kickerLate: m => `متأخر بمقدار ${m}`,
    pickUp: names => `استلام ${names}`, take: (c, cl) => `أوصل ${c} إلى ${cl}`, collect: (c, cl) => `استلم ${c} من ${cl}`, bringHome: names => `أعد ${names} إلى السكن`,
    noAccommodation: 'السكن غير محدد', noAddress: 'لا يوجد عنوان محفوظ', dueBy: (label, time) => `${label} قبل ${time}`, stepAria: n => `الخطوة ${n} من 6`,
    personLine: (client, from, to) => `${client} · من ${from} إلى ${to}`, call: name => `اتصل بـ ${name}`,
    noHomeFor: names => `لا يوجد سكن محفوظ لـ ${names}. اسأل المكتب إلى أين تذهب.`,
    tomorrowNote: 'هذه خطة الغد. تظهر الأزرار في اليوم نفسه.', navigate: 'افتح الخريطة', callClient: 'اتصل بالعميل', onTheWay: 'في الطريق', arrived: 'وصلنا',
    everyoneInCar: 'الجميع في السيارة', goingToPickUpMany: n => `أنا في الطريق لاستلام ${arCleaners(n)}`,
    noCleaner: 'لم تُحدَّد عاملة', client: 'العميل',
    outTitle: (c, cl) => `${c} إلى ${cl}`, backTitle: c => `${c} إلى السكن`, fromPlace: place => `من ${place}`,
    loginTitle: 'تسجيل دخول السائق', loginTagline: 'تطبيق السائق', loginLead: 'سجّل الدخول برقم هاتفك وكلمة المرور.',
    phoneLabel: 'رقم الهاتف', phoneHint: 'الرقم الذي سجّلته الشركة لك. إن كان الرقم من دولة أخرى فابدأ بـ + ثم رمز الدولة.',
    passwordLabel: 'كلمة المرور', showPassword: 'إظهار كلمة المرور', signIn: 'تسجيل الدخول', signingIn: 'جارٍ تسجيل الدخول...',
    wrongLogin: 'رقم الهاتف أو كلمة المرور غير صحيحة.', badPhone: 'أدخل رقم هاتفك.',
    notDriver: 'هذه الصفحة للسائقين فقط. اطلب من شركتك إنشاء حساب سائق لك.',
    wrongCompany: 'هذا الحساب يتبع شركة أخرى. استخدم الرابط الذي أعطتك إياه شركتك.',
    inactive: 'حساب شركتك غير مفعّل. تواصل مع المكتب.',
    needLink: 'افتح رابط تسجيل الدخول الذي أعطتك إياه شركتك.', badLink: 'هذا الرابط غير صالح، أو أن الشركة غير مفعّلة.',
    loading: 'جارٍ التحميل...', forgot: 'نسيت كلمة المرور؟ اطلب من شركتك تعيين كلمة مرور جديدة لك.',
    stages: {
        scheduled: { label: 'مجدولة', action: '', short: 'مجدولة' },
        to_pickup: { label: 'في الطريق للاستلام', action: 'أنا في الطريق للاستلام', short: 'في الطريق' },
        onboard: { label: 'العاملة في السيارة', action: 'العاملة في السيارة', short: 'في السيارة' },
        dropped: { label: 'تم التوصيل إلى العميل', action: 'تم التوصيل إلى العميل', short: 'عند العميل' },
        to_return: { label: 'في الطريق لاستلام العاملة', action: 'أنا في الطريق لاستلام العاملة', short: 'استلام' },
        return_onboard: { label: 'العاملة عادت إلى السيارة', action: 'العاملة في السيارة', short: 'في السيارة' },
        returned: { label: 'عادت إلى السكن', action: 'وصلنا إلى السكن', short: 'تمت' },
    },
};

export const DRIVER_STRINGS: Record<DriverLang, DriverStrings> = { en: EN, ar: AR };
