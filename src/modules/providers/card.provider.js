const { randomUUID } = require('crypto');
const { PaymentProvider } = require('./provider.interface');
const { BusinessError } = require('../../utils/errors');

function normalizeCardNumberFromToken(token) {
	if (token === undefined || token === null) return '';
	return String(token).replace(/\D/g, '');
}

function detectCardBrand(cardNumber) {
	if (cardNumber.startsWith('4')) return 'VISA';
	if (cardNumber.startsWith('5')) return 'MASTERCARD';
	return 'UNKNOWN';
}

class CardProvider extends PaymentProvider {
	async charge(paymentData) {
		const cardNumber = normalizeCardNumberFromToken(paymentData.token);

		if (!cardNumber || cardNumber.length < 12) {
			throw new BusinessError('card_token inválido', {
				code: 'INVALID_CARD_TOKEN',
				statusCode: 400,
			});
		}

		const cardBrand = detectCardBrand(cardNumber);
		const last4 = cardNumber.slice(-4);

		if (cardNumber.endsWith('0000')) {
			throw new BusinessError('Fondos insuficientes', {
				code: 'INSUFFICIENT_FUNDS',
				statusCode: 402,
				details: { card_brand: cardBrand, card_last4: last4 },
			});
		}

		if (cardNumber.endsWith('1111')) {
			throw new BusinessError('Tarjeta bloqueada', {
				code: 'CARD_BLOCKED',
				statusCode: 402,
				details: { card_brand: cardBrand, card_last4: last4 },
			});
		}

		return {
			providerTransactionId: `card_${randomUUID()}`,
			status: 'COMPLETED',
			responseCode: '00',
			message: 'Pago aprobado por CardProvider',
			cardBrand,
		};
	}

	async refund({ transactionId, amount }) {
		return {
			providerRefundId: `card_refund_${randomUUID()}`,
			status: 'COMPLETED',
			message: `Reembolso procesado para ${transactionId}`,
			amount,
		};
	}

	async getStatus(transactionId) {
		return {
			providerTransactionId: transactionId,
			status: 'COMPLETED',
		};
	}
}

module.exports = new CardProvider();