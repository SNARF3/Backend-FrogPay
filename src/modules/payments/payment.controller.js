const paymentModel = require('./payment.model');
const paymentOrchestrator = require('./payment.orchestrator');
const { BusinessError } = require('../../utils/errors');

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

		if (claveIdempotencia) {
			const existingPayment = await paymentModel.findByIdempotency(empresaId, claveIdempotencia);
			if (existingPayment) {
				return res.status(200).json({
					payment_id: existingPayment.id,
					estado: existingPayment.estado,
					proveedor: existingPayment.proveedor,
					idempotent_replay: true,
				});
			}
		}

		const payment = await paymentModel.createPayment({
			empresaId,
			monto: req.body.monto,
			moneda: req.body.moneda,
			estado: 'INITIATED',
			proveedor,
			claveIdempotencia,
			descripcion: req.body.descripcion,
		});

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

module.exports = {
	createPayment,
};
