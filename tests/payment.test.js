const test = require('node:test');
const assert = require('node:assert/strict');

const cardProvider = require('../src/modules/providers/card.provider');
const mockProvider = require('../src/modules/providers/mock.provider');
const env = require('../src/config/env');

test('card provider approves valid tokenized card number', async () => {
  const result = await cardProvider.charge({ token: '4242424242424242' });
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.cardBrand, 'VISA');
});

test('mock provider can force business failure', async () => {
  await assert.rejects(
    () => mockProvider.charge({ amount: 10, metadata: { forceInsufficientFunds: true } }),
    /Fondos insuficientes/
  );
});

test('stripe publishable key field exists in env config', () => {
  assert.ok(Object.prototype.hasOwnProperty.call(env, 'STRIPE_PUBLISHABLE_KEY'));
});
