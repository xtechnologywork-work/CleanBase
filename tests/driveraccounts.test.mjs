// Tests how a driver's phone number and company become a login, and the welcome message.
//   Run:  npm run test:driveraccounts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, transformSync } from 'esbuild';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve('.');
const tmp = mkdtempSync(join(tmpdir(), 'cb-drv-'));
const out = await build({ entryPoints: [join(root, 'src/services/driverAccounts.ts')], bundle: true, format: 'esm', platform: 'node', write: false, outdir: tmp, logLevel: 'silent' });
for (const f of out.outputFiles) writeFileSync(f.path, f.text);
const A = await import(pathToFileURL(join(tmp, 'driverAccounts.js')).href);

test('every way of typing the same number gives the same digits', () => {
    for (const p of ['5512 3456', '+974 5512 3456', '974-5512-3456', '00974 5512 3456', '(974) 55123456', ' 55123456 ']) assert.equal(A.driverDigits(p), '97455123456', p);
    assert.equal(A.driverDigits('+44 7911 123456'), '447911123456');
});

test('unusable numbers are refused', () => {
    for (const p of ['', 'abc', '123', '1234567', '1234567890123456', null, undefined]) assert.equal(A.driverDigits(p), '', String(p));
});

test('the login email is made from the phone and the company, so the same phone can work in two companies', () => {
    assert.equal(A.driverEmail('c-1794572420522', '5512 3456'), '97455123456@c-1794572420522.driver.cleanbase.app');
    assert.equal(A.driverEmail('c-1794572420522', '+974 5512 3456'), A.driverEmail('c-1794572420522', '55123456'));
    assert.notEqual(A.driverEmail('c-1', '55123456'), A.driverEmail('c-2', '55123456'));
    assert.equal(A.driverEmail('c-1', 'nope'), '');
    assert.equal(A.driverEmail('', '55123456'), '');
    assert.equal(A.driverEmail('C_Weird Id!', '55123456'), '97455123456@c-weird-id.driver.cleanbase.app');
});

test('the Edge Function builds exactly the same email as the app', () => {
    const src = readFileSync(join(root, 'supabase/functions/driver-admin/index.ts'), 'utf8');
    const block = /\/\/ BEGIN driverEmail([\s\S]*?)\/\/ END driverEmail/.exec(src)?.[1];
    assert.ok(block, 'markers found in the function');
    const js = transformSync(block, { loader: 'ts' }).code;
    const fn = new Function(`${js}; return driverEmail;`)();
    for (const [c, p] of [['c-1794572420522', '5512 3456'], ['c-9', '+44 7911 123456'], ['C_Weird Id!', '55123456'], ['c-1', '']]) {
        assert.equal(fn(c, A.driverDigits(p)), A.driverEmail(c, p), `${c} ${p}`);
    }
});

test('driver emails are recognised, others are not', () => {
    assert.equal(A.isDriverEmail('97455123456@c-1.driver.cleanbase.app'), true);
    assert.equal(A.isDriverEmail('owner@gmail.com'), false);
});

test('the company link and the phone display', () => {
    assert.equal(A.driverLoginUrl('c-123', 'https://app.example.com'), 'https://app.example.com/driver/login?c=c-123');
    assert.equal(A.prettyPhone('97455123456'), '+974 5512 3456');
    assert.equal(A.prettyPhone('447911123456'), '+447911123456');
});

test('the welcome message has the link, the phone and the password, in English and Arabic', () => {
    const text = A.driverWelcomeMessage({ name: 'Omar', company: 'Al Ishara', link: 'https://x.test/driver/login?c=c-1', phone: '+974 5512 3456', password: 'Secret-123' });
    for (const bit of ['Omar', 'Al Ishara', 'https://x.test/driver/login?c=c-1', '+974 5512 3456', 'Secret-123']) assert.ok(text.includes(bit), bit);
    assert.ok(/[؀-ۿ]/.test(text) && /Password/.test(text) && /كلمة المرور/.test(text));
    assert.ok(!/[{}]/.test(text));
});
