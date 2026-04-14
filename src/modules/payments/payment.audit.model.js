const pool = require('../../config/database');

const getAuditByPaymentId = async (paymentId) => {
  const q = `
    SELECT 
      accion,
      entidad,
      creado_en AS timestamp,
      metadata
    FROM auditoria
    WHERE entidad_id = $1
      AND entidad = 'payment'
    ORDER BY creado_en ASC;
  `;
  const { rows } = await pool.query(q, [paymentId]);
  return rows;
};

module.exports = { getAuditByPaymentId };