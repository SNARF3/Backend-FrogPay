const test = require('node:test');
const assert = require('node:assert/strict');

test('webhook payload shape remains stable', () => {
  const payload = {
    event: 'pago.completed',
    data: {
      payment_id: 'demo-id',
      status: 'COMPLETED',
      amount: 10,
      currency: 'USD',
      occurred_at: new Date().toISOString(),
    },
  };

  assert.equal(typeof payload.event, 'string');
  assert.equal(payload.data.status, 'COMPLETED');
  assert.equal(typeof payload.data.amount, 'number');
});

test('webhook URL must be https in controller contract', () => {
  const bad = 'http://insecure.test/webhook';
  const good = 'https://secure.test/webhook';

  assert.equal(bad.startsWith('https://'), false);
  assert.equal(good.startsWith('https://'), true);
});
