import type { Dict } from '../../services/dashTranslate';

/** Clients, the client profile and the cleaners page. */
const dict: Dict = {
    /* clients list */
    'Client Directory': 'دليل العملاء',
    'Manage customer accounts, service locations, active subscriptions, and assigned staff.': 'إدارة حسابات العملاء ومواقع الخدمة والاشتراكات النشطة والموظفين المعيّنين.',
    'Add Client': 'إضافة عميل', 'Total Registered Clients': 'إجمالي العملاء المسجلين', 'Aggregate Customer Spend': 'إجمالي إنفاق العملاء',
    'Average Client LTV': 'متوسط القيمة الإجمالية للعميل',
    'Search clients by name, phone, or address...': 'ابحث عن العملاء بالاسم أو الهاتف أو العنوان...',
    'No matching clients': 'لا يوجد عملاء مطابقون', 'Try adjusting your search criteria.': 'جرّب تعديل معايير البحث.',
    'Add your first client to start recording bookings.': 'أضف أول عميل لتبدأ بتسجيل الحجوزات.',
    'Open full profile': 'فتح الملف الكامل', 'Joined': 'تاريخ الانضمام', 'Active Plan': 'الخطة النشطة', 'Assigned': 'المعيّن',
    'Cleaner: Unassigned': 'عامل النظافة: غير معيّن', 'No active recurring subscription': 'لا يوجد اشتراك متكرر نشط',
    'Register New Client': 'تسجيل عميل جديد', 'Save client contact details for booking dispatches.': 'احفظ بيانات الاتصال بالعميل لتوزيع الحجوزات.',
    'Full Name': 'الاسم الكامل', 'Primary Address / Residence': 'العنوان الرئيسي / السكن', 'Create Client': 'إنشاء العميل',
    'This action is permanent and cannot be undone.': 'هذا الإجراء نهائي ولا يمكن التراجع عنه.',
    'Deleting this client will remove their profile. Associated past bookings will retain their records but lose active profile referencing.': 'حذف هذا العميل سيزيل ملفه. ستحتفظ الحجوزات السابقة المرتبطة بسجلاتها لكنها ستفقد ارتباطها بالملف.',
    'Type': 'النوع', 'Enter the client name.': 'أدخل اسم العميل.',
    '{} already has this phone number. Save as a separate client anyway?': m => `هذا الرقم مسجّل لدى ${m[1]} بالفعل. هل تريد الحفظ كعميل منفصل على أي حال؟`,

    /* client profile */
    'Client not found.': 'لم يُعثر على العميل.', 'Back to clients': 'العودة إلى العملاء', 'Call': 'اتصال', 'Lifetime value': 'القيمة الإجمالية للعميل',
    'Owes you': 'مستحق لك', 'Books every': 'يحجز كل', 'No jobs yet': 'لا توجد مهام بعد', 'Next visit': 'الزيارة القادمة', 'Nothing scheduled': 'لا شيء مجدول',
    'Job history': 'سجل المهام', 'Properties': 'العقارات', 'Notes and preferences': 'الملاحظات والتفضيلات', 'No invoices for this client.': 'لا توجد فواتير لهذا العميل.',
    'Invoice': 'الفاتورة', 'Issued': 'تاريخ الإصدار', 'Total': 'الإجمالي',
    'Clients with more than one address, such as a home and an office': 'عملاء لديهم أكثر من عنوان، مثل المنزل والمكتب',
    'Remove property': 'إزالة العقار', 'Label': 'التسمية', 'Home, Office, Villa': 'منزل، مكتب، فيلا', 'Access notes': 'ملاحظات الدخول',
    'Gate code, parking, pets': 'رمز البوابة، المواقف، الحيوانات الأليفة', 'Add property': 'إضافة عقار', 'Preferred cleaner': 'عامل النظافة المفضل',
    'No preference': 'بلا تفضيل', 'Tags': 'الوسوم', 'Comma separated, for example VIP, weekly': 'افصل بفاصلة، مثال: VIP، أسبوعي', 'Notes': 'الملاحظات',
    'Products to avoid, special requests, anything the team should know': 'منتجات يجب تجنبها، طلبات خاصة، أي شيء يجب أن يعرفه الفريق',
    'Complaints from this client': 'شكاوى هذا العميل', 'Last job {}': m => `آخر مهمة ${m[1]}`,
    'Lifetime Spend': 'إجمالي الإنفاق', 'Client Account #': 'رقم حساب العميل', '• Registered': '• تاريخ التسجيل', '• Registered {}': m => `• تاريخ التسجيل ${m[1]}`,
    'Client Contact & Address': 'بيانات الاتصال والعنوان', 'Account Financials': 'الحالة المالية للحساب', 'Total paid by this client': 'إجمالي ما دفعه هذا العميل',
    'Recurring Subscriptions & Cleaner Assignments': 'الاشتراكات المتكررة وتكليفات عمال النظافة', 'Manage in Subscriptions →': 'إدارة العقود ←',
    'No active contracts for this client': 'لا توجد عقود نشطة لهذا العميل',
    'Set up an ongoing weekly, monthly, or live-in cleaning contract.': 'أنشئ عقد تنظيف مستمرًا أسبوعيًا أو شهريًا أو بنظام الإقامة.',
    'Create Subscription': 'إنشاء اشتراك', 'Contract #': 'رقم العقد', '• Cadence:': '• التكرار:', 'Assigned Cleaner': 'عامل النظافة المعيّن',
    'Contract Timeline': 'الجدول الزمني للعقد', 'Started:': 'بدأ في:', '• Active': '• نشط', '• Ends: {}': m => `• ينتهي: ${m[1]}`,
    'Recent Booking History': 'سجل الحجوزات الأخيرة', 'No one-off bookings logged for this client yet.': 'لا توجد حجوزات منفردة مسجلة لهذا العميل بعد.',
    'Close Profile': 'إغلاق الملف',

    /* cleaners */
    'Field Operations & Cleaners': 'العمليات الميدانية وعمال النظافة',
    'Monitor cleaner dispatch availability, workload metrics, assigned recurring contracts, and job performance.': 'تابع توفر عمال النظافة ومؤشرات حجم العمل والعقود المتكررة المعيّنة وأداء المهام.',
    'Add Cleaner': 'إضافة عامل نظافة', 'Top Performer': 'الأفضل أداءً', 'Jobs (30D)': 'المهام (30 يومًا)', 'Volume Delivered': 'قيمة المنجز',
    'Search cleaners by name or nationality...': 'ابحث عن عمال النظافة بالاسم أو الجنسية...', 'No cleaners found': 'لم يُعثر على عمال نظافة',
    'Add cleaners to start dispatching jobs and managing individual schedules.': 'أضف عمال نظافة لتبدأ بتوزيع المهام وإدارة جداولهم.',
    'Watch video': 'مشاهدة الفيديو', 'Video': 'فيديو', 'Documents ({})': m => `المستندات (${m[1]})`, '· expired': '· منتهية', '· expiring soon': '· تنتهي قريبًا',
    'Assigned Subscriptions': 'الاشتراكات المعيّنة', 'No recurring contracts assigned': 'لا توجد عقود متكررة معيّنة',
    'Total Hours': 'إجمالي الساعات', '7 Days': '7 أيام', '30 Days': '30 يومًا',
    'Onboard Cleaner': 'تسجيل عامل نظافة جديد', 'Assign staff member to job scheduling, contracts, and tracking.': 'أضف موظفًا لجدولة المهام والعقود والمتابعة.',
    'Upload preview': 'معاينة الرفع', 'Upload photo (optional)': 'رفع صورة (اختياري)', 'Age': 'العمر', 'Nationality': 'الجنسية', 'Accommodation': 'السكن',
    'Not set': 'غير محدد', 'Add accommodations in Zones and supplies first': 'أضف أماكن السكن في المناطق والمستلزمات أولًا',
    'Introduction video (optional)': 'فيديو تعريفي (اختياري)',
};

export default dict;
