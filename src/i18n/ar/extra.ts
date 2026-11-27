import type { Dict } from '../../services/dashTranslate';
import { cnt, hours, jobs, ltr, minutes } from './util';

/** Texts that were found on screen after the first pass: counts, tooltips, small labels. */
const dict: Dict = {
    '{} · {} at {} · {n}h · {}': m => `${m[1]} · ${m[2]} الساعة ${m[3]} · ${hours(m[4])} · ${m[5]}`,
    '{} {} at {}': m => `${m[1]} ${m[2]} الساعة ${m[3]}`,
    '{} (assigned)': m => `${m[1]} (معيّن)`, '{} (asked for)': m => `${m[1]} (مطلوب)`, '{} (kept for a subscription)': m => `${m[1]} (محجوز لعقد)`,
    '{n} Needs Dispatch': m => `${m[1]} تحتاج إلى توزيع`, '{n} unassigned staff': m => `${m[1]} بلا عامل نظافة`, 'unassigned staff': 'بلا عامل نظافة',
    '{} QAR Est.': m => `${m[1]} ر.ق (تقديري)`,
    'Previous Month': 'الشهر السابق', 'Next Month': 'الشهر التالي', 'Previous day': 'اليوم السابق', 'Next day': 'اليوم التالي', 'Previous month': 'الشهر السابق', 'Next month': 'الشهر التالي',
    'Share of an {n} hour day': m => `حصة من يوم مدته ${hours(m[1])}`, '{n} bookings this day': m => `${cnt(m[1], 'حجز واحد', 'حجزان', 'حجوزات', 'حجزًا')} في هذا اليوم`,
    '{n} booking this day': () => 'حجز واحد في هذا اليوم', '{} (no vehicle)': m => `${m[1]} (بلا مركبة)`, 'No cleaner assigned': 'لا يوجد عامل نظافة معيّن',
    'What active subscriptions bring in each month': 'ما تدرّه الاشتراكات النشطة كل شهر',
    '{} in the pipeline': m => `${m[1]} في المسار`, 'Where leads come from': 'من أين يأتي العملاء المحتملون', 'leads ·': 'عملاء محتملون ·', 'won ·': 'مكسوب ·',
    'Delete all lost leads': 'حذف كل العملاء المحتملين الخاسرين', 'all lost leads': 'كل العملاء المحتملين الخاسرين',
    'lifetime jobs': 'مهام منذ البداية', 'cleaners active': 'عمال نظافة نشطون', '{n} cleaners active': m => `${cnt(m[1], 'عامل نظافة نشط', 'عاملا نظافة نشطان', 'عمال نظافة نشطون', 'عامل نظافة نشط')}`,
    '{n} cleaner active': () => 'عامل نظافة نشط واحد', 'active': 'نشط', 'rating': 'التقييم', 'displayed': 'معروضة', '{n} displayed': m => `${m[1]} معروضة`,
    'Store insights': 'إحصاءات المتجر', 'Who opened your link and how many booked. Visitors are counted with no personal data.': 'من فتح رابطك وكم حجز. يُحسب الزوار دون أي بيانات شخصية.',
    'Visitors': 'الزوار', 'People who opened your store link': 'الأشخاص الذين فتحوا رابط متجرك', 'Live now': 'نشطون الآن',
    'On the store in the last {n} minutes': m => `في المتجر خلال آخر ${minutes(m[1])}`, 'Requests': 'الطلبات', '{n} accepted': m => `${m[1]} مقبولة`, 'Visitors who sent a request': 'زوار أرسلوا طلبًا',
    'No visits in this period yet. Share your store link on WhatsApp, Instagram or Google to start getting bookings': 'لا زيارات في هذه الفترة بعد. شارك رابط متجرك عبر واتساب أو إنستغرام أو Google لتبدأ بتلقي الحجوزات',
    'No visits in this period yet. Share your store link on WhatsApp, Instagram or Google to start getting bookings.': 'لا زيارات في هذه الفترة بعد. شارك رابط متجرك عبر واتساب أو إنستغرام أو Google لتبدأ بتلقي الحجوزات.',
    '7 days': '7 أيام', '30 days': '30 يومًا', '90 days': '90 يومًا',
    'Collected this month': 'المحصّل هذا الشهر', 'Spent this month': 'المُنفق هذا الشهر', '{n}% vs last month': m => `${ltr(m[1] + '%')} مقارنة بالشهر الماضي`,
    'Completed jobs': 'المهام المكتملة', 'By day': 'حسب اليوم',
    'Generated {}. Revenue counts completed jobs; expenses include payroll marked as paid.': m => `أُنشئ في ${m[1]}. تحسب الإيرادات المهام المكتملة؛ وتشمل المصروفات الرواتب المعلّمة كمدفوعة.`,
    '{} · {n} jobs · {n}%': m => `${m[1]} · ${jobs(m[2])} · ${ltr(m[3] + '%')}`, '{n} leads · {}': m => `${cnt(m[1], 'عميل محتمل واحد', 'عميلان محتملان', 'عملاء محتملون', 'عميلًا محتملًا')} · ${m[2]}`,
    '{n} lead · {}': m => `عميل محتمل واحد · ${m[1]}`,
    'Invoice details, booking rules, message templates and who can see what.': 'بيانات الفواتير وقواعد الحجز وقوالب الرسائل ومن يمكنه رؤية ماذا.',
    'Invoice prefix': 'بادئة الفاتورة', 'Invoice footer': 'تذييل الفاتورة', 'Free cancellation until (hours before)': 'الإلغاء المجاني حتى (قبل كم ساعة)',
    'WhatsApp messages to your clients. Each one has an English part and an Arabic part: write the Arabic lines in Arabic and they get Arabic dates and times automatically. Placeholders: {name} {service} {date} {time} {address} {cleaner} {company} {number} {amount} {due} {link} {reason}. A line whose placeholders are all empty is left out.': 'رسائل واتساب إلى عملائك. لكل رسالة جزء بالإنجليزية وجزء بالعربية: اكتب الأسطر العربية بالعربية لتحصل تلقائيًا على تواريخ وأوقات بالعربية. العناصر المتغيرة: {name} {service} {date} {time} {address} {cleaner} {company} {number} {amount} {due} {link} {reason}. السطر الذي تكون كل عناصره المتغيرة فارغة يُحذف.',
    'Sent when you decline a booking request. {reason} is the reason you chose, {link} is your booking page': 'يُرسل عند رفض طلب حجز. {reason} هو السبب الذي اخترته، و{link} هو رابط صفحة الحجز الخاصة بك',
    'Price, QAR per visit': 'السعر، ر.ق لكل زيارة', 'Price, QAR': 'السعر، ر.ق',
    'Expiring in 30 days': 'تنتهي خلال 30 يومًا', 'Payroll this month': 'رواتب هذا الشهر', 'Overtime / hour': 'العمل الإضافي / الساعة', 'Performance, last 30 days': 'الأداء، آخر 30 يومًا',
    'Stock drops automatically when a cleaner logs supplies on a job': 'ينخفض المخزون تلقائيًا عندما يسجل عامل النظافة المستلزمات المستخدمة في مهمة', 'Add item': 'إضافة صنف',
    'Standard Operating Hours': 'ساعات العمل المعتادة', 'Driver board': 'لوحة السائقين', 'Driver app (phone)': 'تطبيق السائق (الهاتف)',

    /* booking store insights */
    'Where visitors stop': 'أين يتوقف الزوار', 'Day by day': 'يومًا بيوم', 'Opened the store': 'فتح المتجر', 'Chose a service': 'اختار خدمة',
    'Chose a cleaner': 'اختار عامل نظافة', 'Picked a time': 'اختار وقتًا', 'Filled in their details': 'أدخل بياناته', 'Sent a request': 'أرسل طلبًا',
    '{n} · {n}%': m => `${m[1]} · ${ltr(m[2] + '%')}`, '{n} · {n}% · {n} left here': m => `${m[1]} · ${ltr(m[2] + '%')} · ${m[3]} توقفوا هنا`, 'Requests': 'الطلبات',

    /* cleaners, clients, documents */
    '{} rating': m => `تقييم ${m[1]}`, '{n} lifetime jobs': m => `${jobs(m[1])} منذ البداية`, '{n} lifetime job': () => 'مهمة واحدة منذ البداية',
    '{n} recurring contracts': m => `${cnt(m[1], 'عقد متكرر واحد', 'عقدان متكرران', 'عقود متكررة', 'عقدًا متكررًا')}`, '{n} recurring contract': () => 'عقد متكرر واحد', 'recurring contracts': 'عقود متكررة',
    '{n} active': m => `${m[1]} نشط`, 'Documents ({}) · expiring soon': m => `المستندات (${m[1]}) · تنتهي قريبًا`, 'Documents ({}) · expired': m => `المستندات (${m[1]}) · منتهية`,
    'Expires {}': m => `تنتهي في ${m[1]}`, 'Expired {}': m => `انتهت في ${m[1]}`, 'Item': 'الصنف',
    '{n} of {n} displayed': m => `${m[1]} من ${m[2]} معروضة`, 'Joined {}': m => `انضم في ${m[1]}`, '{n} Active Plan': m => `${m[1]} خطة نشطة`,
    'weekly': 'أسبوعي', 'bi-weekly': 'كل أسبوعين', 'monthly': 'شهري', 'live-in': 'إقامة كاملة',
    'Dashboard Accounts & Team': 'حسابات لوحة التحكم والفريق', 'Discount (QAR)': 'الخصم (ر.ق)', 'Amount (QAR)': 'المبلغ (ر.ق)',

    /* raw states shown as they are stored */
    'new': 'جديد', 'contacted': 'تم التواصل', 'quoted': 'تم إرسال عرض', 'won': 'تم الفوز', 'lost': 'خسارة',
    'paid': 'مدفوع', 'unpaid': 'غير مدفوع', 'paused': 'متوقف مؤقتًا', 'cancelled': 'ملغى', 'ended': 'منتهٍ',

    /* driver board */
    '{} to {} · {}': m => `${m[1]} إلى ${m[2]} · ${m[3]}`,
    '{} · leave {}, collect {}': m => `${m[1]} · الانطلاق ${m[2]}، الاستلام ${m[3]}`,

    /* activity log (the first letter is written in lower case there) */
    'logged complaint': 'سجّل شكوى', 'updated complaint': 'حدّث شكوى', 'resolved complaint': 'حلّ شكوى',
    'approved leave request': 'وافق على طلب إجازة', 'rejected leave request': 'رفض طلب إجازة',
    'paid salary {} QAR': m => `دفع راتبًا بقيمة ${m[1]} ر.ق`, 'recorded payment of {} QAR': m => `سجّل دفعة بقيمة ${m[1]} ر.ق`, 'refunded {} QAR': m => `ردّ مبلغ ${m[1]} ر.ق`,
    '· {n} staff': m => `· ${m[1]} موظفين`,
    '{n} / {n} paid': m => `${m[1]} / ${m[2]} مدفوعة`, '{n} late': m => `${m[1]} متأخرة`, 'Paid {}': m => `دُفعت ${m[1]}`,
};

export default dict;
