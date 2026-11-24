// Tests the WhatsApp client messages (English + Arabic) with the real code (compiled by esbuild).
//   Run:  npm run test:messages
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve('.');
const tmp = mkdtempSync(join(tmpdir(), 'cb-msg-'));
const out = await build({ entryPoints: [join(root, 'src/services/bookingMessages.ts')], bundle: true, format: 'esm', platform: 'node', write: false, outdir: tmp, logLevel: 'silent' });
for (const f of out.outputFiles) writeFileSync(f.path, f.text);
const M = await import(pathToFileURL(join(tmp, 'bookingMessages.js')).href);

const v = { name: 'Sara', service: '5h cleaning', date: '2026-11-20', time: '09:30', cleaner: 'Maria', company: 'Al Ishara', address: 'Doha, Villa 68' };
const AR = /[؀-ۿ]/;
const FSI = '⁨', PDI = '⁩', RLM = '‏';

test('dates and times: English and Arabic', () => {
    assert.equal(M.formatDate('2026-11-20', false), '20 Nov 2026');
    assert.equal(M.formatDate('2026-11-20', true), '20 نوفمبر 2026');
    assert.equal(M.formatDate('2026-01-05', true), '5 يناير 2026');
    assert.equal(M.formatTime('09:30', false), '9:30 AM');
    assert.equal(M.formatTime('09:30', true), '9:30 ص');
    assert.equal(M.formatTime('00:05', false), '12:05 AM');
    assert.equal(M.formatTime('12:00', false), '12:00 PM');
    assert.equal(M.formatTime('18:45', true), '6:45 م');
});

test('every default template fills completely, in both languages, with emojis', () => {
    const full = { ...v, number: 'INV-1002', amount: 120, currency: 'QAR', due: '2026-11-27', link: 'https://x.test/book?c=1', reason: 'Fully booked at that time', reasonAr: M.reasonArabic('Fully booked at that time') };
    for (const k of M.TEMPLATE_KEYS) {
        const text = M.renderMessage(M.DEFAULT_TEMPLATES[k], full);
        assert.ok(!/[{}]/.test(text), `${k}: unfilled placeholder in\n${text}`);
        assert.ok(AR.test(text), `${k}: no Arabic part`);
        assert.ok(/[A-Za-z]/.test(text), `${k}: no English part`);
        assert.ok(/\p{Extended_Pictographic}/u.test(text), `${k}: no emoji`);
        assert.ok(text.includes('Sara'), `${k}: name missing`);
        assert.ok(!text.includes('\n\n\n'), `${k}: too many blank lines`);
    }
});

test('Arabic lines: Arabic date, time and currency, names isolated, right-to-left mark', () => {
    const t = M.renderMessage(M.DEFAULT_TEMPLATES.tplInvoice, { ...v, number: 'INV-1002', amount: 120, currency: 'QAR', due: '2026-11-27' });
    const [en, ar] = t.split('──────────');
    assert.match(en, /Invoice INV-1002 for 120\.00 QAR is ready/);
    assert.match(en, /Due: 27 Nov 2026/);
    assert.match(ar, /120\.00 ر\.ق/);
    assert.match(ar, /27 نوفمبر 2026/);
    assert.ok(ar.includes(`${FSI}Sara${PDI}`), 'name must be isolated inside the Arabic text');
    ar.trim().split('\n').filter(Boolean).forEach(line => assert.ok(line.startsWith(RLM), `Arabic line without RLM: ${line}`));
    assert.ok(!en.includes(FSI) && !en.includes(RLM), 'the English part has no direction marks');
});

test('confirmation shows the Arabic time with ص/م and the English time with AM/PM', () => {
    const t = M.statusMessage('confirmed', M.withTemplates({}), v);
    assert.match(t, /Time: 9:30 AM/);
    assert.match(t, /الوقت: .*9:30 ص/);
});

test('lines with only empty placeholders are removed (no address, no cleaner)', () => {
    const t = M.statusMessage('in_progress', M.withTemplates({}), { ...v, cleaner: '' });
    assert.ok(!/Your cleaner/.test(t));
    assert.ok(!/عامل النظافة:/.test(t));
    const t2 = M.statusMessage('confirmed', M.withTemplates({}), { ...v, address: '' });
    assert.ok(!/Address/.test(t2) && !/العنوان/.test(t2));
});

test('each status has its own button and its own message', () => {
    const tpl = M.withTemplates({});
    const statuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
    assert.equal(new Set(statuses.map(s => M.STATUS_BUTTON[s])).size, 5);
    assert.equal(new Set(statuses.map(s => M.statusMessage(s, tpl, v))).size, 5);
});

test('a company that wrote its own bilingual template keeps it, and it renders in order', () => {
    const own = 'Hello {name}, your {service} is booked for {date} at {time}. See you then!\n-----\nمرحباً {name}، تم حجز {service} الخاص بك ليوم {date} في تمام الساعة {time}. نراك حينها!';
    const tpl = M.withTemplates({ tplConfirmation: own });
    assert.equal(tpl.tplConfirmation, own);
    const lines = M.renderMessage(own, v).split('\n');
    assert.equal(lines.length, 3);
    assert.equal(lines[0], 'Hello Sara, your 5h cleaning is booked for 20 Nov 2026 at 9:30 AM. See you then!');
    assert.equal(lines[1], '-----');
    assert.ok(lines[2].startsWith(RLM) && lines[2].includes('20 نوفمبر 2026') && lines[2].includes('9:30 ص'));
});

test('old English-only defaults are upgraded, missing ones are filled', () => {
    const tpl = M.withTemplates({ tplConfirmation: 'Hello {name}, your {service} is booked for {date} at {time}. See you then!', tplReminder: '' });
    assert.equal(tpl.tplConfirmation, M.DEFAULT_TEMPLATES.tplConfirmation);
    assert.equal(tpl.tplReminder, M.DEFAULT_TEMPLATES.tplReminder);
    assert.equal(tpl.tplCancelled, M.DEFAULT_TEMPLATES.tplCancelled);
});

test('declined message: the reason is also given in Arabic', () => {
    assert.equal(M.reasonArabic('Fully booked at that time'), 'الجدول ممتلئ في ذلك الوقت');
    assert.equal(M.reasonArabic('Cleaner not available. Sorry, she is ill'), 'عامل النظافة غير متاح. Sorry, she is ill');
    assert.equal(M.reasonArabic('We are closed on Friday'), 'We are closed on Friday');
    const t = M.renderMessage(M.DEFAULT_TEMPLATES.tplDeclined, { ...v, link: 'https://x.test/b', reason: 'Fully booked at that time', reasonAr: M.reasonArabic('Fully booked at that time') });
    assert.match(t, /Reason: Fully booked at that time/);
    assert.match(t, /السبب: .*الجدول ممتلئ في ذلك الوقت/);
});

test('unknown placeholders stay, repeated ones are all filled, empty service falls back', () => {
    assert.equal(M.renderMessage('{name} {name} {nope}', v), 'Sara Sara {nope}');
    assert.match(M.renderMessage('Your {service} is booked', { ...v, service: '' }), /Your cleaning is booked/);
    assert.match(M.renderMessage('تم حجز {service}', { ...v, service: '' }), /التنظيف/);
});

test('booking link message is bilingual', () => {
    const t = M.bookingLinkMessage('Al Ishara', 'https://x.test/book?c=1');
    assert.match(t, /Book your cleaning with .*Al Ishara/);
    assert.match(t, /احجز خدمة التنظيف/);
    assert.ok(t.includes('https://x.test/book?c=1'));
});

test('phone numbers: local Qatar numbers get 974, bad ones are rejected', () => {
    assert.equal(M.whatsappDigits('+974 3330 4550'), '97433304550');
    assert.equal(M.whatsappDigits('33304550'), '97433304550');
    assert.equal(M.whatsappDigits('+974 '), '');
    assert.equal(M.whatsappDigits('123'), '');
    assert.equal(M.whatsappDigits('+44 7911 123456'), '447911123456');
});

test('the WhatsApp link keeps line breaks and emojis', () => {
    for (const mobile of [true, false]) {
        const u = M.whatsappUrl('97433304550', 'Hello ✅\nBye & co', mobile);
        assert.ok(u.includes('%0A'), 'line break must be encoded');
        assert.equal(decodeURIComponent(u.split('text=')[1]), 'Hello ✅\nBye & co');
    }
});

test('computers open the WhatsApp Web chat directly, phones open the app link', () => {
    assert.equal(M.whatsappUrl('97433304550', 'Hi', true), 'https://wa.me/97433304550?text=Hi');
    assert.equal(M.whatsappUrl('97433304550', 'Hi', false), 'https://web.whatsapp.com/send?phone=97433304550&text=Hi');
    assert.equal(M.whatsappShareUrl('Hi', true), 'https://wa.me/?text=Hi');
    assert.equal(M.whatsappShareUrl('Hi', false), 'https://web.whatsapp.com/send?text=Hi');
});
