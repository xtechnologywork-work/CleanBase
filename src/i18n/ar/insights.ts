import type { Dict } from '../../services/dashTranslate';
import { cnt, jobs, ltr } from './util';

/** Analytics, reports, quality, reviews, branding and working hours. */
const dict: Dict = {
    /* branding */
    'Could not use this image.': 'تعذر استخدام هذه الصورة.', 'Booking page branding': 'هوية صفحة الحجز', 'Your logo and colours appear on the page your clients use to book.': 'يظهر شعارك وألوانك في الصفحة التي يحجز منها عملاؤك.',
    'Open booking page': 'فتح صفحة الحجز', 'Logo': 'الشعار', 'Replace': 'استبدال', 'Upload logo': 'رفع الشعار',
    'PNG, JPG or WebP. Drag a file here too. A square logo with a clear background works best.': 'PNG أو JPG أو WebP. يمكنك أيضًا سحب ملف إلى هنا. الشعار المربع بخلفية واضحة هو الأفضل.',
    'Ready-made palettes': 'ألوان جاهزة', 'Main colour (buttons, highlights)': 'اللون الرئيسي (الأزرار والتمييز)', 'Main colour': 'اللون الرئيسي',
    'Soft colour (header, backgrounds)': 'اللون الفاتح (الترويسة والخلفيات)', 'Soft colour': 'اللون الفاتح', 'Automatic from the main colour': 'تلقائي من اللون الرئيسي',
    'This main colour is very light. Buttons may be hard to see on a white page. A darker colour reads better.': 'هذا اللون الرئيسي فاتح جدًا. قد يصعب رؤية الأزرار على صفحة بيضاء. اللون الأغمق أوضح.',
    'Tagline (optional)': 'الشعار النصي (اختياري)', 'Book a cleaning online': 'احجز خدمة تنظيف عبر الإنترنت', 'Home cleaning, 5h': 'تنظيف منزلي، 5 ساعات', 'Continue': 'متابعة',
    'Reset to default': 'إعادة إلى الافتراضي', 'Save branding': 'حفظ الهوية', '{} palette': m => `لوحة ${m[1]}`,

    /* review settings */
    'Review settings saved': 'تم حفظ إعدادات التقييم', 'Customer reviews': 'تقييمات العملاء', 'Customer Reviews': 'تقييمات العملاء',
    'Choose where customers are sent when you ask them for a review after a finished job.': 'اختر وجهة العملاء عندما تطلب منهم تقييمًا بعد مهمة منتهية.',
    'Where to send review requests': 'وجهة طلبات التقييم', 'Google Maps review (recommended)': 'تقييم Google Maps (موصى به)',
    'The customer leaves a real public review on your Google business page. It helps new customers find and trust you.': 'يترك العميل تقييمًا علنيًا حقيقيًا على صفحة نشاطك في Google. يساعد العملاء الجدد على إيجادك والوثوق بك.',
    'Private review page': 'صفحة تقييم خاصة', 'The customer rates the job on a CleanBase page. Nothing is public until you accept it.': 'يقيّم العميل المهمة في صفحة على CleanBase. لا شيء يُنشر قبل أن تقبله.',
    'Your Google review link': 'رابط تقييم Google الخاص بك', 'Test link': 'اختبار الرابط', 'This link opens your business page on Google Maps, not the review form.': 'يفتح هذا الرابط صفحة نشاطك على Google Maps، وليس نموذج التقييم.',
    'The customer would have to find "Write a review" by themselves. For a link that opens the form directly, use one of these:': 'سيضطر العميل إلى إيجاد «كتابة تقييم» بنفسه. للحصول على رابط يفتح النموذج مباشرة، استخدم أحد هذين:',
    'Your': 'معرّف', 'Place ID': 'Place ID', '(starts with ChIJ): find it with the': '(يبدأ بـ ChIJ): ابحث عنه عبر', 'Place ID Finder': 'Place ID Finder',
    ', search your business, copy the ID and paste it here. We build the review link for you.': '، ابحث عن نشاطك وانسخ المعرّف والصقه هنا. نحن نبني لك رابط التقييم.',
    'Or in your': 'أو من', 'Google Business Profile': 'Google Business Profile', ': "Ask for reviews" ("Get more reviews"), copy the link that looks like g.page/r/.../review.': ': «طلب تقييمات» («Get more reviews»)، وانسخ الرابط الذي يشبه g.page/r/.../review.',
    'This link opens your review form directly. Press Test link to check it.': 'يفتح هذا الرابط نموذج التقييم مباشرة. اضغط «اختبار الرابط» للتأكد.',
    'This is a valid Google link, but it is not the direct review form (see above).': 'هذا رابط Google صالح، لكنه ليس نموذج التقييم المباشر (انظر أعلاه).',
    'What the customer receives on WhatsApp': 'ما يستلمه العميل على واتساب',
    'You can change the wording in Business rules, Message templates, "Google review request".': 'يمكنك تغيير الصياغة من قواعد العمل ثم قوالب الرسائل ثم «طلب تقييم على Google».',
    'Discard changes': 'تجاهل التغييرات', 'Save review settings': 'حفظ إعدادات التقييم',
    'Best: paste your Place ID (starts with ChIJ, find it with the': 'الأفضل: الصق Place ID (يبدأ بـ ChIJ، ابحث عنه عبر',
    ') or the review link from your Google Business Profile, "Ask for reviews". Both open the review form directly. The Share link from Google Maps only opens the business page.': ') أو رابط التقييم من Google Business Profile، «طلب تقييمات». كلاهما يفتح نموذج التقييم مباشرة. أما رابط «مشاركة» من Google Maps فيفتح صفحة النشاط فقط.',

    /* working hours */
    'Check the times: closing must be after opening.': 'تحقق من الأوقات: يجب أن يكون الإغلاق بعد الفتح.', 'Keep at least one day open, or clients cannot book.': 'أبقِ يومًا واحدًا على الأقل مفتوحًا، وإلا لن يتمكن العملاء من الحجز.',
    'Working hours saved': 'تم حفظ ساعات العمل', 'Working hours': 'ساعات العمل',
    'Choose the days you work and when you open and close. Your booking page only offers times inside these hours, and a service must finish before closing.': 'اختر أيام العمل ووقت الفتح والإغلاق. تعرض صفحة الحجز أوقاتًا ضمن هذه الساعات فقط، ويجب أن تنتهي الخدمة قبل الإغلاق.',
    'Closing must be after opening': 'يجب أن يكون الإغلاق بعد الفتح', 'Same as above': 'مثل ما سبق', 'No bookings on this day': 'لا حجوزات في هذا اليوم', 'Quick fill': 'تعبئة سريعة',
    'Opening time for all days': 'وقت الفتح لكل الأيام', 'Closing time for all days': 'وقت الإغلاق لكل الأيام', 'Apply to all open days': 'تطبيق على كل الأيام المفتوحة', 'Save working hours': 'حفظ ساعات العمل',
    '{n}h{} open': m => `مفتوح ${m[1]} ساعة و${m[2]} دقيقة`, '{} open': m => `مفتوح ${m[1]}`, '{} opens': m => `يفتح ${m[1]}`, '{} closes': m => `يغلق ${m[1]}`, 'Same as {}': m => `مثل ${m[1]}`,

    /* analytics */
    'Same as the period before': 'مثل الفترة السابقة', 'Nothing earlier to compare with': 'لا توجد فترة سابقة للمقارنة', 'Up': 'ارتفاع', 'Down': 'انخفاض', 'Not due yet': 'لم يحن موعدها',
    '1 to 30 days late': 'متأخرة من 1 إلى 30 يومًا', '31 to 60 days late': 'متأخرة من 31 إلى 60 يومًا', 'Over 60 days late': 'متأخرة أكثر من 60 يومًا',
    'How the business is doing, compared with the period before. Every number comes from your own records.': 'حال عملك مقارنة بالفترة السابقة. كل رقم مأخوذ من سجلاتك أنت.',
    'Nothing to analyse yet. Once you add bookings, payments and expenses, your numbers and trends appear here.': 'لا شيء للتحليل بعد. بمجرد إضافة الحجوزات والدفعات والمصروفات تظهر هنا أرقامك واتجاهاتها.',
    'Average job value': 'متوسط قيمة المهمة', 'Cancellation rate': 'معدل الإلغاء', 'Still to collect': 'المتبقي للتحصيل', 'Money in and out': 'الأموال الداخلة والخارجة', 'By month': 'حسب الشهر', 'By week': 'حسب الأسبوع',
    'No revenue or expenses in this period.': 'لا إيرادات أو مصروفات في هذه الفترة.', 'Revenue, expenses and profit over the period': 'الإيرادات والمصروفات والربح خلال الفترة',
    'When your clients book': 'متى يحجز عملاؤك', 'Jobs by weekday and start time': 'المهام حسب يوم الأسبوع ووقت البدء', 'No bookings in this period.': 'لا حجوزات في هذه الفترة.', 'Revenue by service': 'الإيرادات حسب الخدمة',
    'First job in this period': 'أول مهمة في هذه الفترة', 'Returning': 'عملاء عائدون', 'Repeat rate': 'معدل التكرار', 'Clients with 2+ jobs, all time': 'عملاء لديهم مهمتان أو أكثر، منذ البداية',
    'No payments recorded yet, so there is no ranking.': 'لا توجد دفعات مسجلة بعد، لذلك لا يوجد ترتيب.', 'Top clients by money paid': 'أفضل العملاء حسب المبلغ المدفوع',
    'No completed jobs assigned to a cleaner in this period.': 'لا توجد مهام مكتملة معيّنة لعامل نظافة في هذه الفترة.', 'New complaints': 'شكاوى جديدة', 'Sales pipeline': 'مسار المبيعات',
    'All leads in your pipeline': 'كل العملاء المحتملين في مسارك', 'No leads yet. Add them under Leads and quotes.': 'لا عملاء محتملين بعد. أضفهم من «العملاء المحتملون وعروض الأسعار».',
    'No leads won or lost yet.': 'لم يُكسب أو يُخسر أي عميل محتمل بعد.', 'Money still to collect': 'أموال لا تزال مستحقة', 'Unpaid invoices by how late they are': 'الفواتير غير المدفوعة حسب مدة التأخر',
    'Every finished job has an invoice or is paid.': 'لكل مهمة منتهية فاتورة أو مدفوعة.',
    '{} {n}% on the period before': m => `${m[1]} ${ltr(m[2] + '%')} عن الفترة السابقة`, 'Revenue, {}': m => `الإيرادات، ${m[1]}`, 'Completed jobs, {}': m => `المهام المكتملة، ${m[1]}`,
    '{n}% margin. {}': m => `هامش ${ltr(m[1] + '%')}. ${m[2]}`, '{n} of {} jobs. {}': m => `${m[1]} من ${jobs(m[2])}. ${m[3]}`, '{n} QAR is overdue': m => `${m[1]} ر.ق متأخرة`,
    'Busiest slot: {} at {}:00 ({} jobs). Use it to plan your team.': m => `الوقت الأكثر ازدحامًا: ${m[1]} الساعة ${m[2]}:00 (${jobs(m[3])}). استخدمه لتخطيط فريقك.`,
    '{} {}:00, {} jobs': m => `${m[1]} ${m[2]}:00، ${jobs(m[3])}`, '{} {}:00, {} job': m => `${m[1]} ${m[2]}:00، مهمة واحدة`,
    '{n} published reviews': m => `${cnt(m[1], 'تقييم منشور واحد', 'تقييمان منشوران', 'تقييمات منشورة', 'تقييمًا منشورًا')}`, '{} published review': () => 'تقييم منشور واحد',
    '{n} still open': m => `${m[1]} لا تزال مفتوحة`, 'Win rate {n}%.': m => `معدل الكسب ${ltr(m[1] + '%')}.`, '{n} QAR still open in the pipeline.': m => `${m[1]} ر.ق لا تزال مفتوحة في المسار.`,
    'Also {} finished jobs ({} QAR) not invoiced yet.': m => `أيضًا ${jobs(m[1])} منتهية (${m[2]} ر.ق) لم تُفوتر بعد.`, 'Also {} finished job ({} QAR) not invoiced yet.': m => `أيضًا مهمة منتهية واحدة (${m[2]} ر.ق) لم تُفوتر بعد.`,
    '{n} reviews': m => `${m[1]} تقييم`, '{n} complaint': m => `${m[1]} شكوى`, '{n} new in period': m => `${m[1]} جديدة في الفترة`, '{n} of {} booked more than once': m => `${m[1]} من ${m[2]} حجزوا أكثر من مرة`,
    '{n} out of 5 stars': m => `${m[1]} من 5 نجوم`, '{n} answered': m => `${m[1]} أجابوا`, 'To approve ({})': m => `بانتظار الموافقة (${m[1]})`, '· with {}': m => `· مع ${m[1]}`,

    /* quality */
    'Cleaner involved': 'عامل النظافة المعني', 'Severity': 'الخطورة', 'Medium': 'متوسطة', 'High': 'عالية', 'Subject': 'الموضوع', 'What happened': 'ماذا حدث', 'Investigating': 'قيد التحقيق', 'Resolution': 'الحل',
    'Complaints and reviews in one place, so a bad job becomes a fixed problem.': 'الشكاوى والتقييمات في مكان واحد، لتتحول المهمة السيئة إلى مشكلة تم حلها.', 'Complaint log': 'سجل الشكاوى',
    'Log complaint': 'تسجيل شكوى', 'Logged': 'تم التسجيل', 'Updated': 'تم التحديث', 'How was it resolved?': 'كيف تم الحل؟', 'Resolved complaint': 'تم حل شكوى', 'Resolve': 'حل',

    /* reports */
    'The numbers behind the business. Every table exports to CSV for your accountant.': 'الأرقام وراء عملك. كل جدول يمكن تصديره إلى CSV لمحاسبك.', 'Profit': 'الربح', 'Cleaner productivity': 'إنتاجية عمال النظافة',
    'Client retention': 'استبقاء العملاء', 'Cancellations': 'الإلغاءات', 'Revenue by month': 'الإيرادات حسب الشهر', 'Last six months': 'آخر ستة أشهر', 'By service': 'حسب الخدمة', 'Share': 'الحصة', 'Margin': 'الهامش',
    'Revenue against expenses': 'الإيرادات مقابل المصروفات', 'Month by month': 'شهرًا بشهر', 'Monthly profit and loss': 'الربح والخسارة الشهرية', 'Contribution per service': 'مساهمة كل خدمة',
    'Revenue minus the supplies logged on those jobs': 'الإيرادات مطروحًا منها المستلزمات المسجلة على تلك المهام', 'Contribution': 'المساهمة', 'Hours worked': 'ساعات العمل', 'Revenue per hour': 'الإيراد لكل ساعة',
    'Active in period': 'نشطون في الفترة', 'Dormant over 60 days': 'خاملون أكثر من 60 يومًا', 'Worth a win-back message': 'يستحقون رسالة لاستعادتهم', 'Top clients': 'أفضل العملاء', 'Dormant clients': 'عملاء خاملون',
    'No completed job for over 60 days': 'بلا مهمة مكتملة منذ أكثر من 60 يومًا', 'No dormant clients.': 'لا يوجد عملاء خاملون.', 'Days ago': 'قبل كم يوم', 'Revenue lost': 'الإيرادات المفقودة',
    'Cancelled bookings': 'حجوزات ملغاة', 'No cancellations in this period.': 'لا إلغاءات في هذه الفترة.', 'Generated': 'أُنشئ في', '. Revenue counts completed jobs; expenses include payroll marked as paid.': '. تحسب الإيرادات المهام المكتملة؛ وتشمل المصروفات الرواتب المعلّمة كمدفوعة.',

    /* reviews */
    'Not asked yet': 'لم يُطلب بعد', 'Link sent, waiting': 'تم إرسال الرابط، بالانتظار', 'Waiting for your approval': 'بانتظار موافقتك', 'Published': 'منشور', 'Not published': 'غير منشور',
    'Sent a Google review request': 'تم إرسال طلب تقييم Google', 'Sent a review request': 'تم إرسال طلب تقييم', 'Published a customer review': 'تم نشر تقييم عميل',
    'Do not publish this review? The customer is not notified.': 'هل تريد عدم نشر هذا التقييم؟ لا يُشعَر العميل.', 'Declined a customer review': 'تم رفض تقييم عميل', 'Requests sent': 'الطلبات المرسلة',
    'Nothing is public until you accept it': 'لا شيء يُنشر قبل أن تقبله', 'Ask for reviews': 'طلب تقييمات', 'Latest finished jobs': 'آخر المهام المنتهية',
    'Send the customer your Google Maps review link on WhatsApp. They leave a real review on your Google page.': 'أرسل للعميل رابط تقييم Google Maps عبر واتساب. يترك تقييمًا حقيقيًا على صفحتك في Google.',
    'Send the customer a private link on WhatsApp. They rate the job there, and you decide what gets published.': 'أرسل للعميل رابطًا خاصًا عبر واتساب. يقيّم المهمة هناك، وأنت تقرر ما يُنشر.',
    'Reviews go to Google Maps. You can change this in': 'تذهب التقييمات إلى Google Maps. يمكنك تغيير ذلك من', 'Settings, Reviews': 'الإعدادات، التقييمات',
    'Want real reviews on Google Maps? Add your Google review link in': 'تريد تقييمات حقيقية على Google Maps؟ أضف رابط تقييم Google في',
    'No finished jobs in the last 45 days. Once a job is marked finished it appears here.': 'لا مهام منتهية في آخر 45 يومًا. بمجرد تعليم مهمة كمنتهية تظهر هنا.',
    'Review': 'التقييم', 'Google link sent': 'تم إرسال رابط Google', 'Open To approve': 'مفتوح للموافقة', 'No phone number saved for this client': 'لا يوجد رقم هاتف محفوظ لهذا العميل',
    'Send again': 'إرسال مرة أخرى', 'Copy the review link': 'نسخ رابط التقييم', 'Real answers from real links. Only reviews you accept are published and counted in ratings.': 'إجابات حقيقية من روابط حقيقية. تُنشر وتُحتسب في التقييمات فقط التقييمات التي تقبلها.',
    'No reviews are waiting. When a customer answers a link it appears here.': 'لا تقييمات بالانتظار. عندما يجيب عميل على رابط يظهر هنا.', 'The customer left no note.': 'لم يترك العميل ملاحظة.',
    'Accept and publish': 'قبول ونشر', 'Do not publish': 'عدم النشر', 'Answered': 'تمت الإجابة', 'Monitor feedback and cleaner performance ratings.': 'تابع آراء العملاء وتقييمات أداء عمال النظافة.',
    'total)': 'في المجموع)', 'No reviews yet': 'لا تقييمات بعد', 'Send a review link from the Ask for reviews tab. Approved reviews appear here.': 'أرسل رابط تقييم من تبويب «طلب تقييمات». تظهر هنا التقييمات المعتمدة.',
    'No comment provided.': 'لم يُترك تعليق.',
    '({} total)': m => `(${m[1]} في المجموع)`,
};

export default dict;
