/* -------------------------------------------------------------------------- */
/*  Booking page languages: English and Arabic (right to left).               */
/*  Company-written text (name, tagline, services, descriptions) is shown     */
/*  exactly as the company wrote it.                                          */
/* -------------------------------------------------------------------------- */

export type Lang = 'en' | 'ar';
export const LANG_KEY = 'cb_store_lang';

/** The saved choice, then ?lang=, then the visitor's browser language. */
export function initialLang(search = ''): Lang {
    const q = new URLSearchParams(search).get('lang');
    if (q === 'ar' || q === 'en') return q;
    try { const s = localStorage.getItem(LANG_KEY); if (s === 'ar' || s === 'en') return s; } catch { /* storage blocked */ }
    return typeof navigator !== 'undefined' && /^ar/i.test(navigator.language || '') ? 'ar' : 'en';
}
export function saveLang(l: Lang) { try { localStorage.setItem(LANG_KEY, l); } catch { /* storage blocked */ } }

/** Keeps a name or number from scrambling the order of the Arabic sentence around it. */
const iso = (s: string) => `⁨${s}⁩`;

/** Arabic count words: 1 ساعة, 2 ساعتان, 3 to 10 ساعات, 11 and more ساعة. */
function arUnit(n: number, one: string, two: string, few: string, many: string) {
    if (n === 1) return one;
    if (n === 2) return two;
    return n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${many}`;
}

export interface Strings {
    bookingFallback: string; tagline: string; pageTitle: (name: string) => string; langButton: string;
    loading: string; inactiveTitle: string; inactiveText: string; footer: string; stepsLabel: string;
    steps: { service: string; cleaner: string; time: string; details: string };
    currency: string;
    // service
    chooseService: string; perVisit: string; noServices: string; select: string;
    // cleaner
    chooseCleaner: string; cleanerLead: (service: string, duration: string) => string; anyCleaner: string;
    firstFree: (day: string) => string; fullyBooked: string; nextFree: (day: string) => string; notAvailable: string;
    // time
    pickTime: string; timeLead: (service: string, who: string) => string; anyoneWho: string;
    prevMonth: string; nextMonth: string; dayNotAvailable: string;
    noTimes: string; nothingFree: string; legend: string; tipPast: string; tipTaken: string;
    /** calendar of a cleaner who is not available: the booked days (red) and the first free day (green) */
    dayBooked: string; dayFirstFree: string;
    // details
    yourDetails: string; detailsLead: string; summaryService: string; summaryWhen: string; summaryCleaner: string; summaryPrice: string;
    assignedByCompany: string; fullName: string; phone: string; address: string; addressHint: string; notes: string; notesHint: string;
    changeTime: string; send: string; sending: string; nothingToPay: string;
    /** the booking so far, beside the steps */
    yourBooking: string; notChosen: string; openToday: (from: string, to: string) => string; closedToday: string;
    /** the back button of each step, and what it goes back to */
    back: string; backTo: (step: string) => string;
    // done
    sent: string; thanks: (name: string, company: string) => string; bookAnother: string;
    // formatting
    duration: (minutes: number) => string; weekdays: string[]; dateLocale: string;
    error: (message: string) => string;
}

const EN: Strings = {
    bookingFallback: 'Booking', tagline: 'Book a cleaning online', pageTitle: n => `${n} | Book online`, langButton: 'العربية',
    loading: 'Loading...', inactiveTitle: 'This booking link is not active', inactiveText: 'Please check the link, or ask the company for their booking link.',
    footer: 'Bookings by CleanBase', stepsLabel: 'Steps',
    steps: { service: 'Service', cleaner: 'Cleaner', time: 'Date and time', details: 'Your details' },
    currency: 'QAR',
    chooseService: 'Choose a service', perVisit: 'Prices are per visit.', noServices: 'No services are open for online booking right now.', select: 'Select',
    chooseCleaner: 'Choose your cleaner', cleanerLead: (s, d) => `${s}, ${d}. Pick someone you know, or let us choose.`, anyCleaner: 'Any available cleaner',
    firstFree: d => `First free day: ${d}`, fullyBooked: 'Fully booked for now', nextFree: d => `Next free: ${d}`, notAvailable: 'Not available',
    pickTime: 'Pick a date and time', timeLead: (s, w) => `${s} with ${w}. Greyed-out times are not available.`, anyoneWho: 'any available cleaner',
    prevMonth: 'Previous month', nextMonth: 'Next month', dayNotAvailable: ', not available',
    noTimes: 'No times on this day. Choose another day.', nothingFree: 'Nothing is free on this day. Choose another day.',
    legend: 'Greyed times are booked or no longer available.', tipPast: 'This time has passed or is too soon', tipTaken: 'Already booked',
    dayBooked: 'Booked', dayFirstFree: 'First available day',
    yourDetails: 'Your details', detailsLead: 'So the company can confirm and find your home.', summaryService: 'Service', summaryWhen: 'When', summaryCleaner: 'Cleaner', summaryPrice: 'Price',
    assignedByCompany: 'Assigned by the company', fullName: 'Full name', phone: 'Phone (WhatsApp)', address: 'Address', addressHint: 'Area, building, apartment',
    notes: 'Notes (optional)', notesHint: 'Gate code, pets, what to focus on',
    back: 'Back', backTo: step => `Back to: ${step}`,
    changeTime: 'Change time', send: 'Send booking request', sending: 'Sending...', nothingToPay: 'Nothing to pay now. The company confirms your booking first.',
    yourBooking: 'Your booking', notChosen: 'Not chosen yet', openToday: (a, b) => `Open today ${a} to ${b}`, closedToday: 'Closed today, you can still book another day',
    sent: 'Request sent', thanks: (n, c) => `Thank you${n ? `, ${n}` : ''}. ${c} will confirm your booking soon. This time is kept for you while they review it.`, bookAnother: 'Book another',
    duration: m => (m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`),
    weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], dateLocale: 'en-GB',
    error: m => m,
};

/** Known messages from the booking checks (browser and server) in Arabic. Anything else gets a general message. */
const AR_ERRORS: [RegExp, string][] = [
    [/booking link is not active/i, 'رابط الحجز هذا غير مفعّل.'],
    [/choose a date and a time/i, 'اختر التاريخ والوقت.'],
    [/enter your name/i, 'يرجى إدخال اسمك.'],
    [/valid phone number/i, 'يرجى إدخال رقم هاتف صحيح.'],
    [/enter your address/i, 'يرجى إدخال عنوانك.'],
    [/note is too long/i, 'الملاحظة طويلة جدًا.'],
    [/service is not available/i, 'هذه الخدمة غير متاحة.'],
    [/cleaner is not available/i, 'عامل النظافة هذا غير متاح.'],
    [/within working hours/i, 'اختر وقتًا ضمن ساعات العمل.'],
    [/too soon/i, 'هذا الوقت قريب جدًا. يرجى اختيار وقت لاحق.'],
    [/too far ahead/i, 'هذا التاريخ بعيد جدًا.'],
    [/away on that day/i, 'عامل النظافة هذا غير متاح في ذلك اليوم.'],
    [/just taken/i, 'تم حجز هذا الوقت للتو. يرجى اختيار وقت آخر.'],
    [/closed on that day/i, 'الشركة مغلقة في ذلك اليوم. يرجى اختيار يوم آخر.'],
    [/already have 3 requests/i, 'لديك 3 طلبات قيد الانتظار بالفعل. ستتواصل معك الشركة قريبًا.'],
];

const AR: Strings = {
    bookingFallback: 'الحجز', tagline: 'احجز خدمة تنظيف عبر الإنترنت', pageTitle: n => `${n} | احجز عبر الإنترنت`, langButton: 'English',
    loading: 'جارٍ التحميل...', inactiveTitle: 'رابط الحجز هذا غير مفعّل', inactiveText: 'يرجى التحقق من الرابط، أو اطلب من الشركة رابط الحجز.',
    footer: 'الحجوزات عبر CleanBase', stepsLabel: 'الخطوات',
    steps: { service: 'الخدمة', cleaner: 'عامل النظافة', time: 'التاريخ والوقت', details: 'بياناتك' },
    currency: 'ر.ق',
    chooseService: 'اختر الخدمة', perVisit: 'الأسعار لكل زيارة.', noServices: 'لا توجد خدمات متاحة للحجز عبر الإنترنت حاليًا.', select: 'اختيار',
    chooseCleaner: 'اختر عامل النظافة', cleanerLead: (s, d) => `${iso(s)}، ${d}. اختر من تعرفه، أو دعنا نختار لك.`, anyCleaner: 'أي عامل نظافة متاح',
    firstFree: d => `أول يوم متاح: ${d}`, fullyBooked: 'محجوز بالكامل حاليًا', nextFree: d => `أقرب موعد: ${d}`, notAvailable: 'غير متاح',
    pickTime: 'اختر التاريخ والوقت', timeLead: (s, w) => `${iso(s)} مع ${iso(w)}. الأوقات الباهتة غير متاحة.`, anyoneWho: 'أي عامل نظافة متاح',
    prevMonth: 'الشهر السابق', nextMonth: 'الشهر التالي', dayNotAvailable: '، غير متاح',
    noTimes: 'لا توجد مواعيد في هذا اليوم. اختر يومًا آخر.', nothingFree: 'لا توجد أوقات متاحة في هذا اليوم. اختر يومًا آخر.',
    legend: 'الأوقات الرمادية محجوزة أو لم تعد متاحة.', tipPast: 'هذا الوقت فات أو قريب جدًا', tipTaken: 'محجوز مسبقًا',
    dayBooked: 'محجوز', dayFirstFree: 'أول يوم متاح',
    yourDetails: 'بياناتك', detailsLead: 'لتتمكن الشركة من تأكيد الحجز والوصول إلى منزلك.', summaryService: 'الخدمة', summaryWhen: 'الموعد', summaryCleaner: 'عامل النظافة', summaryPrice: 'السعر',
    assignedByCompany: 'تحدده الشركة', fullName: 'الاسم الكامل', phone: 'رقم الهاتف (واتساب)', address: 'العنوان', addressHint: 'المنطقة، المبنى، الشقة',
    notes: 'ملاحظات (اختياري)', notesHint: 'رمز البوابة، الحيوانات الأليفة، ما تودّ التركيز عليه',
    back: 'رجوع', backTo: step => `الرجوع إلى: ${step}`,
    changeTime: 'تغيير الموعد', send: 'إرسال طلب الحجز', sending: 'جارٍ الإرسال...', nothingToPay: 'لا يلزم الدفع الآن. ستؤكد الشركة حجزك أولًا.',
    yourBooking: 'حجزك', notChosen: 'لم يُحدَّد بعد', openToday: (a, b) => `مفتوح اليوم من \u2066${a}\u2069 إلى \u2066${b}\u2069`, closedToday: 'مغلق اليوم، ويمكنك الحجز في يوم آخر',
    sent: 'تم إرسال الطلب', thanks: (n, c) => `شكرًا لك${n ? ` ${iso(n)}` : ''}. ستؤكد ${iso(c)} حجزك قريبًا. هذا الموعد محجوز لك أثناء مراجعة الطلب.`, bookAnother: 'احجز موعدًا آخر',
    duration: m => {
        const h = Math.floor(m / 60), r = m % 60;
        const hp = h > 0 ? arUnit(h, 'ساعة', 'ساعتان', 'ساعات', 'ساعة') : '';
        const mp = r > 0 ? arUnit(r, 'دقيقة', 'دقيقتان', 'دقائق', 'دقيقة') : '';
        return hp && mp ? `${hp} و${mp}` : hp || mp;
    },
    weekdays: ['اثن', 'ثلا', 'أرب', 'خمس', 'جمع', 'سبت', 'أحد'], dateLocale: 'ar-QA-u-ca-gregory-nu-latn',
    error: m => AR_ERRORS.find(([re]) => re.test(m))?.[1] || 'تعذّر إرسال الطلب. يرجى المحاولة مرة أخرى.',
};

export const STRINGS: Record<Lang, Strings> = { en: EN, ar: AR };

/* ------------------------------ client portal ------------------------------ */

export interface PortalStrings {
    title: string; lead: string; phoneLabel: string; phoneHint: string; enter8: string; notFound: string; failed: string;
    looking: string; show: string; noBookings: string; payNote: string; bookAgain: string; otherNumber: string; needLink: string;
    service: string; currency: string; status: Record<string, string>; payment: Record<string, string>;
}

export const PORTAL: Record<Lang, PortalStrings> = {
    en: {
        title: 'Your bookings', lead: 'Enter the phone number you booked with.', phoneLabel: 'Phone number',
        phoneHint: 'Qatar number, 8 digits. Another country? Start with +.', enter8: 'Enter your 8 digit mobile number.',
        notFound: 'We could not find bookings for that phone number.', failed: 'Something went wrong. Please try again.',
        looking: 'Looking...', show: 'Show my bookings', noBookings: 'No bookings yet.',
        payNote: 'To pay or change a booking, contact your cleaning company.', bookAgain: 'Book a cleaning', otherNumber: 'Use another number',
        needLink: 'This page needs the link your cleaning company sent you.', service: 'Cleaning', currency: 'QAR',
        status: { pending: 'Waiting for confirmation', confirmed: 'Confirmed', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' },
        payment: { paid: 'Paid', unpaid: 'Unpaid', overdue: 'Overdue' },
    },
    ar: {
        title: 'حجوزاتك', lead: 'أدخل رقم الهاتف الذي حجزت به.', phoneLabel: 'رقم الهاتف',
        phoneHint: 'رقم قطري من 8 أرقام. من دولة أخرى؟ ابدأ بعلامة +.', enter8: 'أدخل رقم جوالك المكوّن من 8 أرقام.',
        notFound: 'لم نجد حجوزات لهذا الرقم.', failed: 'حدث خطأ ما. يرجى المحاولة مرة أخرى.',
        looking: 'جارٍ البحث...', show: 'عرض حجوزاتي', noBookings: 'لا توجد حجوزات بعد.',
        payNote: 'للدفع أو لتعديل حجز، يرجى التواصل مع شركة التنظيف.', bookAgain: 'احجز خدمة تنظيف', otherNumber: 'استخدام رقم آخر',
        needLink: 'تحتاج هذه الصفحة إلى الرابط الذي أرسلته لك شركة التنظيف.', service: 'تنظيف', currency: 'ر.ق',
        status: { pending: 'بانتظار التأكيد', confirmed: 'مؤكد', in_progress: 'قيد التنفيذ', completed: 'مكتمل', cancelled: 'ملغي' },
        payment: { paid: 'مدفوع', unpaid: 'غير مدفوع', overdue: 'متأخر' },
    },
};
