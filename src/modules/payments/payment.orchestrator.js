const providerRegistry = require('../providers/provider.registry');
const { executeWithRetry } = require('../../utils/retry');
const { isTechnicalError, BusinessError, TechnicalError } = require('../../utils/errors');
const paymentModel = require('./payment.model');
const auditLogger = require('../../utils/auditLogger');
const env = require('../../config/env');

const { checkMonthlyVolumeLimit } = require('../../common/limits');

function getMonthlyLimitByPlan(plan) {
  if (plan === 'PREMIUM') return Number.POSITIVE_INFINITY;
  return env.FREE_MONTHLY_TX_LIMIT;
}

class PaymentOrchestrator {
	async processPayment(context) {
		const paymentId = context.payment.id;
		const empresaId = context.empresaId;
		const providerName = context.proveedor;
		const plan = context.plan || (await paymentModel.getCompanyPlan(empresaId));
		
		// 1. Verificar límite por número de transacciones (Existente)
		const usage = await paymentModel.getMonthlyUsage(empresaId);
		const limit = getMonthlyLimitByPlan(plan);

		if (usage.total_transacciones >= limit) {
			throw new BusinessError('Tu plan actual alcanzó el límite mensual de transacciones.', {
				code: 'PLAN_LIMIT_EXCEEDED',
				statusCode: 402,
				details: { plan, limit, current: usage.total_transacciones },
			});
		}

		// 2. Verificar límite por volumen de dinero (Nueva lógica de $50,000 USD)
		const volumeCheck = await checkMonthlyVolumeLimit({
			empresaId,
			plan,
			newAmountUSD: context.payment.monto // context.payment.monto ya viene en USD base del controlador
		});

		if (!volumeCheck.allowed) {
			throw new BusinessError('Transacción rechazada. Has superado el límite mensual de $50,000 USD para el plan FREEMIUM.', {
				code: 'VOLUME_LIMIT_EXCEEDED',
				statusCode: 402,
				details: {
					plan,
					limit: volumeCheck.limitUSD,
					current: volumeCheck.currentVolumeUSD,
					projected: volumeCheck.projectedVolumeUSD
				}
			});
		}

		await paymentModel.updatePaymentStatus(paymentId, empresaId, 'PROCESSING');

		await auditLogger.recordPaymentEvent({
			empresaId,
			paymentId,
			from: 'INITIATED',
			to: 'PROCESSING',
			provider: providerName,
				metadata: {
					originalCurrency: context.payment.original_currency || context.payment.moneda,
					baseCurrency: context.payment.base_currency || context.payment.moneda,
					exchangeRate: context.payment.exchange_rate || 1,
					exchangeRateTimestamp: context.payment.exchange_rate_timestamp || null,
				},
		});

		const provider = providerRegistry.resolve(providerName);

		let providerCreds = {};
		if (providerName === 'paypal') {
			const tenantCreds = await paymentModel.getPaypalCredentialsByEmpresa(empresaId);
			if (!tenantCreds) {
				throw new BusinessError(
					'No hay credenciales de PayPal configuradas para este tenant. Configúralas en Configuración → PayPal.',
					{ code: 'PAYPAL_CREDENTIALS_NOT_CONFIGURED', statusCode: 400 }
				);
			}
			providerCreds = tenantCreds;
		}

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
					...providerCreds,
				}),
				{
					maxRetries: 2,
					shouldRetry: (error) => isTechnicalError(error),
				}
			);

			const providerTransactionId = result.providerTransactionId || result.transactionId || result.id || null;

			if (result.status === 'PENDING') {
				await paymentModel.updatePaymentStatus(paymentId, empresaId, 'PENDING');

				if (result.qrCode || result.qrUrl) {
					await paymentModel.updateQrArtefacts(paymentId, empresaId, result.qrCode, result.qrUrl);
				}

				// For PayPal: insert a PENDING transaction so the return callback can find the payment by orderId
				if (providerName === 'paypal' && providerTransactionId) {
					await paymentModel.insertTransaction({
						pagoId: paymentId,
						idTransaccionProveedor: providerTransactionId,
						estado: 'PENDING',
						codigoRespuesta: 'PAYPAL_PENDING',
						mensajeRespuesta: 'Esperando aprobación del comprador en PayPal',
					});
				}

				await auditLogger.recordPaymentEvent({
					empresaId,
					paymentId,
					from: 'PROCESSING',
					to: 'PENDING',
					provider: providerName,
					providerTransactionId,
				});

				return {
					paymentId,
					status: 'PENDING',
					provider: providerName,
					providerTransactionId,
					qrCode: result.qrCode,
					qrUrl: result.qrUrl,
					approvalUrl: result.approvalUrl || null,
					message: result.message || 'Pago pendiente de confirmación.',
				};
			}

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
				metadata: {
					originalCurrency: context.payment.original_currency || context.payment.moneda,
					baseCurrency: context.payment.base_currency || context.payment.moneda,
					exchangeRate: context.payment.exchange_rate || 1,
					exchangeRateTimestamp: context.payment.exchange_rate_timestamp || null,
				},
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
				metadata: {
					originalCurrency: context.payment.original_currency || context.payment.moneda,
					baseCurrency: context.payment.base_currency || context.payment.moneda,
					exchangeRate: context.payment.exchange_rate || 1,
					exchangeRateTimestamp: context.payment.exchange_rate_timestamp || null,
				},
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
	async processRefund({ proveedor, transactionId, monto, empresaId }) {
		const provider = providerRegistry.resolve(proveedor);

		let creds = {};
		if (proveedor === 'paypal' && empresaId) {
			const tenantCreds = await paymentModel.getPaypalCredentialsByEmpresa(empresaId);
			if (tenantCreds) creds = tenantCreds;
		}

		try {
			return await provider.refund({ transactionId, amount: monto, ...creds });
		} catch (error) {
			if (error instanceof BusinessError) throw error;

			throw new TechnicalError(error.message || 'Error en refund', {
				code: error.code || 'REFUND_ERROR',
				statusCode: error.statusCode || 500,
			});
		}
	}

	// 🔍 Status (reintegrado)
	async getPaymentStatus({ proveedor, transactionId, empresaId }) {
		const provider = providerRegistry.resolve(proveedor);

		let creds = {};
		if (proveedor === 'paypal' && empresaId) {
			const tenantCreds = await paymentModel.getPaypalCredentialsByEmpresa(empresaId);
			if (tenantCreds) creds = tenantCreds;
		}

		try {
			return await provider.getStatus(transactionId, creds);
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