import type { Dict } from '../../services/dashTranslate';
import { cnt, days, invoices } from './util';

/** Invoices and payments, expenses, leads, quotes and promotions. */
const dict: Dict = {
    /* invoices */
    'Bill clients, record what they pay, and see who still owes you.': 'فوتِر العملاء وسجّل ما يدفعونه وتعرّف على من لا يزال مدينًا لك.',
    'New invoice': 'فاتورة جديدة', 'Open balance': 'الرصيد المفتوح', 'Invoices issued': 'الفواتير الصادرة', 'Payments ledger': 'سجل المدفوعات',
    '{n} unpaid invoices': m => `${invoices(m[1])} غير مدفوعة`, '{n} unpaid invoice': m => `${invoices(m[1])} غير مدفوعة`, '{n} invoice past due': m => `${invoices(m[1])} متأخرة`, '{n} invoices past due': m => `${invoices(m[1])} متأخرة`, '{n} fully paid': m => `${m[1]} مدفوعة بالكامل`,
    'Search client or number': 'ابحث بالعميل أو الرقم', 'No invoices yet. Create one from completed jobs.': 'لا توجد فواتير بعد. أنشئ واحدة من المهام المكتملة.',
    'Unknown': 'غير معروف', 'Balance': 'الرصيد', 'Marked invoice as sent': 'تم تعليم فاتورة كمُرسلة', 'Cancel this invoice?': 'هل تريد إلغاء هذه الفاتورة؟',
    'Cancelled invoice': 'تم إلغاء فاتورة', 'Cancel invoice': 'إلغاء الفاتورة', 'Invoice {id}': m => `فاتورة ${m[1]}`,
    'Issued {} · Due {}': m => `صدرت في ${m[1]} · تستحق في ${m[2]}`, '· Due {}': m => `· الاستحقاق ${m[1]}`, '· Due': '· الاستحقاق',
    'Qty': 'الكمية', 'Subtotal': 'المجموع الفرعي', 'Discount': 'الخصم', 'Tax': 'الضريبة', 'Tax ID': 'الرقم الضريبي',
    'Record a payment or refund': 'تسجيل دفعة أو استرداد', 'Method': 'الطريقة', 'Reference': 'المرجع', 'Receipt or transfer no.': 'رقم الإيصال أو التحويل',
    'Enter an amount above zero.': 'أدخل مبلغًا أكبر من صفر.', 'Enter a refund amount up to what was paid.': 'أدخل مبلغ استرداد لا يتجاوز ما تم دفعه.', 'Refund': 'استرداد',
    'That is more than the balance of {} QAR. Enter the balance or less.': m => `هذا أكبر من الرصيد البالغ ${m[1]} ر.ق. أدخل الرصيد أو أقل.`,
    'This is a draft. Mark it as sent to start recording payments.': 'هذه مسودة. علّمها كمُرسلة لتبدأ بتسجيل الدفعات.',
    'All payments': 'كل الدفعات', 'No payments recorded yet.': 'لا توجد دفعات مسجلة بعد.', 'Invoice or contract': 'الفاتورة أو العقد',
    'Choose a client.': 'اختر عميلًا.', 'Add at least one job or line item.': 'أضف مهمة أو بندًا واحدًا على الأقل.', 'Save as draft': 'حفظ كمسودة', 'Create and send': 'إنشاء وإرسال',
    'Completed jobs not yet invoiced': 'مهام مكتملة لم تُفوتر بعد',
    'No uninvoiced completed jobs for this client. Add a custom line below.': 'لا توجد مهام مكتملة غير مفوترة لهذا العميل. أضف بندًا مخصصًا أدناه.',
    'Custom lines': 'بنود مخصصة', 'Add line': 'إضافة بند', 'Promo code': 'رمز ترويجي', 'Code not valid': 'الرمز غير صالح', 'Due date': 'تاريخ الاستحقاق',
    'Default: {} days from today': m => `الافتراضي: بعد ${days(m[1])} من اليوم`,
    'This client has no valid phone number saved.': 'لا يوجد رقم هاتف صالح محفوظ لهذا العميل.',

    /* expenses */
    'Everything the business spends. Payroll you mark as paid shows up here automatically.': 'كل ما ينفقه العمل. الرواتب التي تعلّمها كمدفوعة تظهر هنا تلقائيًا.',
    'Category': 'الفئة', 'Vendor or payee': 'المورّد أو المستفيد', 'Vendor': 'المورّد', 'Largest category': 'أكبر فئة', 'Entries': 'القيود', 'Average per entry': 'المتوسط لكل قيد',
    'All expenses': 'كل المصروفات', 'Add expense': 'إضافة مصروف', 'Supplies': 'المستلزمات', 'No expenses in this month.': 'لا توجد مصروفات في هذا الشهر.',
    'Added': 'تمت الإضافة', 'Deleted': 'تم الحذف', 'Edited': 'تم التعديل', 'By category': 'حسب الفئة', 'No spending yet.': 'لا يوجد إنفاق بعد.',
    'Added expense': 'تمت إضافة مصروف', 'Edited expense': 'تم تعديل مصروف', 'Deleted expense': 'تم حذف مصروف',

    /* leads */
    'Leads, quotes and promotions': 'العملاء المحتملون وعروض الأسعار والعروض الترويجية',
    'Turn enquiries into booked work and see what each channel is worth.': 'حوّل الاستفسارات إلى حجوزات وتعرّف على قيمة كل قناة.',
    'Leads': 'العملاء المحتملون', 'Quotes': 'عروض الأسعار', 'Promotions': 'العروض الترويجية', 'Source': 'المصدر', 'Website': 'الموقع الإلكتروني', 'Referral': 'إحالة', 'Walk-in': 'زيارة مباشرة',
    'Interested in': 'مهتم بـ', 'A client with this name already exists.': 'يوجد عميل بهذا الاسم بالفعل.', 'Converted lead to client': 'تم تحويل عميل محتمل إلى عميل',
    'Open leads': 'عملاء محتملون مفتوحون', 'Won': 'تم كسبه', 'Lost': 'خسرناه', 'Conversion rate': 'معدل التحويل', 'Won out of closed leads': 'المكسوب من الحالات المغلقة',
    'Add lead': 'إضافة عميل محتمل', 'Move back': 'إرجاع', 'Move forward': 'تقديم', 'Make client': 'تحويل إلى عميل', 'Conversion by source': 'التحويل حسب المصدر',
    '{n} leads ·': m => `${cnt(m[1], 'عميل محتمل واحد', 'عميلان محتملان', 'عملاء محتملون', 'عميلًا محتملًا')} ·`, '{n} won ·': m => `${m[1]} مكسوب ·`,
    'To remove a lead, move it to Lost, or': 'لإزالة عميل محتمل، انقله إلى «خسرناه»، أو',
    'Moved lead to {}': m => `تم نقل العميل المحتمل إلى ${m[1]}`, '{} is now a client.': m => `أصبح ${m[1]} عميلًا.`,

    /* quotes */
    'Open quotes': 'عروض أسعار مفتوحة', 'Acceptance rate': 'معدل القبول', 'New quote': 'عرض سعر جديد', 'Quote': 'عرض السعر', 'Quote {id}': m => `عرض سعر ${m[1]}`,
    'Customer': 'العميل', 'Valid until': 'صالح حتى', 'Mark sent': 'تعليم كمُرسل', 'Accept and book': 'قبول وحجز', 'Print quote': 'طباعة عرض السعر',
    'Accept quote and create booking': 'قبول عرض السعر وإنشاء حجز', 'A client named': 'يُنشأ عميل باسم',
    'is created if none exists. The booking starts as confirmed with no cleaner.': 'إن لم يكن موجودًا. يبدأ الحجز مؤكدًا وبلا عامل نظافة.',
    'Add a customer name and at least one line.': 'أضف اسم العميل وبندًا واحدًا على الأقل.', 'Save quote': 'حفظ عرض السعر', 'Customer name': 'اسم العميل', 'Lines': 'البنود',
    'Add a service line': 'إضافة بند خدمة', 'Custom line': 'بند مخصص',

    /* promotions */
    'Code': 'الرمز', 'Percent off': 'خصم بنسبة مئوية', 'Fixed amount off': 'خصم بمبلغ ثابت', 'Value': 'القيمة', 'Maximum uses': 'الحد الأقصى للاستخدام', 'Expires': 'ينتهي',
    'Referral from client (optional)': 'إحالة من عميل (اختياري)', 'Link a code to the client who shared it to track referrals': 'اربط الرمز بالعميل الذي شاركه لتتبع الإحالات',
    'Promo and referral codes': 'رموز العروض والإحالات', 'Apply a code when you create an invoice. Each use is counted.': 'طبّق رمزًا عند إنشاء فاتورة. يُحسب كل استخدام.',
    'Add promo code': 'إضافة رمز ترويجي', 'Used': 'المستخدم', 'Referrer': 'المُحيل', 'Live': 'فعّال', 'Off': 'متوقف',
};

export default dict;
