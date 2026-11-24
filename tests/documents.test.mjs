// Tests the staff document checks with the real code (compiled by esbuild).
//   Run:  npm run test:documents
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.Event = class { constructor(t) { this.type = t; } };

const root = resolve('.');
const tmp = mkdtempSync(join(tmpdir(), 'cb-doc-'));
writeFileSync(join(tmp, 'backend-stub.js'), "export const isCloud=false;export const DB_KEY='db';export const ERP_KEY='erp';export const LEGACY_DB_KEY='l1';export const LEGACY_ERP_KEY='l2';export const PHOTO_BUCKET='p';export const supabase=null;export const sb=()=>{throw new Error('no')};");
const out = await build({
    entryPoints: [join(root, 'src/services/documents.ts')], bundle: true, format: 'esm', platform: 'node', write: false, outdir: tmp, logLevel: 'silent',
    plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /\/backend$/ }, () => ({ path: join(tmp, 'backend-stub.js') })); } }],
});
for (const f of out.outputFiles) writeFileSync(f.path, f.text);
const D = await import(pathToFileURL(join(tmp, 'documents.js')).href);

test('document files: photos or PDFs, PDFs up to 10 MB', () => {
    assert.equal(D.checkDocument({ type: 'image/jpeg', size: 5_000_000 }), '');
    assert.equal(D.checkDocument({ type: 'image/png', size: 1 }), '');
    assert.equal(D.checkDocument({ type: 'application/pdf', size: D.MAX_PDF_BYTES }), '');
    assert.match(D.checkDocument({ type: 'application/pdf', size: D.MAX_PDF_BYTES + 1 }), /limit is 10 MB/);
    assert.match(D.checkDocument({ type: 'application/pdf', size: 0 }), /empty/);
    for (const type of ['video/mp4', 'application/zip', 'text/plain', 'application/msword', '']) assert.match(D.checkDocument({ type, size: 10 }), /photo or a PDF/);
});

test('a stored reference is recognised as a PDF', () => {
    assert.equal(D.isPdfRef('sb:c1/docs/doc-abc.pdf'), true);
    assert.equal(D.isPdfRef('sb:c1/docs/doc-abc.PDF'), true);
    assert.equal(D.isPdfRef('data:application/pdf;base64,AAAA'), true);
    assert.equal(D.isPdfRef('sb:c1/docs/ph-abc.jpg'), false);
    assert.equal(D.isPdfRef('data:image/jpeg;base64,AAAA'), false);
});

test('document state: expired, expiring within 30 days, valid', () => {
    assert.equal(D.docState('2026-11-18', '2026-11-19'), 'expired');
    assert.equal(D.docState('2026-11-19', '2026-11-19'), 'soon');       // expires today: still valid, but running out
    assert.equal(D.docState('2026-12-19', '2026-11-19'), 'soon');       // exactly 30 days
    assert.equal(D.docState('2026-12-20', '2026-11-19'), 'valid');
    assert.equal(D.docState('2028-01-01', '2026-11-19'), 'valid');
});

test('demo mode refuses PDFs (they do not fit in browser storage) with a clear message', async () => {
    await assert.rejects(() => D.uploadDocument({ type: 'application/pdf', size: 1000, name: 'a.pdf' }, 'c1'), /cloud database/);
    await assert.rejects(() => D.uploadDocument({ type: 'video/mp4', size: 1000, name: 'a.mp4' }, 'c1'), /photo or a PDF/);
    assert.ok(D.DOC_TYPES.includes('QID') && D.DOC_TYPES.includes('Contract'));
});
