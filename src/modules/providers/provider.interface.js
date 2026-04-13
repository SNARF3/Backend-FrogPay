const { NotImplementedError } = require('../../utils/errors');

class PaymentProvider {
	async charge(_paymentData) {
		throw new NotImplementedError('charge');
	}

	async refund(_refundData) {
		throw new NotImplementedError('refund');
	}

	async getStatus(_transactionId) {
		throw new NotImplementedError('getStatus');
	}
}

module.exports = {
	PaymentProvider,
};