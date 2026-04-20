const pool = require('../../config/database');

const SUCCESS_STATES = ['COMPLETED', 'SUCCESS'];

function buildSnapshotFilters(empresaId, filters = {}) {
  const clauses = ['p.empresa_id = $1'];
  const values = [empresaId];

  if (filters.proveedor) {
    values.push(String(filters.proveedor).trim().toLowerCase());
    clauses.push(`LOWER(p.proveedor) = $${values.length}`);
  }

  if (filters.estado) {
    values.push(String(filters.estado).trim().toUpperCase());
    clauses.push(`p.estado = $${values.length}`);
  }

  if (filters.dateFrom) {
    values.push(filters.dateFrom);
    clauses.push(`p.creado_en >= $${values.length}`);
  }

  if (filters.dateTo) {
    values.push(filters.dateTo);
    clauses.push(`p.creado_en <= $${values.length}`);
  }

  return { clauses, values };
}

const getFinanceSnapshot = async (empresaId, filters = {}) => {
  const { clauses, values } = buildSnapshotFilters(empresaId, filters);

  values.push(SUCCESS_STATES);
  const successStatesIdx = values.length;

  const query = `
    WITH base AS (
      SELECT
        p.id,
        p.monto,
        p.estado,
        p.proveedor,
        p.creado_en
      FROM pagos p
      WHERE ${clauses.join(' AND ')}
    ),
    kpis AS (
      SELECT
        COALESCE(SUM(monto) FILTER (WHERE estado = ANY($${successStatesIdx}::text[])), 0)::numeric AS ingresos,
        COUNT(*)::int AS transacciones,
        CASE
          WHEN COUNT(*) = 0 THEN 0::numeric
          ELSE ROUND((COUNT(*) FILTER (WHERE estado = ANY($${successStatesIdx}::text[]))::numeric * 100) / COUNT(*), 2)
        END AS success_rate,
        COALESCE(AVG(monto) FILTER (WHERE estado = ANY($${successStatesIdx}::text[])), 0)::numeric AS ticket_promedio
      FROM base
    ),
    chart AS (
      SELECT
        DATE(creado_en) AS fecha,
        COALESCE(SUM(monto) FILTER (WHERE estado = ANY($${successStatesIdx}::text[])), 0)::numeric AS ingresos,
        COUNT(*)::int AS transacciones
      FROM base
      GROUP BY DATE(creado_en)
      ORDER BY fecha ASC
    ),
    providers AS (
      SELECT
        COALESCE(LOWER(proveedor), 'desconocido') AS proveedor,
        COALESCE(SUM(monto) FILTER (WHERE estado = ANY($${successStatesIdx}::text[])), 0)::numeric AS monto
      FROM base
      GROUP BY COALESCE(LOWER(proveedor), 'desconocido')
      ORDER BY monto DESC
    )
    SELECT
      (SELECT row_to_json(kpis) FROM kpis) AS kpis,
      (SELECT COALESCE(json_agg(chart), '[]'::json) FROM chart) AS chart,
      (SELECT COALESCE(json_agg(providers), '[]'::json) FROM providers) AS providers;
  `;

  const { rows } = await pool.query(query, values);
  return rows[0] || null;
};

async function getConfiguredProviders(empresaId) {
  const providers = new Set();

  const tenantMethodsQuery = `
    SELECT COALESCE(metodos_pago_habilitados, ARRAY[]::text[]) AS methods
    FROM empresas
    WHERE id = $1
    LIMIT 1;
  `;

  const tenantMethods = await pool.query(tenantMethodsQuery, [empresaId]);
  const methods = tenantMethods.rows[0]?.methods || [];

  methods
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean)
    .forEach((item) => providers.add(item));

  const providerAccountsQuery = `
    SELECT LOWER(p.nombre) AS provider_name
    FROM empresa_proveedores ep
    INNER JOIN proveedores p ON p.id = ep.proveedor_id
    WHERE ep.empresa_id = $1
      AND ep.activo = TRUE;
  `;

  try {
    const providerAccounts = await pool.query(providerAccountsQuery, [empresaId]);
    providerAccounts.rows
      .map((row) => String(row.provider_name || '').trim().toLowerCase())
      .filter(Boolean)
      .forEach((item) => providers.add(item));
  } catch (error) {
    if (error.code !== '42P01') {
      throw error;
    }
  }

  return Array.from(providers);
}

module.exports = {
  getFinanceSnapshot,
  getConfiguredProviders,
};
