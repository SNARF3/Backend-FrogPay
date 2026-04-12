const { randomUUID } = require('crypto');
const PaymentProvider = require('./provider.interface');
const { PaymentFailedError } = require('../../utils/errors');

// Tarjetas de prueba: número (sin espacios) → escenario de fallo
const TEST_CARD_FAILURES = {
  '4000000000009995': { code: 'insufficient_funds', message: 'La tarjeta no tiene fondos suficientes' },
  '4000000000000002': { code: 'card_blocked',        message: 'La tarjeta ha sido bloqueada' },
};

class MockProvider extends PaymentProvider {
  async charge(payload) {
    const cardNumber = (payload.cardNumber || '4242424242424242').replace(/\s/g, '');
    const failure = TEST_CARD_FAILURES[cardNumber];

    if (failure) {
      throw new PaymentFailedError(failure.message, { code: failure.code, card_last4: cardNumber.slice(-4) });
    }

    const transactionId = randomUUID();
    return {
      success: true,
      transactionId,
      status: 'COMPLETED',
      raw: { card_last4: cardNumber.slice(-4) },
    };
  }

  async refund(transactionId, amount) {
    return { success: true, refundId: randomUUID(), status: 'REFUNDED' };
  }

  async getStatus(transactionId) {
    return { success: true, transactionId, status: 'COMPLETED' };
  }
}

module.exports = MockProvider;
