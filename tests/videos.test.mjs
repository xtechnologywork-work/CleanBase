// Tests the cleaner video checks with the real code (compiled by esbuild).
//   Run:  npm run test:videos
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve('.');
const tmp = mkdtempSync(join(tmpdir(), 'cb-vid-'));
writeFileSync(join(tmp, 'backend-stub.js'), "export const isCloud=false;export const VIDEO_BUCKET='staff-videos';export const sb=()=>{throw new Error('no')};");
const out = await build({
    entryPoints: [join(root, 'src/services/videos.ts')], bundle: true, format: 'esm', platform: 'node', write: false, outdir: tmp, logLevel: 'silent',
    plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /\/backend$/ }, () => ({ path: join(tmp, 'backend-stub.js') })); } }],
});
for (const f of out.outputFiles) writeFileSync(f.path, f.text);
const V = await import(pathToFileURL(join(tmp, 'videos.js')).href);

test('video files: only MP4, WebM and MOV up to 50 MB', () => {
    assert.equal(V.checkVideo({ type: 'video/mp4', size: 10 * 1024 * 1024 }), '');
    assert.equal(V.checkVideo({ type: 'video/webm', size: 1 }), '');
    assert.equal(V.checkVideo({ type: 'video/quicktime', size: 49 * 1024 * 1024 }), '');
    assert.equal(V.checkVideo({ type: 'video/mp4', size: V.MAX_VIDEO_BYTES }), '');                  // exactly the limit is fine
    assert.match(V.checkVideo({ type: 'video/mp4', size: V.MAX_VIDEO_BYTES + 1 }), /limit is 50 MB/);
    assert.match(V.checkVideo({ type: 'video/mp4', size: 0 }), /empty/);
    for (const type of ['image/png', 'application/pdf', 'video/x-msvideo', 'text/html', '']) assert.match(V.checkVideo({ type, size: 100 }), /MP4, WebM or MOV/);
});

test('demo mode refuses to upload (a video does not fit in browser storage)', async () => {
    await assert.rejects(() => V.uploadVideo({ type: 'video/mp4', size: 10 }, 'c1'), /cloud database/);
    assert.equal(await V.deleteVideo('sb:c1/x.mp4'), undefined);      // nothing to delete in demo mode
    assert.equal(await V.resolveVideo('https://x.test/v.mp4'), 'https://x.test/v.mp4');
});
