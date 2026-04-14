const providerRegistry = require('../providers/provider.registry');
const { executeWithRetry } = require('../../utils/retry');
const { isTechnicalError, BusinessError, TechnicalError } = require('../../utils/errors');
const paymentModel = require('./payment.model');
const auditLogger = require('../../utils/auditLogger');
const env = require('../../config/env');

function getMonthlyLimitByPlan(plan) {
  if (plan === 'pro') return Number.POSITIVE_INFINITY;
  return env.FREE_MONTHLY_TX_LIMIT;
}

class PaymentOrchestrator {
	async processPayment(context) {
		const paymentId = context.payment.id;
		const empresaId = context.empresaId;
		const providerName = context.proveedor;
		const plan = context.plan || (await paymentModel.getCompanyPlan(empresaId));
		const usage = await paymentModel.getMonthlyUsage(empresaId);
		const limit = getMonthlyLimitByPlan(plan);

		if (usage.total_transacciones >= limit) {
			throw new BusinessError('Tu plan actual alcanzó el límite mensual de transacciones.', {
				code: 'PLAN_LIMIT_EXCEEDED',
				statusCode: 402,
				details: {
					plan,
					limit,
					current: usage.total_transacciones,
				},
			});
		}

		await paymentModel.updatePaymentStatus(paymentId, empresaId, 'PROCESSING');

		await auditLogger.recordPaymentEvent({
			empresaId,
			paymentId,
			from: 'INITIATED',
			to: 'PROCESSING',
			provider: providerName,
		});

		const provider = providerRegistry.resolve(providerName);

		try {
			const result = await executeWithRetry(
				async () => provider.charge({
					paymentId,
					empresaId,
					amount: context.payment.monto,
					currency: context.payment.moneda,
					token: context.token,
					description: context.payment.descripcion,
					metadata: context.metadata,
				}),
				{
					maxRetries: 2,
					shouldRetry: (error) => isTechnicalError(error),
				}
			);

			const providerTransactionId = result.providerTransactionId || result.transactionId || result.id || null;

			await paymentModel.updatePaymentStatus(paymentId, empresaId, 'COMPLETED');

			await paymentModel.insertTransaction({
				pagoId: paymentId,
				idTransaccionProveedor: providerTransactionId,
				estado: 'COMPLETED',
				codigoRespuesta: result.responseCode || '00',
				mensajeRespuesta: result.message || 'Pago completado',
			});

			await paymentModel.incrementMonthlyUsage(empresaId, context.payment.monto);

			await auditLogger.recordPaymentEvent({
				empresaId,
				paymentId,
				from: 'PROCESSING',
				to: 'COMPLETED',
				provider: providerName,
				providerTransactionId,
			});

			return {
				paymentId,
				status: 'COMPLETED',
				provider: providerName,
				providerTransactionId,
				message: result.message || 'Pago completado',
			};
		} catch (error) {
			await paymentModel.updatePaymentStatus(paymentId, empresaId, 'FAILED');

			await paymentModel.insertTransaction({
				pagoId: paymentId,
				idTransaccionProveedor: null,
				estado: 'FAILED',
				codigoRespuesta: error.code || 'PAYMENT_FAILED',
				mensajeRespuesta: error.message || 'Pago fallido',
			});

			await auditLogger.recordPaymentEvent({
				empresaId,
				paymentId,
				from: 'PROCESSING',
				to: 'FAILED',
				provider: providerName,
				errorCode: error.code || 'PAYMENT_FAILED',
				errorMessage: error.message,
			});

			if (error instanceof BusinessError) {
				throw error;
			}

			throw new TechnicalError(error.message || 'Fallo técnico procesando pago', {
				code: error.code || 'PAYMENT_TECHNICAL_FAILURE',
				statusCode: error.statusCode || 502,
			});
		}
	}

	// 🔁 Refund (reintegrado)
	async processRefund({ proveedor, transactionId, monto }) {
		const provider = providerRegistry.resolve(proveedor);

		try {
			return await provider.refund({ transactionId, amount: monto });
		} catch (error) {
			if (error instanceof BusinessError) throw error;

			throw new TechnicalError(error.message || 'Error en refund', {
				code: error.code || 'REFUND_ERROR',
				statusCode: error.statusCode || 500,
			});
		}
	}

	// 🔍 Status (reintegrado)
	async getPaymentStatus({ proveedor, transactionId }) {
		const provider = providerRegistry.resolve(proveedor);

		try {
			return await provider.getStatus(transactionId);
		} catch (error) {
			if (error instanceof BusinessError) throw error;

			throw new TechnicalError(error.message || 'Error obteniendo estado', {
				code: error.code || 'STATUS_ERROR',
				statusCode: error.statusCode || 500,
			});
		}
	}
}

module.exports = new PaymentOrchestrator();