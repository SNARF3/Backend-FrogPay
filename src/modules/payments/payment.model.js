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
	const query = `
		INSERT INTO auditoria (
			empresa_id,
			accion,
			entidad,
			entidad_id,
			metadata
		) VALUES ($1, $2, $3, $4, $5)
		RETURNING id, empresa_id, accion, entidad, entidad_id, metadata, creado_en;
	`;

	const values = [
		data.empresaId,
		data.accion,
		data.entidad,
		data.entidadId,
		JSON.stringify(data.metadata || {}),
	];

	const { rows } = await pool.query(query, values);
	return rows[0];
}

module.exports = {
	findByIdempotency,
	createPayment,
	updatePaymentStatus,
	insertTransaction,
	registerAuditEvent,
};
