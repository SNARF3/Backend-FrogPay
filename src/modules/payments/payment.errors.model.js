const pool = require('../../config/database');

const getErrorsByPaymentId = async (paymentId) => {
  const q = `
    SELECT 
      error_code,
      error_message,
      creado_en AS timestamp
    FROM payment_events
    WHERE payment_id = $1
      AND error_code IS NOT NULL
    ORDER BY creado_en ASC;
  `;
  const { rows } = await pool.query(q, [paymentId]);
  return rows;
};

module.exports = { getErrorsByPaymentId };