const Stripe = require('stripe');
const { PaymentProvider } = require('./provider.interface');
const { BusinessError, TechnicalError } = require('../../utils/errors');

class StripeProvider extends PaymentProvider {
	constructor() {
		super();
		this.client = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
	}

	ensureClient() {
		if (!this.client) {
			throw new TechnicalError('STRIPE_SECRET_KEY no configurada en el backend', {
				code: 'MISSING_STRIPE_SECRET',
				statusCode: 500,
			});
		}
	}

	async charge(paymentData) {
		this.ensureClient();

		try {
			const charge = await this.client.charges.create({
				amount: Math.round(Number(paymentData.amount) * 100),
				currency: String(paymentData.currency || 'usd').toLowerCase(),
				source: paymentData.token,
				description: paymentData.description || 'Pago procesado por FrogPay',
				metadata: {
					payment_id: paymentData.paymentId,
					empresa_id: paymentData.empresaId,
					...paymentData.metadata,
				},
			});

			return {
				providerTransactionId: charge.id,
				status: charge.paid ? 'COMPLETED' : 'FAILED',
				responseCode: charge.outcome?.network_status || 'stripe_processed',
				message: charge.outcome?.seller_message || 'Pago procesado en Stripe',
			};
		} catch (error) {
			if (error?.code === 'card_declined' && error?.decline_code === 'insufficient_funds') {
				throw new BusinessError('Fondos insuficientes', {
					code: 'INSUFFICIENT_FUNDS',
					statusCode: 402,
					details: error.message,
				});
			}

			if (error?.type === 'StripeCardError') {
				throw new BusinessError(error.message || 'Pago rechazado por Stripe', {
					code: error.code || 'CARD_DECLINED',
					statusCode: 402,
				});
			}

			throw new TechnicalError(error.message || 'Error técnico procesando pago en Stripe', {
				code: error.code || 'STRIPE_TECHNICAL_ERROR',
				statusCode: 502,
			});
		}
	}

	async refund(refundData) {
		this.ensureClient();

		try {
			const refund = await this.client.refunds.create({
				charge: refundData.providerTransactionId,
			});

			return {
				providerRefundId: refund.id,
				status: refund.status,
			};
		} catch (error) {
			throw new TechnicalError(error.message || 'Error técnico al reembolsar en Stripe', {
				code: error.code || 'STRIPE_REFUND_ERROR',
				statusCode: 502,
			});
		}
	}

	async getStatus(transactionId) {
		this.ensureClient();

		try {
			const charge = await this.client.charges.retrieve(transactionId);
			return {
				providerTransactionId: charge.id,
				status: charge.status,
			};
		} catch (error) {
			throw new TechnicalError(error.message || 'Error técnico consultando estado en Stripe', {
				code: error.code || 'STRIPE_STATUS_ERROR',
				statusCode: 502,
			});
		}
	}
}

module.exports = new StripeProvider();
