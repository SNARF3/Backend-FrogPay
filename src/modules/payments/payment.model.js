const pool = require('../../config/database');

async function findByIdempotency(empresaId, claveIdempotencia) {
	const query = `
		SELECT id, empresa_id, monto, moneda, estado, proveedor, clave_idempotencia, descripcion, creado_en, actualizado_en
		FROM pagos
		WHERE empresa_id = $1 AND clave_idempotencia = $2
		LIMIT 1;
	`;

	const { rows } = await pool.query(query, [empresaId, claveIdempotencia]);
	return rows[0] || null;
}

async function createPayment(data) {
	const query = `
		INSERT INTO pagos (
			empresa_id,
			monto,
			moneda,
			estado,
			proveedor,
			clave_idempotencia,
			descripcion
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, empresa_id, monto, moneda, estado, proveedor, clave_idempotencia, descripcion, creado_en, actualizado_en;
	`;

	const values = [
		data.empresaId,
		data.monto,
		data.moneda,
		data.estado,
		data.proveedor,
		data.claveIdempotencia || null,
		data.descripcion || null,
	];

	const { rows } = await pool.query(query, values);
	return rows[0];
}

async function updatePaymentStatus(paymentId, empresaId, estado) {
	const query = `
		UPDATE pagos
		SET estado = $1,
			actualizado_en = CURRENT_TIMESTAMP
		WHERE id = $2 AND empresa_id = $3
		RETURNING id, empresa_id, monto, moneda, estado, proveedor, clave_idempotencia, descripcion, creado_en, actualizado_en;
	`;

	const { rows } = await pool.query(query, [estado, paymentId, empresaId]);
	return rows[0] || null;
}

async function insertTransaction(data) {
	const query = `
		INSERT INTO transacciones (
			pago_id,
			id_transaccion_proveedor,
			estado,
			codigo_respuesta,
			mensaje_respuesta
		) VALUES ($1, $2, $3, $4, $5)
		RETURNING id, pago_id, id_transaccion_proveedor, estado, codigo_respuesta, mensaje_respuesta, creado_en;
	`;

	const values = [
		data.pagoId,
		data.idTransaccionProveedor || null,
		data.estado,
		data.codigoRespuesta || null,
		data.mensajeRespuesta || null,
	];

	const { rows } = await pool.query(query, values);
	return rows[0];
}

async function registerAuditEvent(data) {
	const values = [
		data.empresaId,
		data.paymentId || data.entidadId,
		data.from || null,
		data.to || null,
		data.provider || null,
		data.providerTransactionId || null,
		data.errorCode || null,
		data.errorMessage || null,
		JSON.stringify(data.metadata || {}),
	];

	const paymentEventsQuery = `
		INSERT INTO payment_events (
			empresa_id,
			payment_id,
			from_state,
			to_state,
			provider,
			provider_transaction_id,
			error_code,
			error_message,
			metadata
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, empresa_id, payment_id, from_state, to_state, provider, provider_transaction_id, error_code, error_message, metadata, creado_en;
	`;

	try {
		const { rows } = await pool.query(paymentEventsQuery, values);
		return rows[0];
	} catch (error) {
		if (error.code !== '42P01') {
			throw error;
		}

		const fallbackQuery = `
			INSERT INTO auditoria (
				empresa_id,
				accion,
				entidad,
				entidad_id,
				metadata
			) VALUES ($1, $2, $3, $4, $5)
			RETURNING id, empresa_id, accion, entidad, entidad_id, metadata, creado_en;
		`;

		const fallbackValues = [
			data.empresaId,
			'PAYMENT_STATUS_CHANGED',
			'pago',
			data.paymentId || data.entidadId,
			JSON.stringify({
				from: data.from || null,
				to: data.to || null,
				provider: data.provider || null,
				providerTransactionId: data.providerTransactionId || null,
				errorCode: data.errorCode || null,
				errorMessage: data.errorMessage || null,
				...(data.metadata || {}),
			}),
		];

		const { rows } = await pool.query(fallbackQuery, fallbackValues);
		return rows[0];
	}
}

async function getCardsByEmpresa(empresaId) {
    const query = `
        SELECT 
            id, 
            ultimos_cuatro, 
            red, 
            tipo, 
            creado_en 
        FROM tarjetas 
        WHERE empresa_id = $1 
        ORDER BY creado_en DESC;
    `;
    
    // Asumiendo que 'pool' está disponible en el scope del archivo
    const { rows } = await pool.query(query, [empresaId]);
    return rows;
}

module.exports = {
	findByIdempotency,
	createPayment,
	updatePaymentStatus,
	insertTransaction,
	registerAuditEvent,
	getCardsByEmpresa,
};
