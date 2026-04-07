const { NotImplementedError } = require('../../utils/errors');

class PaymentProvider {
  async charge(payload) {
    throw new NotImplementedError('charge');
  }

  async refund(transactionId, amount) {
    throw new NotImplementedError('refund');
  }

  async getStatus(transactionId) {
    throw new NotImplementedError('getStatus');
  }
}

module.exports = PaymentProvider;
