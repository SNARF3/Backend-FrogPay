const pool = require('../../config/database');

const SORT_COLUMN_MAP = {
  fecha: 'p.creado_en',
  created_at: 'p.creado_en',
  monto: 'p.monto',
  estado: 'p.estado',
  proveedor: 'p.proveedor',
};

const SORT_ORDER_MAP = {
  asc: 'ASC',
  desc: 'DESC',
};

function normalizeSortColumn(value) {
  const key = String(value || 'fecha').toLowerCase();
  return SORT_COLUMN_MAP[key] || SORT_COLUMN_MAP.fecha;
}

function normalizeSortOrder(value) {
  const key = String(value || 'desc').toLowerCase();
  return SORT_ORDER_MAP[key] || SORT_ORDER_MAP.desc;
}

const getKpisRango = async (empresaId, desdeDias, hastaDias) => {
  const query = `
    SELECT
      COALESCE(SUM(monto), 0) AS volumen_procesado,
      COUNT(id) AS pagos_exitosos,
      COALESCE(AVG(monto), 0) AS ticket_promedio
    FROM pagos
    WHERE
      empresa_id = $1
      AND estado IN ('COMPLETED', 'SUCCESS')
      AND creado_en >= NOW() - ($2 * INTERVAL '1 day')
      AND creado_en < NOW() - ($3 * INTERVAL '1 day');
  `;

  const { rows } = await pool.query(query, [empresaId, hastaDias, desdeDias]);
  return rows[0];
};

const getChartData = async (empresaId, dias) => {
  const query = `
    SELECT
      DATE(creado_en) AS fecha,
      COALESCE(SUM(monto), 0) AS ingresos,
      COUNT(id) AS transacciones
    FROM pagos
    WHERE
      empresa_id = $1
      AND estado IN ('COMPLETED', 'SUCCESS')
      AND creado_en >= NOW() - ($2 * INTERVAL '1 day')
    GROUP BY DATE(creado_en)
    ORDER BY DATE(creado_en) ASC;
  `;

  const { rows } = await pool.query(query, [empresaId, dias]);
  return rows;
};

async function getPaymentsListByEmpresa({
  empresaId,
  paymentId,
  estado,
  proveedor,
  dateFrom,
  dateTo,
  limit,
  offset,
  sortBy,
  sortOrder,
}) {
  const filters = ['p.empresa_id = $1'];
  const values = [empresaId];

  if (paymentId) {
    values.push(`%${paymentId}%`);
    filters.push(`p.id::text ILIKE $${values.length}`);
  }

  if (estado) {
    values.push(String(estado).trim().toUpperCase());
    filters.push(`p.estado = $${values.length}`);
  }

  if (proveedor) {
    values.push(String(proveedor).trim().toLowerCase());
    filters.push(`LOWER(p.proveedor) = $${values.length}`);
  }

  if (dateFrom) {
    values.push(dateFrom);
    filters.push(`p.creado_en >= $${values.length}`);
  }

  if (dateTo) {
    values.push(dateTo);
    filters.push(`p.creado_en <= $${values.length}`);
  }

  values.push(limit);
  const limitIndex = values.length;
  values.push(offset);
  const offsetIndex = values.length;

  const orderColumn = normalizeSortColumn(sortBy);
  const orderDirection = normalizeSortOrder(sortOrder);

  const query = `
    SELECT
      p.id AS payment_id,
      p.monto,
      p.moneda,
      p.estado,
      p.proveedor,
      p.creado_en,
      p.actualizado_en,
      tx.id_transaccion_proveedor AS provider_transaction_id,
      COUNT(*) OVER()::int AS total_count
    FROM pagos p
    LEFT JOIN LATERAL (
      SELECT
        t.id_transaccion_proveedor
      FROM transacciones t
      WHERE t.pago_id = p.id
      ORDER BY t.creado_en DESC
      LIMIT 1
    ) tx ON TRUE
    WHERE ${filters.join(' AND ')}
    ORDER BY ${orderColumn} ${orderDirection}, p.id DESC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex};
  `;

  const { rows } = await pool.query(query, values);

  return {
    rows,
    total: rows[0] ? Number(rows[0].total_count) : 0,
  };
}

async function getPaymentDetailById({ empresaId, paymentId }) {
  const query = `
    SELECT
      p.id,
      p.empresa_id,
      p.monto,
      p.moneda,
      p.estado,
      p.proveedor,
      p.descripcion,
      p.qr_code,
      p.qr_url,
      p.clave_idempotencia,
      p.creado_en,
      p.actualizado_en,
      p.original_amount,
      p.original_currency,
      p.exchange_rate,
      p.converted_amount,
      p.base_currency,
      p.exchange_rate_timestamp,
      tx.id_transaccion_proveedor AS provider_transaction_id,
      tx.codigo_respuesta AS provider_response_code,
      tx.mensaje_respuesta AS provider_response_message
    FROM pagos p
    LEFT JOIN LATERAL (
      SELECT
        t.id_transaccion_proveedor,
        t.codigo_respuesta,
        t.mensaje_respuesta
      FROM transacciones t
      WHERE t.pago_id = p.id
      ORDER BY t.creado_en DESC
      LIMIT 1
    ) tx ON TRUE
    WHERE p.id = $1
      AND p.empresa_id = $2
    LIMIT 1;
  `;

  const { rows } = await pool.query(query, [paymentId, empresaId]);
  return rows[0] || null;
}

async function getPaymentEventsHistory(paymentId) {
  const query = `
    SELECT
      from_state,
      to_state,
      provider,
      provider_transaction_id,
      error_code,
      error_message,
      metadata,
      creado_en
    FROM payment_events
    WHERE payment_id = $1
    ORDER BY creado_en ASC;
  `;

  const { rows } = await pool.query(query, [paymentId]);
  return rows;
}

async function getPaymentProviderTransactions(paymentId) {
  const query = `
    SELECT
      id,
      id_transaccion_proveedor,
      estado,
      codigo_respuesta,
      mensaje_respuesta,
      creado_en
    FROM transacciones
    WHERE pago_id = $1
    ORDER BY creado_en ASC;
  `;

  const { rows } = await pool.query(query, [paymentId]);
  return rows;
}

module.exports = {
  getKpisRango,
  getChartData,
  getPaymentsListByEmpresa,
  getPaymentDetailById,
  getPaymentEventsHistory,
  getPaymentProviderTransactions,
};
