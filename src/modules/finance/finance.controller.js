const pool = require('../../config/database');

function getRangeConfig(rango) {
  switch (String(rango || '7d').toLowerCase()) {
    case '24h':
      return { label: '24h', hours: 24 };
    case '30d':
      return { label: '30d', hours: 24 * 30 };
    case '7d':
    default:
      return { label: '7d', hours: 24 * 7 };
  }
}

function growth(current, previous) {
  if (!previous || Number(previous) === 0) {
    return current > 0 ? 100 : 0;
  }
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

async function getStatsForPeriod(empresaId, fromHours, toHours) {
  const query = `
    SELECT
      COUNT(*)::int AS total_pagos,
      COALESCE(SUM(monto), 0)::numeric AS total_monto,
      COALESCE(AVG(monto), 0)::numeric AS ticket_promedio
    FROM pagos
    WHERE empresa_id = $1
      AND estado = 'COMPLETED'
      AND creado_en >= NOW() - (($2 || ' hours')::interval)
      AND creado_en < NOW() - (($3 || ' hours')::interval)
  `;

  const { rows } = await pool.query(query, [empresaId, fromHours, toHours]);
  return rows[0] || { total_pagos: 0, total_monto: 0, ticket_promedio: 0 };
}

async function getKpis(req, res) {
  try {
    const empresaId = req.empresaId;
    const config = getRangeConfig(req.query.rango);

    const current = await getStatsForPeriod(empresaId, config.hours, 0);
    const previous = await getStatsForPeriod(empresaId, config.hours * 2, config.hours);

    const totalMontoCurrent = Number(current.total_monto || 0);
    const totalMontoPrevious = Number(previous.total_monto || 0);

    const totalPagosCurrent = Number(current.total_pagos || 0);
    const totalPagosPrevious = Number(previous.total_pagos || 0);

    const ticketCurrent = Number(current.ticket_promedio || 0);
    const ticketPrevious = Number(previous.ticket_promedio || 0);

    return res.status(200).json({
      rango: config.label,
      data: {
        volumenProcesado: {
          valor: totalMontoCurrent,
          crecimientoPorcentaje: growth(totalMontoCurrent, totalMontoPrevious),
        },
        pagosExitosos: {
          valor: totalPagosCurrent,
          crecimientoPorcentaje: growth(totalPagosCurrent, totalPagosPrevious),
        },
        ticketPromedio: {
          valor: Number(ticketCurrent.toFixed(2)),
          crecimientoPorcentaje: growth(ticketCurrent, ticketPrevious),
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'No se pudieron obtener KPIs',
      code: 'FINANCE_KPI_FAILED',
    });
  }
}

module.exports = {
  getKpis,
};
