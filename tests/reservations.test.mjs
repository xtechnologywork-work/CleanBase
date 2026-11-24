// Tests the rule "a cleaner kept by a subscription cannot be used by another client during its period".
//   Run:  npm run test:reservations
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve('.');
const tmp = mkdtempSync(join(tmpdir(), 'cb-res-'));
const out = await build({ entryPoints: [join(root, 'src/services/reservations.ts')], bundle: true, format: 'esm', platform: 'node', write: false, outdir: tmp, logLevel: 'silent' });
for (const f of out.outputFiles) writeFileSync(f.path, f.text);
const R = await import(pathToFileURL(join(tmp, 'reservations.js')).href);

const sub = (over = {}) => ({ id: 's1', clientId: 'bader', cleanerId: 'maria', frequency: 'monthly', status: 'active', startDate: '2026-11-19T00:00:00.000Z', endDate: '2026-12-19T00:00:00.000Z', ...over });
const rs = (subs, contracts = [], mode = 'monthly') => R.reservationsOf(subs, contracts, mode);

test('a monthly plan keeps its cleaner for the whole period, both end days included', () => {
    const [r] = rs([sub()]);
    assert.deepEqual([r.cleanerId, r.from, r.to, r.open], ['maria', '2026-11-19', '2026-12-19', false]);
    for (const d of ['2026-11-19', '2026-12-01', '2026-12-19']) assert.ok(R.reservedOn([r], 'maria', d, 'sabiha'), d);
    for (const d of ['2026-11-18', '2026-12-20']) assert.equal(R.reservedOn([r], 'maria', d, 'sabiha'), undefined, `${d} is free`);
});

test('the cleaner is free again the day after the period, and other cleaners are never affected', () => {
    const list = rs([sub()]);
    assert.equal(R.reservedOn(list, 'maria', '2026-12-20', 'sabiha'), undefined);
    assert.equal(R.reservedOn(list, 'joy', '2026-12-01', 'sabiha'), undefined);
});

test('the client who owns the reservation can still book the same cleaner', () => {
    const list = rs([sub()]);
    assert.equal(R.reservedOn(list, 'maria', '2026-12-01', 'bader'), undefined);
    assert.equal(R.reservedOn(list, 'maria', '2026-12-01', 'sabiha', 's1'), undefined, 'the subscription itself');
});

test('a subscription with no end date keeps the cleaner until it ends', () => {
    const [r] = rs([sub({ endDate: undefined })]);
    assert.equal(r.open, true);
    assert.ok(R.reservedOn([r], 'maria', '2031-01-01', 'sabiha'));
    assert.equal(R.untilText(r, d => d), 'until the subscription ends');
    assert.equal(R.untilText(rs([sub()])[0], d => d), 'until 2026-12-19');
});

test('paused, cancelled, unassigned subscriptions keep nobody', () => {
    for (const over of [{ status: 'paused' }, { status: 'cancelled' }, { cleanerId: undefined }, { startDate: '' }]) assert.deepEqual(rs([sub(over)]), [], JSON.stringify(over));
});

test('an ended or cancelled contract frees the cleaner; a signed or draft one keeps her', () => {
    const c = (status, createdAt = '2026-11-19') => ({ subscriptionId: 's1', status, createdAt });
    assert.equal(rs([sub()], [c('signed')]).length, 1);
    assert.equal(rs([sub()], [c('draft')]).length, 1);
    assert.equal(rs([sub()], [c('ended')]).length, 0);
    assert.equal(rs([sub()], [c('cancelled')]).length, 0);
    // a new contract after an ended one keeps her again
    assert.equal(rs([sub()], [c('ended', '2026-11-19'), c('signed', '2026-12-01')]).length, 1);
    // another subscription's contract does not matter
    assert.equal(rs([sub()], [{ subscriptionId: 's2', status: 'ended', createdAt: '2026-11-19' }]).length, 1);
});

test('the company setting decides which plans keep a cleaner', () => {
    const weekly = sub({ id: 's2', frequency: 'weekly' }), live = sub({ id: 's3', frequency: 'live-in' });
    assert.deepEqual(rs([sub(), weekly, live], [], 'monthly').map(r => r.subscriptionId), ['s1', 's3']);
    assert.deepEqual(rs([sub(), weekly, live], [], 'all').map(r => r.subscriptionId), ['s1', 's2', 's3']);
    assert.deepEqual(rs([sub(), weekly, live], [], 'off'), []);
    assert.equal(R.reserveModeOf(undefined), 'monthly');
    assert.equal(R.reserveModeOf({ reserveCleaners: 'all' }), 'all');
    assert.equal(R.reserveModeOf({ reserveCleaners: 'nonsense' }), 'monthly');
});

test('a new subscription period is checked against the reservations that overlap it', () => {
    const list = rs([sub()]);
    const during = (from, to, client = 'sabiha', subId) => R.reservedDuring(list, 'maria', from, to, client, subId).length;
    assert.equal(during('2026-11-16', '2026-11-16'), 0, 'ends before it starts');
    assert.equal(during('2026-11-16', '2026-11-19'), 1, 'touches the first day');
    assert.equal(during('2026-12-19', '2027-01-19'), 1, 'touches the last day');
    assert.equal(during('2026-12-20', '2027-01-19'), 0, 'starts the day after');
    assert.equal(during('2026-11-01', undefined), 1, 'no end date overlaps');
    assert.equal(during('2026-12-20', undefined), 0, 'no end date but after');
    assert.equal(during('2026-11-20', '2026-12-01', 'bader'), 0, 'the same client');
    assert.equal(during('2026-11-20', '2026-12-01', 'sabiha', 's1'), 0, 'editing the same subscription');
});

test('two subscriptions keeping the same cleaner at once are reported as a clash (the case in the screenshot)', () => {
    const bader = sub();                                                  // 19 Nov to 19 Dec
    const sabiha = sub({ id: 's2', clientId: 'sabiha', endDate: undefined, startDate: '2026-11-16T00:00:00.000Z' });   // 16 Nov, no end
    const found = R.clashes(rs([bader, sabiha]));
    assert.equal(found.length, 1);
    assert.deepEqual(found[0].map(r => r.clientId).sort(), ['bader', 'sabiha']);
    // after one ends before the other starts there is no clash
    assert.equal(R.clashes(rs([bader, sub({ id: 's2', clientId: 'sabiha', startDate: '2026-12-20T00:00:00.000Z', endDate: '2027-01-20T00:00:00.000Z' })])).length, 0);
    // the same client twice is not a clash, and different cleaners are not a clash
    assert.equal(R.clashes(rs([bader, sub({ id: 's2' })])).length, 0);
    assert.equal(R.clashes(rs([bader, sub({ id: 's2', clientId: 'sabiha', cleanerId: 'joy' })])).length, 0);
});
