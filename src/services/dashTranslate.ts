/**
 * Arabic for the company dashboard.
 *
 * The pages are written in English. While the dashboard is set to Arabic, this engine translates what is on the screen:
 * text, and the placeholder / title / aria-label / alt of fields and buttons. Names, numbers and anything a person typed
 * are not in the dictionary, so they stay exactly as they are. Switching back to English restores every original text.
 *
 * Dictionary entries (src/i18n/ar):
 *   'Overview': 'نظرة عامة'                        a fixed text. Letter case and spacing are ignored when matching.
 *   '{} jobs today': m => `${m[1]} ...`             a text with variable parts: each {} is a group (m[1], m[2], ...),
 *                                                    already translated when it is a known text, left alone when it is a name or a number.
 */
import { getDashLang } from './dashLang';

export type Entry = string | ((m: string[]) => string);
export type Dict = Record<string, Entry>;

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
const esc = (s: string) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');

let exact = new Map<string, Entry>();
let patterns: { re: RegExp; to: Entry; weight: number }[] = [];
let ready = false;

/** Load a dictionary (can be called several times: later entries win). */
export function installDict(dict: Dict) {
    for (const [key, to] of Object.entries(dict)) {
        if (key.includes('{}') || key.includes('{n}') || key.includes('{id}')) {
            // {} is any text, {n} is a number (it may carry a sign or a decimal point), {id} is one word such as INV-1001
            const pieces = key.split(/(\{n\}|\{id\}|\{\})/);
            const body = pieces.map(p => (p === '{n}' ? '([+-]?\\d[\\d.,]*)' : p === '{id}' ? '(\\S+)' : p === '{}' ? '(.+?)' : esc(p).replace(/\s+/g, '\\s+'))).join('');
            patterns.push({ re: new RegExp(`^${body}$`, 'i'), to, weight: key.replace(/\{(n|id)?\}/g, '').length });
        } else exact.set(collapse(key).toLowerCase(), to);
    }
    patterns.sort((a, b) => b.weight - a.weight);
    ready = true;
}

export function resetDict() { exact = new Map(); patterns = []; ready = false; }

/* ---------------------------- dates ---------------------------- */

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['أحد', 'اثن', 'ثلا', 'أرب', 'خمس', 'جمع', 'سبت'];

const monthRe = MONTH_EN.map(m => `${m}|${m.slice(0, 3)}`).join('|');
const dayRe = DAY_EN.map(d => `${d}|${d.slice(0, 3)}`).join('|');
const monthIndex = (tok: string) => MONTH_EN.findIndex(m => m.toLowerCase() === tok.toLowerCase() || m.slice(0, 3).toLowerCase() === tok.toLowerCase());
const dayIndex = (tok: string) => DAY_EN.findIndex(d => d.toLowerCase() === tok.toLowerCase() || d.slice(0, 3).toLowerCase() === tok.toLowerCase());

/** "Tue 24 Nov", "23 Nov 2026", "November 2026", "Monday": month and weekday names become Arabic. Plain words like "may" or "sun" are left alone. */
export function localizeDates(s: string): string {
    let out = s;
    // a month next to a number (a day or a year)
    out = out.replace(new RegExp(`\\b(\\d{1,2})(\\s+)(${monthRe})\\b`, 'g'), (_m, d, sp, mo) => `${d}${sp}${MONTHS[monthIndex(mo)]}`);
    out = out.replace(new RegExp(`\\b(${monthRe})(\\s+)(\\d{1,4})\\b`, 'g'), (_m, mo, sp, n) => `${MONTHS[monthIndex(mo)]}${sp}${n}`);
    // a weekday that comes before a date or a comma, or stands alone
    out = out.replace(new RegExp(`\\b(${dayRe})\\b(?=\\s*,|\\s+\\d)`, 'g'), (m) => DAYS[dayIndex(m)]);
    if (new RegExp(`^(${dayRe})$`).test(out.trim())) { const t = out.trim(); return out.replace(t, t.length > 3 ? DAYS[dayIndex(t)] : DAY_SHORT[dayIndex(t)]); }
    if (new RegExp(`^(${monthRe})$`).test(out.trim())) { const t = out.trim(); return out.replace(t, MONTHS[monthIndex(t)]); }
    return out;
}

/* --------------------------- translating --------------------------- */

const money = (s: string) => s.replace(/\bQAR\b/g, 'ر.ق');

function tr(src: string, depth = 0): string | null {
    const t = collapse(src);
    if (!t || depth > 4) return null;
    const hit = exact.get(t.toLowerCase());
    if (hit !== undefined) return money(typeof hit === 'string' ? hit : hit([t]));
    for (const p of patterns) {
        const m = p.re.exec(t);
        if (!m) continue;
        const groups = m.slice(1).map(g => tr(g, depth + 1) ?? localizeDates(g));
        const parts = [t, ...groups];
        return money(typeof p.to === 'string' ? p.to.replace(/\$(\d)/g, (_x, i) => parts[Number(i)] ?? '') : p.to(parts));
    }
    // Several sentences in one message (dialogs, errors): each sentence is translated on its own
    const sentences = t.split(/(?<=[.!?؟])\s+(?=[A-Z0-9(])/);
    if (sentences.length > 1) {
        const parts = sentences.map(s => tr(s, depth + 1));
        if (parts.every(p => p !== null)) return parts.join(' ');
    }
    const dated = localizeDates(t);
    if (dated !== t || /\bQAR\b/.test(t)) return money(dated);       // dates and amounts need no dictionary entry
    return null;
}

/** The Arabic text for an English one, or null when there is nothing to translate (names, numbers, text already in Arabic). */
export function translate(src: string): string | null {
    if (!ready || !/[A-Za-z]/.test(src)) return null;
    return tr(src);
}

/* ------------------------------ the page ------------------------------ */

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'] as const;
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'NOSCRIPT']);

const origText = new WeakMap<Text, string>();
const wroteText = new WeakMap<Text, string>();
const origAttr = new WeakMap<Element, Record<string, string>>();
const wroteAttr = new WeakMap<Element, Record<string, string>>();

function processElement(el: Element) {
    if (el.closest('[data-no-translate]') || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
    const keepText = SKIP.has(el.tagName);          // what is typed or shown as code stays as it is (its placeholder still translates)

    // Text split by React around a value ("{n} jobs" is two nodes) is one sentence; an element in between (a link, bold) starts a new one
    const runs: Text[][] = [];
    let run: Text[] = [];
    el.childNodes.forEach(n => {
        if (n.nodeType === 3) run.push(n as Text);
        else if (run.length) { runs.push(run); run = []; }
    });
    if (run.length) runs.push(run);

    for (const nodes of keepText ? [] : runs) {
        // The text as React wrote it: a node we changed ourselves goes back to its remembered original
        const origs = nodes.map(n => {
            const cur = n.nodeValue || '';
            if (wroteText.has(n) && wroteText.get(n) === cur) return origText.get(n) || '';
            origText.set(n, cur); wroteText.delete(n);
            return cur;
        });
        const src = origs.join('');
        const out = translate(src);
        if (out !== null) {
            const lead = /^\s*/.exec(src)?.[0] || '', trail = /\s*$/.exec(src)?.[0] || '';
            const full = lead + out + trail;
            const first = nodes.findIndex((_n, i) => /\S/.test(origs[i]));
            nodes.forEach((n, i) => {
                const want = i === (first < 0 ? 0 : first) ? full : '';
                if (n.nodeValue !== want) n.nodeValue = want;
                wroteText.set(n, want);
            });
        } else {
            nodes.forEach((n, i) => { if (n.nodeValue !== origs[i]) n.nodeValue = origs[i]; wroteText.delete(n); });
        }
    }

    for (const a of ATTRS) {
        const cur = el.getAttribute(a);
        if (cur === null) continue;
        // The value as React wrote it: one we changed ourselves goes back to its remembered original
        let base = cur;
        if (wroteAttr.get(el)?.[a] === cur) base = origAttr.get(el)?.[a] ?? cur;
        else origAttr.set(el, { ...origAttr.get(el), [a]: cur });
        const out = translate(base);
        if (out !== null) {
            if (cur !== out) el.setAttribute(a, out);
            wroteAttr.set(el, { ...wroteAttr.get(el), [a]: out });
        } else {
            if (cur !== base) el.setAttribute(a, base);
            wroteAttr.set(el, { ...wroteAttr.get(el), [a]: base });
        }
    }
}

function processTree(root: Node) {
    if (root.nodeType === 3) { if (root.parentElement) processElement(root.parentElement); return; }
    if (root.nodeType !== 1) return;
    processElement(root as Element);
    (root as Element).querySelectorAll('*').forEach(processElement);
}

function restoreAll() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        if (wroteText.has(n)) { const o = origText.get(n) ?? ''; if (n.nodeValue !== o) n.nodeValue = o; wroteText.delete(n); }
    }
    document.querySelectorAll('[placeholder],[title],[aria-label],[alt]').forEach(el => {
        const o = origAttr.get(el), w = wroteAttr.get(el);
        if (!o || !w) return;
        for (const a of ATTRS) if (w[a] !== undefined && el.getAttribute(a) === w[a] && o[a] !== undefined) el.setAttribute(a, o[a]);
        wroteAttr.delete(el);
    });
}

let observer: MutationObserver | null = null;
let savedDialogs: { alert: typeof window.alert; confirm: typeof window.confirm; prompt: typeof window.prompt } | null = null;

/** Start translating the whole page (and everything added to it later). Returns a function that stops and restores English. */
export function startTranslating(): () => void {
    stop();
    processTree(document.body);

    let queued: Set<Node> | null = null;
    const flush = () => {
        const work = queued; queued = null;
        if (!work || !observer) return;
        work.forEach(n => { if (n.isConnected) processTree(n); });
        observer.takeRecords();                                  // what we just wrote is not news
    };
    observer = new MutationObserver(records => {
        if (!queued) { queued = new Set(); queueMicrotask(flush); }
        for (const r of records) {
            if (r.type === 'characterData') { if (r.target.parentElement) queued.add(r.target.parentElement); }
            else if (r.type === 'attributes') queued.add(r.target);
            else { queued.add(r.target); r.addedNodes.forEach(n => queued!.add(n)); }
        }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });

    // The browser's own dialogs (confirm, alert) are English strings from the code too
    savedDialogs = { alert: window.alert, confirm: window.confirm, prompt: window.prompt };
    const say = (m?: unknown) => (typeof m === 'string' ? translate(m) ?? m : m);
    window.alert = (m?: unknown) => savedDialogs!.alert.call(window, say(m) as string);
    window.confirm = (m?: string) => savedDialogs!.confirm.call(window, say(m) as string);
    window.prompt = (m?: string, d?: string) => savedDialogs!.prompt.call(window, say(m) as string, d);
    return stop;
}

function stop() {
    if (observer) { observer.disconnect(); observer = null; restoreAll(); }
    if (savedDialogs) { window.alert = savedDialogs.alert; window.confirm = savedDialogs.confirm; window.prompt = savedDialogs.prompt; savedDialogs = null; }
}

export const dashIsArabic = () => getDashLang() === 'ar';
