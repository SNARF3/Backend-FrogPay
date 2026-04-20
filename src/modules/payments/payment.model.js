const pool = require('../../config/database');

async function findByIdempotency(empresaId, claveIdempotencia) {
	const query = `
		SELECT id, empresa_id, monto, moneda, estado, proveedor, clave_idempotencia, descripcion, original_amount, original_currency, exchange_rate, converted_amount, base_currency, exchange_rate_timestamp, creado_en, actualizado_en
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
			original_amount,
			original_currency,
			exchange_rate,
			converted_amount,
			base_currency,
			exchange_rate_timestamp,
			estado,
			proveedor,
			clave_idempotencia,
			descripcion,
			qr_code,
			qr_url,
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id, empresa_id, monto, moneda, estado, proveedor, clave_idempotencia, descripcion, original_amount, original_currency, exchange_rate, converted_amount, base_currency, exchange_rate_timestamp, creado_en, actualizado_en;
	`;

	const values = [
		data.empresaId,
		data.convertedAmount ?? data.monto,
		data.baseCurrency ?? data.moneda,
		data.originalAmount ?? data.monto,
		data.originalCurrency ?? data.moneda,
		data.exchangeRate ?? 1,
		data.convertedAmount ?? data.monto,
		data.baseCurrency ?? data.moneda,
		data.exchangeRateTimestamp || new Date(),
		data.estado,
		data.proveedor,
		data.claveIdempotencia || null,
		data.descripcion || null,
		data.qrCode || null,
		data.qrUrl || null,
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
		RETURNING id, empresa_id, monto, moneda, estado, proveedor, clave_idempotencia, descripcion, original_amount, original_currency, exchange_rate, converted_amount, base_currency, exchange_rate_timestamp, creado_en, actualizado_en;
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

async function getRecentPaymentsForTenant(empresaId, limit = 30) {
	const query = `
		SELECT
			p.id,
			p.monto,
			p.moneda,
			p.original_amount,
			p.original_currency,
			p.exchange_rate,
			p.converted_amount,
			p.base_currency,
			p.exchange_rate_timestamp,
			p.estado,
			p.proveedor,
			p.descripcion,
			p.creado_en,
			p.actualizado_en,
			t.id_transaccion_proveedor,
			t.codigo_respuesta,
			t.mensaje_respuesta,
			t.creado_en AS transaccion_creada_en,
			COALESCE(w.webhook_success_count, 0) AS webhook_success_count,
			COALESCE(w.webhook_failed_count, 0) AS webhook_failed_count,
			w.webhook_last_status,
			w.webhook_last_attempt_at
		FROM pagos p
		LEFT JOIN LATERAL (
			SELECT
				tx.id_transaccion_proveedor,
				tx.codigo_respuesta,
				tx.mensaje_respuesta,
				tx.creado_en
			FROM transacciones tx
			WHERE tx.pago_id = p.id
			ORDER BY tx.creado_en DESC
			LIMIT 1
		) t ON TRUE
		LEFT JOIN LATERAL (
			SELECT
				COUNT(*) FILTER (WHERE l.estado = 'success') AS webhook_success_count,
				COUNT(*) FILTER (WHERE l.estado = 'failed') AS webhook_failed_count,
				(ARRAY_AGG(l.estado ORDER BY l.ultimo_intento DESC NULLS LAST))[1] AS webhook_last_status,
				MAX(l.ultimo_intento) AS webhook_last_attempt_at
			FROM logs_webhooks l
			INNER JOIN webhooks wh ON wh.id = l.webhook_id
			WHERE wh.empresa_id = p.empresa_id
				AND (l.payload->'data'->>'payment_id') = p.id::text
		) w ON TRUE
		WHERE p.empresa_id = $1
		ORDER BY p.creado_en DESC
		LIMIT $2;
	`;

	const { rows } = await pool.query(query, [empresaId, limit]);
	return rows;
}

async function getOrCreateProvider(providerName, providerType) {
	const normalizedName = String(providerName || '').trim().toLowerCase();
	const normalizedType = String(providerType || 'custom').trim().toLowerCase();

	if (!normalizedName) {
		throw new Error('providerName es requerido');
	}

	const existing = await pool.query(
		`SELECT id, nombre, tipo FROM proveedores WHERE LOWER(nombre) = $1 LIMIT 1`,
		[normalizedName]
	);

	if (existing.rows.length > 0) {
		return existing.rows[0];
	}

	const inserted = await pool.query(
		`
			INSERT INTO proveedores (nombre, tipo, activo)
			VALUES ($1, $2, true)
			RETURNING id, nombre, tipo
		`,
		[normalizedName, normalizedType]
	);

	return inserted.rows[0];
}

async function getProviderAccountsByEmpresa(empresaId) {
	const query = `
		SELECT
			ep.id,
			ep.empresa_id,
			ep.proveedor_id,
			p.nombre AS provider_name,
			p.tipo AS provider_type,
			ep.api_key,
			ep.secret_key,
			ep.configuracion,
			ep.activo
		FROM empresa_proveedores ep
		INNER JOIN proveedores p ON p.id = ep.proveedor_id
		WHERE ep.empresa_id = $1
		ORDER BY p.nombre ASC
	`;

	const { rows } = await pool.query(query, [empresaId]);
	return rows;
}

async function upsertProviderAccountByEmpresa({ empresaId, providerName, providerType, apiKey, secretKey, configuracion, activo }) {
	const provider = await getOrCreateProvider(providerName, providerType);

	const update = await pool.query(
		`
			UPDATE empresa_proveedores
			SET api_key = $1,
				secret_key = $2,
				configuracion = $3,
				activo = $4
			WHERE empresa_id = $5
				AND proveedor_id = $6
			RETURNING id, empresa_id, proveedor_id, api_key, secret_key, configuracion, activo
		`,
		[
			apiKey || null,
			secretKey || null,
			JSON.stringify(configuracion || {}),
			activo !== false,
			empresaId,
			provider.id,
		]
	);

	if (update.rows.length > 0) {
		return {
			...update.rows[0],
			provider_name: provider.nombre,
			provider_type: provider.tipo,
		};
	}

	const insert = await pool.query(
		`
			INSERT INTO empresa_proveedores (empresa_id, proveedor_id, api_key, secret_key, configuracion, activo)
			VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING id, empresa_id, proveedor_id, api_key, secret_key, configuracion, activo
		`,
		[
			empresaId,
			provider.id,
			apiKey || null,
			secretKey || null,
			JSON.stringify(configuracion || {}),
			activo !== false,
		]
	);

	return {
		...insert.rows[0],
		provider_name: provider.nombre,
		provider_type: provider.tipo,
	};
}

async function getPaypalCredentialsByEmpresa(empresaId) {
	const query = `
		SELECT ep.api_key AS client_id, ep.secret_key AS client_secret
		FROM empresa_proveedores ep
		INNER JOIN proveedores p ON p.id = ep.proveedor_id
		WHERE ep.empresa_id = $1 AND LOWER(p.nombre) = 'paypal' AND ep.activo = true
		LIMIT 1;
	`;
	const { rows } = await pool.query(query, [empresaId]);
	if (!rows[0] || !rows[0].client_id || !rows[0].client_secret) return null;
	return { clientId: rows[0].client_id, clientSecret: rows[0].client_secret };
}

async function findPaymentById(paymentId) {
	const query = `
		SELECT id, empresa_id, monto, moneda, estado, proveedor, qr_code, qr_url, clave_idempotencia, descripcion, creado_en, actualizado_en
		FROM pagos
		WHERE id = $1
		LIMIT 1;
	`;
	const { rows } = await pool.query(query, [paymentId]);
	return rows[0] || null;
}

async function findPaymentByIdAndEmpresa(paymentId, empresaId) {
	const query = `
		SELECT id, empresa_id, monto, moneda, estado, proveedor, qr_code, qr_url, clave_idempotencia, descripcion, creado_en, actualizado_en
		FROM pagos
		WHERE id = $1 AND empresa_id = $2
		LIMIT 1;
	`;
	const { rows } = await pool.query(query, [paymentId, empresaId]);
	return rows[0] || null;
}

async function updateQrArtefacts(paymentId, empresaId, qrCode, qrUrl) {
	const query = `
		UPDATE pagos
		SET qr_code = $1,
		    qr_url = $2,
		    actualizado_en = CURRENT_TIMESTAMP
		WHERE id = $3 AND empresa_id = $4
		RETURNING id, qr_code, qr_url;
	`;
	const { rows } = await pool.query(query, [qrCode, qrUrl, paymentId, empresaId]);
	return rows[0] || null;
}

async function getEnabledPaymentMethods(empresaId) {
	const query = `
		SELECT metodos_pago_habilitados
		FROM empresas
		WHERE id = $1
		LIMIT 1;
	`;
	const { rows } = await pool.query(query, [empresaId]);
	return rows[0]?.metodos_pago_habilitados || [];
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
	getRecentPaymentsForTenant,
	getProviderAccountsByEmpresa,
	upsertProviderAccountByEmpresa,
	findPaymentById,
	findPaymentByIdAndEmpresa,
	updateQrArtefacts,
	getEnabledPaymentMethods,
	getPaypalCredentialsByEmpresa,
};
