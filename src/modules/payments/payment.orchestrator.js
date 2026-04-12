const registry = require('../providers/provider.registry');
const { AppError } = require('../../utils/errors');

class PaymentOrchestrator {
  async processPayment({ provider, amount, currency, description, cardNumber }) {
    try {
      return await registry.getProvider(provider).charge({ amount, currency, description, cardNumber });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(err.message, 500);
    }
  }

  async processRefund({ provider, transactionId, amount }) {
    try {
      return await registry.getProvider(provider).refund(transactionId, amount);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(err.message, 500);
    }
  }

  async getPaymentStatus({ provider, transactionId }) {
    try {
      return await registry.getProvider(provider).getStatus(transactionId);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(err.message, 500);
    }
  }
}

module.exports = new PaymentOrchestrator();
