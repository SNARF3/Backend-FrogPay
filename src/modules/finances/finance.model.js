const pool = require('../../config/database');

const getKpisRango = async (empresaId, desdeDias, hastaDias) => {
  const q = `
    SELECT 
      COALESCE(SUM(monto), 0) AS volumen_procesado,
      COUNT(id) AS pagos_exitosos,
      COALESCE(AVG(monto), 0) AS ticket_promedio
    FROM pagos
    WHERE 
      empresa_id = $1
      AND estado IN ('COMPLETED', 'SUCCESS')
      AND creado_en >= NOW() - INTERVAL '${hastaDias} days'
      AND creado_en < NOW() - INTERVAL '${desdeDias} days';
  `;

  const { rows } = await pool.query(q, [empresaId]);
  return rows[0];
};


const getChartData = async (empresaId, dias) => {
  const q = `
    SELECT 
      DATE(creado_en) as fecha,
      COALESCE(SUM(monto), 0) as ingresos,
      COUNT(id) as transacciones
    FROM pagos
    WHERE 
      empresa_id = $1
      AND estado IN ('COMPLETED', 'SUCCESS')
      AND creado_en >= NOW() - INTERVAL '${dias} days'
    GROUP BY DATE(creado_en)
    ORDER BY DATE(creado_en) ASC;
  `;

  const { rows } = await pool.query(q, [empresaId]);
  return rows;
};


module.exports = { getKpisRango,getChartData };