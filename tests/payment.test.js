const test = require('node:test');
const assert = require('node:assert/strict');

const cardProvider = require('../src/modules/providers/card.provider');
const qrProvider = require('../src/modules/providers/qr.provider');

test('card provider approves valid tokenized card number', async () => {
  const result = await cardProvider.charge({ token: '4242424242424242' });
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.cardBrand, 'VISA');
});

test('qr provider returns a pending payment and a QR url', async () => {
  const result = await qrProvider.charge({ paymentId: '123e4567-e89b-12d3-a456-426614174000' });
  assert.equal(result.status, 'PENDING');
  assert.ok(typeof result.qrUrl === 'string' && result.qrUrl.length > 0);
});
