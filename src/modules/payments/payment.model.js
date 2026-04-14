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

async function getCompanyPlan(empresaId) {
	const { rows } = await pool.query(
		`SELECT plan FROM empresas WHERE id = $1 LIMIT 1;`,
		[empresaId]
	);
	return rows[0]?.plan || 'freemium';
}

async function getMonthlyUsage(empresaId) {
	const query = `
		SELECT total_transacciones, total_monto
		FROM uso
		WHERE empresa_id = $1
			AND mes = date_trunc('month', CURRENT_DATE)::date
		LIMIT 1;
	`;

	const { rows } = await pool.query(query, [empresaId]);
	return rows[0] || { total_transacciones: 0, total_monto: 0 };
}

async function incrementMonthlyUsage(empresaId, monto) {
	const selectQuery = `
		SELECT id, total_transacciones, total_monto
		FROM uso
		WHERE empresa_id = $1
			AND mes = date_trunc('month', CURRENT_DATE)::date
		LIMIT 1;
	`;

	const existing = await pool.query(selectQuery, [empresaId]);
	if (existing.rows.length > 0) {
		const updateQuery = `
			UPDATE uso
			SET total_transacciones = total_transacciones + 1,
					total_monto = total_monto + $2
			WHERE id = $1
			RETURNING id, empresa_id, mes, total_transacciones, total_monto;
		`;
		const updated = await pool.query(updateQuery, [existing.rows[0].id, monto]);
		return updated.rows[0];
	}

	const insertQuery = `
		INSERT INTO uso (empresa_id, mes, total_transacciones, total_monto)
		VALUES ($1, date_trunc('month', CURRENT_DATE)::date, 1, $2)
		RETURNING id, empresa_id, mes, total_transacciones, total_monto;
	`;

	const inserted = await pool.query(insertQuery, [empresaId, monto]);
	return inserted.rows[0];
}

async function findPaymentByProviderTransaction(transactionId) {
	const query = `
		SELECT p.id AS payment_id, p.empresa_id
		FROM transacciones t
		INNER JOIN pagos p ON p.id = t.pago_id
		WHERE t.id_transaccion_proveedor = $1
		ORDER BY t.creado_en DESC
		LIMIT 1;
	`;

	const { rows } = await pool.query(query, [transactionId]);
	return rows[0] || null;
}

async function hasRefundForProviderTransaction(transactionId) {
	const query = `
		SELECT 1
		FROM transacciones
		WHERE id_transaccion_proveedor = $1
			AND estado = 'REFUNDED'
		LIMIT 1;
	`;

	const { rows } = await pool.query(query, [transactionId]);
	return rows.length > 0;
}

module.exports = {
	findByIdempotency,
	createPayment,
	updatePaymentStatus,
	insertTransaction,
	registerAuditEvent,
	getCardsByEmpresa,
	getCompanyPlan,
	getMonthlyUsage,
	incrementMonthlyUsage,
	findPaymentByProviderTransaction,
	hasRefundForProviderTransaction,
};
