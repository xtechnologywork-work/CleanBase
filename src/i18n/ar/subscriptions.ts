import type { Dict } from '../../services/dashTranslate';
import { contracts, ltr } from './util';

/** Contracts page (subscriptions, payment plans, contract templates) and the rules that keep a cleaner for a client. */
const dict: Dict = {
    /* header and numbers */
    'Recurring clients, the contract for each one, and your own contract templates.': 'العملاء المتكررون، وعقد كل منهم، وقوالب العقود الخاصة بك.',
    'New template': 'قالب جديد', 'New subscription': 'اشتراك جديد', 'Active subscriptions': 'الاشتراكات النشطة', 'Monthly value': 'القيمة الشهرية',
    'Late payments': 'دفعات متأخرة', 'Nobody is behind': 'لا أحد متأخر', 'Contracts signed': 'العقود الموقعة', 'Every active subscription is covered': 'كل اشتراك نشط مغطى بعقد',
    'Expected per year (ARR)': 'المتوقع سنويًا (ARR)', 'Monthly value x 12, if every active subscription continues': 'القيمة الشهرية × 12، إذا استمر كل اشتراك نشط',
    'Value of signed contracts': 'قيمة العقود الموقعة', 'Collected so far': 'المحصّل حتى الآن', 'Nothing collected yet': 'لم يُحصّل شيء بعد',
    'Still expected': 'المتوقع تحصيله', 'All on schedule': 'كل شيء في موعده',
    '{n} in total': m => `${m[1]} في المجموع`, '{n} active without a signed contract': m => `${m[1]} نشطة بلا عقد موقّع`,
    '{n} monthly payments in total': m => `${m[1]} دفعة شهرية في المجموع`, '{n}% of signed contracts': m => `${ltr(m[1] + '%')} من العقود الموقعة`,
    '{} is kept for two clients at the same time': m => `${m[1]} محجوز لعميلين في الوقت نفسه`,
    ') and': ') و', '). A cleaner can only be with one client during a plan: change the cleaner or the dates of one of them.': '). لا يمكن لعامل النظافة أن يكون مع أكثر من عميل خلال الخطة: غيّر عامل النظافة أو تواريخ أحدهما.',

    /* tabs and lists */
    'Subscriptions': 'الاشتراكات', 'Payments': 'الدفعات', 'Templates': 'القوالب', 'Payments ({} late)': m => `الدفعات (${m[1]} متأخرة)`, 'Contracts ({})': m => `العقود (${m[1]})`,
    'Click one to see its details and its contract': 'انقر على اشتراك لرؤية تفاصيله وعقده',
    'No subscriptions yet. Add a recurring client with their service, price and dates.': 'لا توجد اشتراكات بعد. أضف عميلًا متكررًا مع خدمته وسعره وتواريخه.',
    'Kept for this client': 'محجوز لهذا العميل', 'Not assigned': 'غير معيّن', 'How often': 'التكرار', 'Period': 'الفترة', 'No end date': 'بلا تاريخ انتهاء',
    'Monthly payments': 'الدفعات الشهرية', 'Contract': 'العقد', 'Subscription': 'الاشتراك', 'Per month, about': 'شهريًا، تقريبًا', 'Starts': 'البداية', 'Ends': 'النهاية',
    'One payment each month, starting on the day the contract was signed': 'دفعة واحدة كل شهر، تبدأ من يوم توقيع العقد',
    'To collect': 'المطلوب تحصيله', 'Nothing to collect. Payments appear here once a contract is signed.': 'لا شيء للتحصيل. تظهر الدفعات هنا بمجرد توقيع عقد.',
    'No monthly payment has been recorded yet.': 'لم تُسجّل أي دفعة شهرية بعد.', 'Due': 'الاستحقاق', 'Paid on': 'تاريخ الدفع', 'Amount': 'المبلغ',
    'Undo': 'تراجع', 'Mark paid': 'تعليم كمدفوع', 'Due soon': 'مستحقة قريبًا', 'Upcoming': 'قادمة', 'Month {} payment': m => `دفعة الشهر ${m[1]}`,
    '{}, month {}': m => `${m[1]}، الشهر ${m[2]}`,
    'Undo the payment for month {}? The payment is also removed from your payments ledger.': m => `هل تريد التراجع عن دفعة الشهر ${m[1]}؟ تُزال الدفعة أيضًا من سجل المدفوعات.`,
    'Undid month {} payment': m => `تم التراجع عن دفعة الشهر ${m[1]}`,
    'All contracts': 'كل العقود', 'Active means signed and running. Drafts can still be edited. Signed and cancelled contracts are locked.': '«نشط» يعني موقّعًا وساريًا. يمكن تعديل المسودات. العقود الموقعة والملغاة مقفلة.',
    'No contracts yet. Open a subscription and choose Create contract.': 'لا توجد عقود بعد. افتح اشتراكًا واختر «إنشاء عقد».',
    'Number': 'الرقم', 'Signed': 'موقّع', 'Contract templates': 'قوالب العقود',
    'Write the terms once. Each contract fills in the client, service, price and dates for you.': 'اكتب الشروط مرة واحدة. يملأ كل عقد بيانات العميل والخدمة والسعر والتواريخ تلقائيًا.',
    'No templates yet. Write your first contract: your clauses, your wording.': 'لا توجد قوالب بعد. اكتب أول عقد: بنودك وصياغتك.',
    'Contract title': 'عنوان العقد', 'Default': 'الافتراضي', 'Length': 'الطول', '{n} words': m => `${m[1]} كلمة`,
    'Card': 'بطاقة', 'Bank transfer': 'تحويل بنكي', 'Online': 'عبر الإنترنت', 'Cash': 'نقدًا', 'Deleted client': 'عميل محذوف', 'Deleted service': 'خدمة محذوفة',

    /* one subscription */
    'Cancel subscription': 'إلغاء الاشتراك', 'Pause': 'إيقاف مؤقت', 'Resume': 'استئناف', 'Reactivate': 'إعادة التفعيل', 'Cancelled on': 'تاريخ الإلغاء',
    'Reason:': 'السبب:', '. Reason:': '. السبب:',
    'The subscription changed after this contract was written. Open it to update the text.': 'تغيّر الاشتراك بعد كتابة هذا العقد. افتحه لتحديث النص.',
    'Open contract': 'فتح العقد',
    'No contract for this subscription yet. Pick one of your templates, or write one from scratch.': 'لا يوجد عقد لهذا الاشتراك بعد. اختر أحد قوالبك أو اكتب عقدًا من الصفر.',
    'Template': 'القالب', '(default)': '(افتراضي)', 'Create contract': 'إنشاء عقد', 'This subscription was cancelled before a contract was made.': 'أُلغي هذا الاشتراك قبل إنشاء عقد.',
    'The payment plan starts when the contract is signed. The first payment is due on the day it is signed, then one every month.': 'تبدأ خطة الدفع عند توقيع العقد. الدفعة الأولى مستحقة يوم التوقيع، ثم دفعة كل شهر.',
    'No payment plan yet. It starts from the signing date,': 'لا توجد خطة دفع بعد. تبدأ من تاريخ التوقيع،',
    'Number of months': 'عدد الأشهر', 'Start monthly payments': 'بدء الدفعات الشهرية',
    'This contract was cancelled, so unpaid months are no longer expected.': 'أُلغي هذا العقد، لذلك لم تعد الأشهر غير المدفوعة مستحقة.', 'This contract has ended.': 'انتهى هذا العقد.',
    'The price changed': 'تغيّر السعر', 'Unpaid months still show an old amount. Paid months are never changed.': 'ما زالت الأشهر غير المدفوعة تعرض مبلغًا قديمًا. الأشهر المدفوعة لا تتغير أبدًا.', 'Use': 'استخدام',
    '{} is now {}, so this subscription cannot be resumed with her. Change the cleaner or the dates first.': m => `${m[1]} الآن ${m[2]}، لذلك لا يمكن استئناف هذا الاشتراك مع عامل النظافة نفسه. غيّر عامل النظافة أو التواريخ أولًا.`,
    'Reactivate this subscription for {}? Its cancelled contract stays cancelled, so you will create a new contract.': m => `هل تريد إعادة تفعيل هذا الاشتراك لـ ${m[1]}؟ يبقى عقده الملغى ملغيًا، لذا ستنشئ عقدًا جديدًا.`,
    'It has {} contracts.': m => `لديه ${contracts(m[1])}.`, 'It has {} contract.': () => 'لديه عقد واحد.',
    '{n} draft will be deleted.': m => `ستُحذف ${m[1]} مسودة.`, '{n} drafts will be deleted.': m => `ستُحذف ${m[1]} مسودات.`,
    '{n} signed contract is kept and marked as ended.': m => `سيبقى ${m[1]} عقد موقّع ويُعلّم كمنتهٍ.`, '{n} signed contracts are kept and marked as ended.': m => `ستبقى ${m[1]} عقود موقعة وتُعلّم كمنتهية.`,
    'Contract {id} is cancelled too.': m => `العقد ${m[1]} ملغى أيضًا.`,

    /* the subscription form */
    'Choose a client and a service.': 'اختر عميلًا وخدمة.', 'Enter the price, for example 150.': 'أدخل السعر، مثال: 150.', 'Choose the start date.': 'اختر تاريخ البداية.',
    'The end date cannot be before the start date.': 'لا يمكن أن يكون تاريخ النهاية قبل تاريخ البداية.', 'This cleaner': 'عامل النظافة هذا',
    'Choose a client': 'اختر عميلًا', 'Choose a service': 'اختر خدمة',
    'Filled from the service. Type your own price if you agreed a different one.': 'يُملأ من الخدمة. اكتب سعرك إن اتفقتم على سعر مختلف.',
    'Start date': 'تاريخ البداية', 'End date': 'تاريخ النهاية', 'Leave empty if it continues until someone ends it.': 'اتركه فارغًا إن كان مستمرًا حتى ينهيه أحد الطرفين.',
    'A cleaner kept for another client during these dates is greyed out.': 'عامل النظافة المحجوز لعميل آخر في هذه التواريخ يظهر باهتًا.', 'Kept for': 'محجوز لـ',
    'To cancel, use Cancel subscription so the reason is recorded.': 'للإلغاء، استخدم «إلغاء الاشتراك» ليُسجّل السبب.', 'Access, keys, special requests': 'الدخول، المفاتيح، طلبات خاصة',
    '(kept for {})': m => `(محجوز لـ ${m[1]})`, 'kept for {} until the subscription ends': m => `محجوز لـ ${m[1]} حتى انتهاء الاشتراك`, 'kept for {} until {}': m => `محجوز لـ ${m[1]} حتى ${m[2]}`,
    '{} until the subscription ends': m => `${m[1]} حتى انتهاء الاشتراك`, '{} until {}': m => `${m[1]} حتى ${m[2]}`, 'until {}': m => `حتى ${m[1]}`, 'until the subscription ends': 'حتى انتهاء الاشتراك',
    '{} is kept for {}. Choose another cleaner, or dates after that.': m => `${m[1]} محجوز لـ ${m[2]}. اختر عامل نظافة آخر، أو تواريخ بعد ذلك.`,
    '{} already has {} bookings for other clients in this period (the first on {}). They are not deleted: move them to another cleaner. Save anyway?': m => `لدى ${m[1]} ${m[2]} حجوزات لعملاء آخرين في هذه الفترة (أولها في ${m[3]}). لن تُحذف: انقلها إلى عامل نظافة آخر. هل تريد الحفظ على أي حال؟`,
    '{} already has {} booking for other clients in this period (the first on {}). They are not deleted: move them to another cleaner. Save anyway?': m => `لدى ${m[1]} حجز واحد لعميل آخر في هذه الفترة (في ${m[3]}). لن يُحذف: انقله إلى عامل نظافة آخر. هل تريد الحفظ على أي حال؟`,
    '{} is kept for {} until {}. Change the cleaner or the dates of one subscription before signing.': m => `${m[1]} محجوز لـ ${m[2]} حتى ${m[3]}. غيّر عامل النظافة أو تواريخ أحد الاشتراكات قبل التوقيع.`,
    '{} is kept for {} until the subscription ends. Change the cleaner or the dates of one subscription before signing.': m => `${m[1]} محجوز لـ ${m[2]} حتى انتهاء الاشتراك. غيّر عامل النظافة أو تواريخ أحد الاشتراكات قبل التوقيع.`,
    '{} is kept for {} until {}, so she cannot take this job.': m => `${m[1]} محجوز لـ ${m[2]} حتى ${m[3]}، لذلك لا يمكن إسناد هذه المهمة إلى عامل النظافة هذا.`,
    '{} is kept for {} until the subscription ends, so she cannot take this job.': m => `${m[1]} محجوز لـ ${m[2]} حتى انتهاء الاشتراك، لذلك لا يمكن إسناد هذه المهمة إلى عامل النظافة هذا.`,

    /* the contract */
    'Edited a contract': 'تم تعديل عقد', 'Created a contract': 'تم إنشاء عقد', 'Saved.': 'تم الحفظ.', 'Regenerated a contract': 'تمت إعادة إنشاء عقد',
    'The contract now uses the current subscription.': 'يستخدم العقد الآن بيانات الاشتراك الحالية.', 'Marked as up to date.': 'تم التعليم كمحدّث.',
    'Write the contract text before signing.': 'اكتب نص العقد قبل التوقيع.',
    'The subscription changed. Regenerate the contract, or mark it as up to date, then sign.': 'تغيّر الاشتراك. أعد إنشاء العقد أو علّمه كمحدّث ثم وقّع.',
    'Months of payments must be between 0 and 60.': 'يجب أن يكون عدد أشهر الدفعات بين 0 و60.', 'Marked a contract as signed': 'تم تعليم عقد كموقّع',
    'End this contract? It stays on record and can still be printed.': 'هل تريد إنهاء هذا العقد؟ يبقى محفوظًا ويمكن طباعته.', 'Ended a contract': 'تم إنهاء عقد',
    'Deleted a draft contract': 'تم حذف مسودة عقد', 'Print 2 copies': 'طباعة نسختين', 'Mark as signed': 'تعليم كموقّع', 'End contract': 'إنهاء العقد',
    'The subscription changed after this contract was written': 'تغيّر الاشتراك بعد كتابة هذا العقد',
    'Update the contract so it matches what you agreed now.': 'حدّث العقد ليطابق ما اتفقتم عليه الآن.', 'Regenerate from template': 'إعادة الإنشاء من القالب',
    'Keep my text, mark as up to date': 'الإبقاء على نصي وتعليمه كمحدّث', 'Title': 'العنوان', 'Contract text': 'نص العقد', 'Write the contract here.': 'اكتب العقد هنا.',
    'Signing date': 'تاريخ التوقيع', 'The first payment is due on this day.': 'الدفعة الأولى مستحقة في هذا اليوم.', 'Months of payments': 'أشهر الدفعات',
    'One payment each month. Use 0 for no payment plan.': 'دفعة واحدة كل شهر. استخدم 0 لعدم وجود خطة دفع.', 'Signed on': 'تاريخ التوقيع', 'Ended on': 'تاريخ الانتهاء',
    'Client address': 'عنوان العميل', 'Service name': 'اسم الخدمة', 'Every week': 'كل أسبوع', 'Every two weeks': 'كل أسبوعين', 'Live-in worker': 'عامل مقيم',
    'Open-ended (until either side ends it)': 'مفتوح المدة (حتى ينهيه أحد الطرفين)', 'Cleaner name': 'اسم عامل النظافة', 'Your company': 'شركتك',
    'Client phone': 'هاتف العميل', 'Company name': 'اسم الشركة', 'Contract number': 'رقم العقد', 'To be assigned': 'سيُعيَّن لاحقًا', 'Out of date': 'قديم',
    'Service agreement': 'اتفاقية خدمة', 'Allow pop-ups to print.': 'اسمح بالنوافذ المنبثقة للطباعة.', 'Company copy': 'نسخة الشركة', 'Client copy': 'نسخة العميل',

    /* templates */
    'Give the template a name, a title and some text.': 'أعطِ القالب اسمًا وعنوانًا ونصًا.', 'Updated a contract template': 'تم تحديث قالب عقد', 'Created a contract template': 'تم إنشاء قالب عقد',
    'Deleted a contract template': 'تم حذف قالب عقد', 'Template name': 'اسم القالب', 'Only you see this, for example Weekly cleaning': 'أنت فقط ترى هذا، مثال: تنظيف أسبوعي',
    'Printed at the top. You can use fields here too.': 'يُطبع في الأعلى. يمكنك استخدام الحقول هنا أيضًا.', 'Insert a field': 'إدراج حقل', 'Unknown field:': 'حقل غير معروف:',
    '. It will print as it is.': '. سيُطبع كما هو.', 'With your first subscription': 'مع أول اشتراك لديك', 'With example values': 'بقيم تجريبية', 'Your text appears here.': 'يظهر نصك هنا.',
    'Use this template first when creating contracts': 'استخدام هذا القالب أولًا عند إنشاء العقود', 'Save template': 'حفظ القالب',

    /* recording a payment and cancelling */
    'Choose the date of the payment.': 'اختر تاريخ الدفعة.', 'Enter the amount that was paid.': 'أدخل المبلغ المدفوع.', '. Due': '. الاستحقاق', 'Date paid': 'تاريخ الدفع', 'How they paid': 'طريقة الدفع',
    'This is also added to your payments ledger and to what this client has paid.': 'تُضاف هذه الدفعة أيضًا إلى سجل المدفوعات وإلى ما دفعه هذا العميل.', 'Record payment': 'تسجيل الدفعة',
    'Choose why this subscription is cancelled.': 'اختر سبب إلغاء هذا الاشتراك.', ". The cancellation is saved with today's date and the exact time.": '. يُحفظ الإلغاء بتاريخ اليوم والوقت بدقة.',
    'Why is it cancelled?': 'لماذا أُلغي؟', 'Choose a reason': 'اختر سببًا', 'Anything worth remembering': 'أي شيء يستحق التذكر', 'What happens': 'ماذا سيحدث',
    'There is no contract to cancel.': 'لا يوجد عقد لإلغائه.', 'Payments already received are kept.': 'الدفعات المستلمة بالفعل تبقى محفوظة.', 'Keep subscription': 'إبقاء الاشتراك',
    'The client moved': 'انتقل العميل', 'Too expensive': 'مكلف جدًا', 'Not happy with the service': 'غير راضٍ عن الخدمة', 'Moved to another company': 'انتقل إلى شركة أخرى',
    'No longer needs cleaning': 'لم يعد يحتاج إلى تنظيف', 'Payment problems': 'مشاكل في الدفع',
    'Updated a subscription': 'تم تحديث اشتراك', 'Created a subscription': 'تم إنشاء اشتراك', 'Paused a subscription': 'تم إيقاف اشتراك مؤقتًا', 'Resumed a subscription': 'تم استئناف اشتراك',
    'Cancelled a subscription': 'تم إلغاء اشتراك', 'Reactivated a subscription': 'تمت إعادة تفعيل اشتراك', 'Deleted a subscription': 'تم حذف اشتراك',
    'Updated unpaid months to the current price': 'تم تحديث الأشهر غير المدفوعة إلى السعر الحالي',

    'per visit': 'للزيارة', '{} QAR per visit': m => `${m[1]} ر.ق للزيارة`,

    /* business rule: keeping a cleaner for a client */
    'Monthly and live-in plans': 'الخطط الشهرية وخطط الإقامة',
    'A cleaner on a monthly or live-in plan is kept for that client during the plan. Weekly plans only block the times of their visits.': 'يُحجز عامل النظافة في الخطة الشهرية أو خطة الإقامة لذلك العميل طوال مدة الخطة. أما الخطط الأسبوعية فتحجز أوقات زياراتها فقط.',
    'Every subscription': 'كل اشتراك', 'Any cleaner with an active subscription is kept for that client during the whole subscription.': 'أي عامل نظافة لديه اشتراك نشط يُحجز لذلك العميل طوال مدة الاشتراك.',
    'Never': 'أبدًا', 'Cleaners are never kept for a client. Only the time of each visit is checked.': 'لا يُحجز عمال النظافة لعميل. يُفحص وقت كل زيارة فقط.',
};

export default dict;
