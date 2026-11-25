// Contact numbers at sign up: the country code is fixed, only the local digits are typed.   Run:  npm run test:phone
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const out = await build({ entryPoints: ['src/services/phone.ts'], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
const { localDigits, formatLocal, fullPhone } = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

test('only the local digits are kept, however the number is typed or pasted', () => {
    assert.equal(localDigits('5170 4550'), '51704550');
    assert.equal(localDigits('+974 5170 4550'), '51704550');
    assert.equal(localDigits('00974 51704550'), '51704550');
    assert.equal(localDigits('974 5170 4550'), '51704550');
    assert.equal(localDigits('abc 55-51 23x45'), '55512345');
    assert.equal(localDigits('555123456789'), '55512345');
    assert.equal(localDigits(''), '');
});

test('the number is shown in two groups of four while typing', () => {
    assert.equal(formatLocal('5'), '5');
    assert.equal(formatLocal('5551'), '5551');
    assert.equal(formatLocal('55512'), '5551 2');
    assert.equal(formatLocal('55512345'), '5551 2345');
});

test('a complete number gets the +974 code; an incomplete one is refused', () => {
    assert.equal(fullPhone('5551 2345'), '+97455512345');
    assert.equal(fullPhone('+974 5551 2345'), '+97455512345');
    assert.equal(fullPhone('5551 234'), null);
    assert.equal(fullPhone(''), null);
});
