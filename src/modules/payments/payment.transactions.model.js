const pool = require('../../config/database');

const getTransactionsByPaymentId = async (paymentId) => {
  const q = `
    SELECT 
      id,
      estado,
      codigo_respuesta,
      mensaje_respuesta,
      creado_en AS timestamp
    FROM transacciones
    WHERE payment_id = $1
    ORDER BY creado_en ASC;
  `;
  const { rows } = await pool.query(q, [paymentId]);
  return rows;
};

module.exports = { getTransactionsByPaymentId };