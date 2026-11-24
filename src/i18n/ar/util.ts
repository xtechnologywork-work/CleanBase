/** Arabic counting: 1 and 2 have their own forms, 3 to 10 take the plural, 11 and above take the singular. */
const num = (n: string | number) => Number(String(n).replace(/[,\s]/g, ''));

/** A number with its noun: cnt(5, 'مهمة واحدة', 'مهمتان', 'مهام', 'مهمة') gives "5 مهام". */
export function cnt(n: string | number, one: string, two: string, few: string, many: string = few): string {
    const v = num(n);
    if (!Number.isFinite(v)) return `${n} ${many}`;
    if (v === 1) return one;
    if (v === 2) return two;
    if (v === 0) return `${n} ${few}`;
    const r = v % 100;
    return `${n} ${r >= 3 && r <= 10 ? few : many}`;
}

/** Only the noun form for a number (no number written): for sentences where the number is placed separately. */
export function noun(n: string | number, one: string, two: string, few: string, many: string = few): string {
    const v = num(n);
    if (!Number.isFinite(v)) return many;
    if (v === 1) return one;
    if (v === 2) return two;
    if (v === 0) return few;
    const r = v % 100;
    return r >= 3 && r <= 10 ? few : many;
}

/** Keeps a number (with a sign or a percent sign) readable inside right-to-left text. */
export const ltr = (s: string | number) => `⁦${s}⁩`;

/* The nouns the dashboard counts most */
export const jobs = (n: string | number) => cnt(n, 'مهمة واحدة', 'مهمتان', 'مهام', 'مهمة');
export const days = (n: string | number) => cnt(n, 'يوم واحد', 'يومان', 'أيام', 'يومًا');
export const hours = (n: string | number) => cnt(n, 'ساعة واحدة', 'ساعتان', 'ساعات', 'ساعة');
export const minutes = (n: string | number) => cnt(n, 'دقيقة واحدة', 'دقيقتان', 'دقائق', 'دقيقة');
export const clients = (n: string | number) => cnt(n, 'عميل واحد', 'عميلان', 'عملاء', 'عميلًا');
export const bookings = (n: string | number) => cnt(n, 'حجز واحد', 'حجزان', 'حجوزات', 'حجزًا');
export const invoices = (n: string | number) => cnt(n, 'فاتورة واحدة', 'فاتورتان', 'فواتير', 'فاتورة');
export const cleaners = (n: string | number) => cnt(n, 'عامل نظافة واحد', 'عاملا نظافة', 'عمال نظافة', 'عامل نظافة');
export const visits = (n: string | number) => cnt(n, 'زيارة واحدة', 'زيارتان', 'زيارات', 'زيارة');
export const items = (n: string | number) => cnt(n, 'عنصر واحد', 'عنصران', 'عناصر', 'عنصرًا');
export const records = (n: string | number) => cnt(n, 'سجل واحد', 'سجلان', 'سجلات', 'سجلًا');
export const reviews = (n: string | number) => cnt(n, 'تقييم واحد', 'تقييمان', 'تقييمات', 'تقييمًا');
export const contracts = (n: string | number) => cnt(n, 'عقد واحد', 'عقدان', 'عقود', 'عقدًا');
export const people = (n: string | number) => cnt(n, 'شخص واحد', 'شخصان', 'أشخاص', 'شخصًا');
export const weeks = (n: string | number) => cnt(n, 'أسبوع واحد', 'أسبوعان', 'أسابيع', 'أسبوعًا');
export const months = (n: string | number) => cnt(n, 'شهر واحد', 'شهران', 'أشهر', 'شهرًا');
export const times = (n: string | number) => cnt(n, 'مرة واحدة', 'مرتان', 'مرات', 'مرة');
