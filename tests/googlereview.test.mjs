// Tests the Google review link check and the review message with the real code (compiled by esbuild).
//   Run:  npm run test:google
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve('.');
const tmp = mkdtempSync(join(tmpdir(), 'cb-gr-'));
const load = async (file) => {
    const out = await build({ entryPoints: [join(root, 'src/services', file)], bundle: true, format: 'esm', platform: 'node', write: false, outdir: tmp, logLevel: 'silent' });
    for (const f of out.outputFiles) writeFileSync(f.path, f.text);
    return import(pathToFileURL(join(tmp, file.replace('.ts', '.js'))).href);
};
const G = await load('googleReview.ts');
const M = await load('bookingMessages.ts');

test('accepts real Google review links', () => {
    for (const u of [
        'https://g.page/r/CabcDEF123/review',
        'https://maps.app.goo.gl/abc123',
        'https://goo.gl/maps/abc123',
        'https://www.google.com/maps/place/Al+Ishara/@25.28,51.53,17z',
        'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4',
        'https://www.google.com.qa/maps/place/X',
        'g.page/r/CabcDEF123/review',
    ]) assert.equal(G.parseGoogleReviewLink(u).ok, true, u);
});

test('a link without https is fixed, and http becomes https', () => {
    assert.equal(G.parseGoogleReviewLink('g.page/r/CabcDEF123/review').url, 'https://g.page/r/CabcDEF123/review');
    assert.equal(G.parseGoogleReviewLink('http://g.page/r/CabcDEF123/review').url, 'https://g.page/r/CabcDEF123/review');
});

test('only review-form links count as direct; a Maps share link does not', () => {
    assert.equal(G.parseGoogleReviewLink('https://maps.app.goo.gl/qtLaG4ifabecYy7C8').direct, false);
    assert.equal(G.parseGoogleReviewLink('https://www.google.com/maps/place/Almolima+cleaning/@25.27,51.54,15z').direct, false);
    assert.equal(G.parseGoogleReviewLink('https://g.page/r/CabcDEF123/review').direct, true);
    assert.equal(G.parseGoogleReviewLink('https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4').direct, true);
    assert.equal(G.parseGoogleReviewLink('ChIJN1t_tDeuEmsRUsoyG83frY4').direct, true);
    // a Maps link that carries the Place ID is turned into the direct form
    const r = G.parseGoogleReviewLink('https://www.google.com/maps/place/X/?q=place_id:ChIJN1t_tDeuEmsRUsoyG83frY4');
    assert.equal(r.direct, true);
    assert.equal(r.url, 'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4');
});

test('a Place ID becomes the write-a-review link', () => {
    const r = G.parseGoogleReviewLink('ChIJN1t_tDeuEmsRUsoyG83frY4');
    assert.equal(r.ok, true);
    assert.equal(r.url, 'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4');
});

test('refuses anything that is not a Google review link', () => {
    for (const u of ['', '   ', 'https://evil.com/g.page', 'https://notgoogle.com/maps', 'https://google.com.evil.com/x', 'javascript:alert(1)',
        'https://user:pw@google.com/maps/x', 'https://www.google.com', 'https://www.google.com/', 'two words https://g.page/x', 'ftp://g.page/x']) {
        assert.equal(G.parseGoogleReviewLink(u).ok, false, JSON.stringify(u));
    }
});

test('reviewTarget goes to Google only when switched on with a valid link', () => {
    const url = 'https://g.page/r/CabcDEF123/review';
    assert.deepEqual(G.reviewTarget({ reviewMode: 'google', googleReviewUrl: url }), { mode: 'google', url });
    assert.equal(G.reviewTarget({ reviewMode: 'google', googleReviewUrl: '' }).mode, 'private');
    assert.equal(G.reviewTarget({ reviewMode: 'google', googleReviewUrl: 'https://evil.com' }).mode, 'private');
    assert.equal(G.reviewTarget({ reviewMode: 'private', googleReviewUrl: url }).mode, 'private');
    assert.equal(G.reviewTarget({ googleReviewUrl: url }).mode, 'private');
});

test('the Google review message is English + Arabic, has emojis and the link', () => {
    const link = 'https://g.page/r/CabcDEF123/review';
    const text = M.renderMessage(M.DEFAULT_TEMPLATES.tplReviewGoogle, { name: 'Sara', service: '5h cleaning', date: '2026-11-13', time: '', cleaner: 'Maria', company: 'Al Ishara', address: '', link });
    assert.ok(text.includes(link));
    assert.ok(text.includes('Sara') && text.includes('Al Ishara'));
    assert.ok(/[؀-ۿ]/.test(text) && /Thank you/.test(text));
    assert.ok(/\p{Extended_Pictographic}/u.test(text));
    assert.ok(!/[{}]/.test(text));
    assert.ok(text.includes('13 نوفمبر 2026'));
});
