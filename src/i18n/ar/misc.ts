import type { Dict } from '../../services/dashTranslate';

/** Staff documents and video, the AI chat, expense categories and the standard checklist. */
const dict: Dict = {
    'Add the file first: a photo or a PDF of the document.': 'أضف الملف أولًا: صورة أو ملف PDF للمستند.', 'Choose the expiry date.': 'اختر تاريخ الانتهاء.',
    'Added a staff document': 'تمت إضافة مستند موظف', 'Deleted a staff document': 'تم حذف مستند موظف', 'No documents yet. Add the first one below.': 'لا توجد مستندات بعد. أضف أول مستند أدناه.',
    'Add a document': 'إضافة مستند', 'Photo or PDF': 'صورة أو PDF', 'Photo (from your phone camera too) or PDF, up to 10 MB.': 'صورة (من كاميرا الهاتف أيضًا) أو PDF، حتى 10 ميغابايت.', 'Save document': 'حفظ المستند',
    'Delete {} of {}? The file is deleted too.': m => `هل تريد حذف ${m[1]} لـ ${m[2]}؟ يُحذف الملف أيضًا.`, 'Documents, {}': m => `المستندات، ${m[1]}`, 'Open {}': m => `فتح ${m[1]}`, 'Video of {}': m => `فيديو ${m[1]}`,
    'This video could not be loaded. Try again in a moment.': 'تعذر تحميل هذا الفيديو. حاول مرة أخرى بعد قليل.', 'Cleaner video': 'فيديو عامل النظافة',
    'Videos need the cloud database, so they are not available in demo mode.': 'الفيديوهات تحتاج إلى قاعدة البيانات السحابية، لذلك لا تتوفر في الوضع التجريبي.',
    'Replace video': 'استبدال الفيديو', 'Add a short video so clients can meet': 'أضف فيديو قصيرًا ليتعرف العملاء على', 'Upload video': 'رفع الفيديو', 'MP4, WebM or MOV, up to': 'MP4 أو WebM أو MOV، حتى',
    'The video is saved when you press Save Changes. Only your team can watch it.': 'يُحفظ الفيديو عند الضغط على «حفظ التغييرات». فريقك فقط يمكنه مشاهدته.',

    /* AI chat */
    'What went wrong today?': 'ما الذي حدث بشكل خاطئ اليوم؟', 'Which jobs have no cleaner?': 'أي المهام بلا عامل نظافة؟', 'Best cleaner this week?': 'من أفضل عامل نظافة هذا الأسبوع؟',
    "What's booked for tomorrow?": 'ما المحجوز لغد؟', 'Give me the daily report': 'أعطني التقرير اليومي', 'Good morning': 'صباح الخير', 'Good afternoon': 'مساء الخير', 'Good evening': 'مساء النور',
    'Nothing is worrying me right now.': 'لا شيء يقلقني الآن.', 'Hello, I would like to hear when the CleanBase AI Manager is ready.': 'مرحبًا، أودّ أن أعرف متى يصبح المدير الذكي في CleanBase جاهزًا.',
    'Your plan:': 'باقتك:', '. Nothing to set up now.': '. لا شيء تعدّه الآن.', 'A manager that reads your real bookings, money and team, and tells you what matters.': 'مدير يقرأ حجوزاتك وأموالك وفريقك الحقيقيين، ويخبرك بما يهم.',
    'Language': 'اللغة', 'English': 'English', 'Chat with your AI manager': 'تحدث مع مديرك الذكي', 'The manager is thinking': 'المدير يفكر', 'Ask about sales, bookings, problems...': 'اسأل عن المبيعات والحجوزات والمشاكل...',
    'Your question': 'سؤالك', 'Sales today': 'مبيعات اليوم', 'Still to come': 'المتبقي اليوم', 'Problems to fix': 'مشاكل تحتاج حلًا', 'Most urgent first, each with the suggested fix': 'الأكثر إلحاحًا أولًا، ومع كل مشكلة الحل المقترح',
    'Nothing needs fixing right now.': 'لا شيء يحتاج إصلاحًا الآن.', 'Fix:': 'الحل:', 'Daily report': 'التقرير اليومي',

    /* expense categories, defaults */
    'Fuel': 'الوقود', 'Vehicle maintenance': 'صيانة المركبات', 'Rent': 'الإيجار', 'Visas and permits': 'التأشيرات والتصاريح', 'Marketing': 'التسويق', 'Utilities': 'المرافق',
    'Other expense': 'مصروفات أخرى', 'Browser storage is full. Remove some photos or demo data.': 'مساحة تخزين المتصفح ممتلئة. احذف بعض الصور أو البيانات التجريبية.', 'Nothing to export yet.': 'لا شيء لتصديره بعد.',
    'Super admin': 'مشرف المنصة', 'System': 'النظام', 'Monthly': 'شهري',
    'Dust all surfaces': 'مسح الغبار عن كل الأسطح', 'Vacuum and mop floors': 'كنس الأرضيات ومسحها', 'Clean kitchen and appliances': 'تنظيف المطبخ والأجهزة',
    'Clean bathrooms and toilets': 'تنظيف الحمامات ودورات المياه', 'Empty bins': 'تفريغ سلال المهملات', 'Final walkthrough with client': 'جولة أخيرة مع العميل',
};

export default dict;
