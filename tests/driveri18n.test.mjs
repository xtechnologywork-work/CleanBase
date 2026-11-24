// Tests the English and Arabic texts of the driver app with the real code (compiled by esbuild).
//   Run:  npm run test:driveri18n
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve('.');
const tmp = mkdtempSync(join(tmpdir(), 'cb-di18n-'));
const load = async (file) => {
    const out = await build({ entryPoints: [join(root, 'src/services', file)], bundle: true, format: 'esm', platform: 'node', write: false, outdir: tmp, logLevel: 'silent' });
    for (const f of out.outputFiles) writeFileSync(f.path, f.text);
    return import(pathToFileURL(join(tmp, file.replace('.ts', '.js'))).href);
};
const D = await load('driverI18n.ts');
const T = await load('trips.ts');

const ARABIC = /[؀-ۿ]/;
const LATIN = /[A-Za-z]/;
const NAMES = ['Maria', 'Joy', 'Sara Client'];

/** Every text the screen can show in one language, with sample names filled in. */
function allTexts(lang) {
    const S = D.DRIVER_STRINGS[lang];
    const out = [];
    for (const [k, v] of Object.entries(S)) {
        if (typeof v === 'string') out.push([k, v]);
        else if (typeof v === 'function') {
            const args = v.length === 0 ? [] : Array.from({ length: v.length }, (_, i) => (k === 'noRidesTitle' ? i === 0 && false : k === 'stepAria' || k === 'goingToPickUpMany' ? 3 : NAMES[i]));
            out.push([k, String(v(...args))]);
            if (k === 'noRidesTitle') out.push([`${k}:tomorrow`, v(true)]);
        } else for (const [s, st] of Object.entries(v)) for (const [f, text] of Object.entries(st)) out.push([`stages.${s}.${f}`, text]);
    }
    return out;
}

test('English and Arabic have exactly the same texts', () => {
    const shape = (o) => Object.entries(o).map(([k, v]) => typeof v === 'object' ? `${k}{${Object.keys(v).join(',')}}` : `${k}:${typeof v}${typeof v === 'function' ? v.length : ''}`).sort();
    assert.deepEqual(shape(D.DRIVER_STRINGS.ar), shape(D.DRIVER_STRINGS.en));
});

test('no text is empty (except the first step, which has no button), none has a leftover placeholder', () => {
    for (const lang of ['en', 'ar']) for (const [k, text] of allTexts(lang)) {
        if (k === 'stages.scheduled.action') continue;
        assert.ok(text.trim().length > 0, `${lang} ${k} is empty`);
        assert.ok(!/[{}]|undefined|null|NaN/.test(text), `${lang} ${k}: "${text}"`);
    }
});

test('Arabic is real Arabic: every text has Arabic letters, and Latin letters only come from names or the English button', () => {
    for (const [k, text] of allTexts('ar')) {
        if (k === 'stages.scheduled.action' || k === 'langButton') continue;
        assert.ok(ARABIC.test(text), `ar ${k} has no Arabic: "${text}"`);
        const withoutNames = NAMES.reduce((t, n) => t.split(n).join(''), text);
        assert.ok(!LATIN.test(withoutNames), `ar ${k} still has English words: "${withoutNames}"`);
    }
    assert.equal(D.DRIVER_STRINGS.ar.langButton, 'English');
    assert.equal(D.DRIVER_STRINGS.en.langButton, 'العربية');
});

test('English has no Arabic letters', () => {
    for (const [k, text] of allTexts('en')) if (k !== 'langButton') assert.ok(!ARABIC.test(text), `en ${k}: "${text}"`);
});

test('all seven steps have a label, a short word and a button text in both languages', () => {
    for (const lang of ['en', 'ar']) for (const stage of T.TRIP_STAGES) {
        const s = D.DRIVER_STRINGS[lang].stages[stage];
        assert.ok(s && s.label && s.short, `${lang} ${stage}`);
        if (stage !== 'scheduled') assert.ok(s.action, `${lang} ${stage} action`);
    }
});

test('Arabic sentences use the right wording', () => {
    const ar = D.DRIVER_STRINGS.ar;
    assert.equal(ar.pickUp('X'), 'استلام X');
    assert.equal(ar.stages.returned.action, 'وصلنا إلى السكن');
    assert.equal(ar.goingToPickUpMany(2), 'أنا في الطريق لاستلام عاملتين');
    assert.equal(ar.goingToPickUpMany(3), 'أنا في الطريق لاستلام 3 عاملات');
    assert.equal(ar.goingToPickUpMany(12), 'أنا في الطريق لاستلام 12 عاملة');
    assert.equal(ar.noRidesTitle(true), 'لا توجد رحلات غداً');
    assert.equal(ar.undoStep('تمت'), 'التراجع عن «تمت»');
});

test('lateness is spoken correctly in both languages', () => {
    assert.equal(D.lateLabel(1, 'en'), '1 min');
    assert.equal(D.lateLabel(65, 'en'), '1h 05m');
    assert.equal(D.lateLabel(2000, 'en'), 'a day');
    assert.equal(D.lateLabel(1, 'ar'), 'دقيقة');
    assert.equal(D.lateLabel(2, 'ar'), 'دقيقتان');
    assert.equal(D.lateLabel(7, 'ar'), '7 دقائق');
    assert.equal(D.lateLabel(20, 'ar'), '20 دقيقة');
    assert.equal(D.lateLabel(60, 'ar'), 'ساعة');
    assert.equal(D.lateLabel(120, 'ar'), 'ساعتان');
    assert.equal(D.lateLabel(185, 'ar'), '3 ساعات و5 دقائق');
    assert.equal(D.lateLabel(710, 'ar'), '11 ساعة و50 دقيقة');
    assert.equal(D.lateLabel(1500, 'ar'), 'يوم');
});

test('lists of names: "and" in English, "و" in Arabic, names kept apart from the sentence', () => {
    assert.equal(D.listNames(['Maria'], 'en'), 'Maria');
    assert.equal(D.listNames(['Maria', 'Joy'], 'en'), 'Maria and Joy');
    assert.equal(D.listNames(['Maria', 'Joy', 'Sara'], 'en'), 'Maria, Joy and Sara');
    const ar = D.listNames(['Maria', 'Joy'], 'ar');
    assert.ok(ar.includes('Maria') && ar.includes('Joy') && ar.includes(' و'));
    assert.ok(ar.startsWith('⁨Maria⁩'), 'name isolated');
    assert.equal(D.isolate('Maria', 'en'), 'Maria');
});
