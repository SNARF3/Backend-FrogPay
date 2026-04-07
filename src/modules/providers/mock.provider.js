const { randomUUID } = require('crypto');
const PaymentProvider = require('./provider.interface');

class MockProvider extends PaymentProvider {
  async charge(payload) {
    const transactionId = randomUUID();
    return { success: true, transactionId, status: 'COMPLETED', raw: {} };
  }

  async refund(transactionId, amount) {
    return { success: true, refundId: randomUUID(), status: 'REFUNDED' };
  }

  async getStatus(transactionId) {
    return { success: true, transactionId, status: 'COMPLETED' };
  }
}

module.exports = MockProvider;
