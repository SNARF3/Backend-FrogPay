const { PaymentProvider } = require('./provider.interface');
const { BusinessError, TechnicalError } = require('../../utils/errors');

class MockProvider extends PaymentProvider {
	async charge(paymentData) {
		const metadata = paymentData.metadata || {};

		if (metadata.forceTechnicalError) {
			throw new TechnicalError('Mock provider timeout', {
				code: 'PROVIDER_TIMEOUT',
				statusCode: 504,
			});
		}

		if (metadata.forceInsufficientFunds || Number(paymentData.amount) > 1000000) {
			throw new BusinessError('Fondos insuficientes', {
				code: 'INSUFFICIENT_FUNDS',
				statusCode: 402,
			});
		}

		return {
			providerTransactionId: `mock_${Date.now()}`,
			status: 'COMPLETED',
			responseCode: '00',
			message: 'Pago aprobado por MockProvider',
		};
	}

	async refund(refundData) {
		return {
			providerRefundId: `mock_refund_${Date.now()}`,
			status: 'COMPLETED',
			message: `Reembolso simulado para ${refundData.paymentId}`,
		};
	}

	async getStatus(transactionId) {
		return {
			providerTransactionId: transactionId,
			status: 'COMPLETED',
		};
	}
}

module.exports = new MockProvider();
