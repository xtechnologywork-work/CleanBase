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
};

export default dict;
