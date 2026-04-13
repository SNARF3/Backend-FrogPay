const paymentModel = require('./payment.model');
const paymentOrchestrator = require('./payment.orchestrator');
const { BusinessError } = require('../../utils/errors');
const env = require('../../config/env');
const auditLogger = require('../../utils/auditLogger');
const logger = require('../../utils/logger');

function validatePayload(body) {
	if (!body) return 'Payload inválido';
	const amount = body.monto ?? body.amount;
	const currency = body.moneda ?? body.currency;
	if (amount === undefined || amount === null || Number(amount) <= 0) return 'El campo monto/amount debe ser mayor a 0';
	if (!currency) return 'El campo moneda/currency es obligatorio';
	return null;
}

async function createPayment(req, res) {
	try {
		const validationError = validatePayload(req.body);
		if (validationError) {
			return res.status(400).json({ error: validationError });
		}

		const empresaId = req.empresaId;
		const proveedor = req.body.proveedor || req.body.provider || req.body.paymentProvider || env.DEFAULT_PROVIDER || 'mock';
		const monto = req.body.monto ?? req.body.amount;
		const moneda = req.body.moneda ?? req.body.currency;
		const claveIdempotencia = req.body.clave_idempotencia || req.body.idempotencyKey || null;
		const descripcion = req.body.descripcion ?? req.body.description ?? null;
		const token = req.body.token ?? req.body.paymentToken ?? null;

		// 🔁 Idempotencia
		if (claveIdempotencia) {
			const existingPayment = await paymentModel.findByIdempotency(
				empresaId,
				claveIdempotencia
			);

			if (existingPayment) {
				return res.status(200).json({
					payment_id: existingPayment.id,
					estado: existingPayment.estado,
					proveedor: existingPayment.proveedor,
					idempotent_replay: true,
				});
			}
		}

		// 💾 Crear pago
		const payment = await paymentModel.createPayment({
			empresaId,
			monto,
			moneda,
			estado: 'INITIATED',
			proveedor,
			claveIdempotencia,
			descripcion,
		});

		// 🧾 Auditoría
		await auditLogger.recordPaymentEvent({
			empresaId,
			paymentId: payment.id,
			from: null,
			to: 'INITIATED',
			provider: proveedor,
		});

		// ⚙️ Orquestador
		const result = await paymentOrchestrator.processPayment({
			empresaId,
			proveedor,
			payment,
			token,
			metadata: req.body.metadata || {},
		});

		return res.status(201).json({
			payment_id: result.paymentId,
			estado: result.status,
			proveedor: result.provider,
			id_transaccion_proveedor: result.providerTransactionId,
			mensaje: result.message,
		});
	} catch (error) {
		logger.error(`createPayment: ${error.message}`);

		if (error instanceof BusinessError) {
			return res.status(error.statusCode).json({
				error: error.message,
				code: error.code,
			});
		}

		return res.status(error.statusCode || 500).json({
			error: error.message || 'Error interno al procesar el pago',
			code: error.code || 'INTERNAL_ERROR',
		});
	}
}

async function refundPayment(req, res) {
	const { transactionId } = req.params;
	const proveedor = req.body.proveedor || req.body.provider || env.DEFAULT_PROVIDER || 'paypal';
	const { monto } = req.body;

	if (!proveedor || !transactionId) {
		return res.status(400).json({
			error: 'proveedor y transactionId son requeridos',
		});
	}

	try {
		const result = await paymentOrchestrator.processRefund({
			proveedor,
			transactionId,
			monto,
		});

		return res.status(200).json(result);
	} catch (error) {
		logger.error(`refundPayment: ${error.message}`);

		return res.status(error.statusCode || 500).json({
			error: error.message,
		});
	}
}

async function getPaymentStatus(req, res) {
	const { transactionId } = req.params;
	const proveedor = req.query.proveedor || req.query.provider || env.DEFAULT_PROVIDER || 'paypal';

	if (!proveedor || !transactionId) {
		return res.status(400).json({
			error: 'proveedor y transactionId son requeridos',
		});
	}

	try {
		const result = await paymentOrchestrator.getPaymentStatus({
			proveedor,
			transactionId,
		});

		return res.status(200).json(result);
	} catch (error) {
		logger.error(`getPaymentStatus: ${error.message}`);

		return res.status(error.statusCode || 500).json({
			error: error.message,
		});
	}
}

module.exports = {
	createPayment,
	refundPayment,
	getPaymentStatus,
};