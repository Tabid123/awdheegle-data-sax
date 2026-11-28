import test from 'node:test';
import assert from 'node:assert/strict';
import { rewardAccountPhone } from '../src/lib/rewardAccountPhone.ts';
test('explicit account number is normalized', () => {
  assert.equal(rewardAccountPhone('615000001'), '615000001');
  assert.equal(rewardAccountPhone('+252 615000001'), '615000001');
});
test('missing or invalid login never falls back to payer', () => {
  for (const value of [null, undefined, '', '123', '252123', '0615000001']) {
    assert.equal(rewardAccountPhone(value), null);
  }
});
