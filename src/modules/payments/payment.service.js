const { getEventsByPaymentId } = require('./payment.events.model');
const { getTransactionsByPaymentId } = require('./payment.transactions.model');
const { getAuditByPaymentId } = require('./payment.audit.model');
const { getErrorsByPaymentId } = require('./payment.errors.model');
const pool = require('../../config/database');

const getPaymentEventsService = async (paymentId, empresaId) => {

  const paymentQuery = `
    SELECT id, empresa_id
    FROM pagos
    WHERE id = $1;
  `;

  const { rows } = await pool.query(paymentQuery, [paymentId]);

  const payment = rows[0];

  if (!payment || payment.empresa_id !== empresaId) {
    throw new Error("NOT_FOUND");
  }


  const events = await getEventsByPaymentId(paymentId);

  return events;
};
const validateOwnership = async (paymentId, empresaId) => {
  const q = `SELECT id, empresa_id FROM pagos WHERE id = $1`;
  const { rows } = await pool.query(q, [paymentId]);
  const payment = rows[0];

  if (!payment || payment.empresa_id !== empresaId) {
    throw new Error("NOT_FOUND");
  }
};

const getTimelineService = async (paymentId, empresaId) => {
  await validateOwnership(paymentId, empresaId);

  const [events, transactions] = await Promise.all([
    getEventsByPaymentId(paymentId),
    getTransactionsByPaymentId(paymentId)
  ]);

  return {
    events,
    transactions
  };
};

const getTransactionsService = async (paymentId, empresaId) => {
  await validateOwnership(paymentId, empresaId);
  return getTransactionsByPaymentId(paymentId);
};

const getAuditService = async (paymentId, empresaId) => {
  await validateOwnership(paymentId, empresaId);
  return getAuditByPaymentId(paymentId);
};

const getErrorsService = async (paymentId, empresaId) => {
  await validateOwnership(paymentId, empresaId);
  return getErrorsByPaymentId(paymentId);
};


module.exports = {
  getPaymentEventsService,
    getTimelineService,
    getTransactionsService,
    getAuditService,
    getErrorsService
};