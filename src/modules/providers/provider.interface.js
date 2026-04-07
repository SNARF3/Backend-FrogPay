class PaymentProvider {
	async charge(_paymentData) {
		throw new Error('Method charge must be implemented by provider');
	}

	async refund(_refundData) {
		throw new Error('Method refund must be implemented by provider');
	}

	async getStatus(_transactionId) {
		throw new Error('Method getStatus must be implemented by provider');
	}
}

module.exports = {
	PaymentProvider,
};
