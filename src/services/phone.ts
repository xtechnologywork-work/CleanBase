/** Contact numbers at sign up. The country code (+974, Qatar) is fixed, so the person only types the local number. */
export const COUNTRY_CODE = '+974';
export const LOCAL_DIGITS = 8;

/** Keep only the local digits: the person may paste "+974 5170 4550", "00974 51704550" or "5170 4550". */
export function localDigits(input: string): string {
    let d = (input || '').replace(/\D/g, '');
    if (d.startsWith('00974')) d = d.slice(5);
    else if (d.startsWith('974') && d.length > LOCAL_DIGITS) d = d.slice(3);
    return d.slice(0, LOCAL_DIGITS);
}

/** "51704550" shown as "5170 4550" while typing. */
export const formatLocal = (digits: string): string => (digits.length > 4 ? `${digits.slice(0, 4)} ${digits.slice(4)}` : digits);

/** The full number to save ("+97451704550"), or null when it is not a complete number. */
export function fullPhone(input: string): string | null {
    const d = localDigits(input);
    return d.length === LOCAL_DIGITS ? `${COUNTRY_CODE}${d}` : null;
}
