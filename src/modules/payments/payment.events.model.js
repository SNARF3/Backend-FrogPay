const pool = require('../../config/database');

const getEventsByPaymentId = async (paymentId) => {
  const query = `
    SELECT 
      from_state,
      to_state,
      creado_en AS timestamp
    FROM payment_events
    WHERE payment_id = $1
    ORDER BY creado_en ASC;
  `;

  const { rows } = await pool.query(query, [paymentId]);
  return rows;
};

module.exports = {
  getEventsByPaymentId
};