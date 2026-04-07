const paymentModel = require('./payment.model');
const paymentOrchestrator = require('./payment.orchestrator');
const { BusinessError } = require('../../utils/errors');
const logger = require('../../utils/logger');

function validatePayload(body) {
	if (!body) return 'Payload inválido';
	if (!body.monto || Number(body.monto) <= 0) return 'El campo monto debe ser mayor a 0';
	if (!body.moneda) return 'El campo moneda es obligatorio';
	return null;
}

async function createPayment(req, res) {
	try {
		const validationError = validatePayload(req.body);
		if (validationError) {
			return res.status(400).json({ error: validationError });
		}

		const empresaId = req.empresaId;
		const proveedor = req.body.proveedor || 'mock';
		const claveIdempotencia = req.body.clave_idempotencia || null;

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
			monto: req.body.monto,
			moneda: req.body.moneda,
			estado: 'INITIATED',
			proveedor,
			claveIdempotencia,
			descripcion: req.body.descripcion,
		});

		// 🧾 Auditoría
		await paymentModel.registerAuditEvent({
			empresaId,
			accion: 'PAYMENT_STATUS_CHANGED',
			entidad: 'pago',
			entidadId: payment.id,
			metadata: {
				from: null,
				to: 'INITIATED',
				provider: proveedor,
			},
		});

		// ⚙️ Orquestador
		const result = await paymentOrchestrator.processPayment({
			empresaId,
			proveedor,
			payment,
			token: req.body.token,
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
	const { proveedor, monto } = req.body;

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
	const { proveedor } = req.query;

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