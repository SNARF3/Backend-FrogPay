const paymentModel = require('../modules/payments/payment.model');

async function recordPaymentEvent({ empresaId, paymentId, from, to, provider, providerTransactionId, errorCode, errorMessage, metadata = {} }) {
	return paymentModel.registerAuditEvent({
		empresaId,
		paymentId,
		from,
		to,
		provider,
		providerTransactionId,
		errorCode,
		errorMessage,
		metadata: {
			...metadata,
		},
	});
}

module.exports = {
	recordPaymentEvent,
};