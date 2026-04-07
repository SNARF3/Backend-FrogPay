const orchestrator = require('./payment.orchestrator');
const logger = require('../../utils/logger');

async function createPayment(req, res) {
  const { provider, amount, currency, description } = req.body;

  if (!provider || !amount || !currency) {
    return res.status(400).json({ error: 'provider, amount, and currency are required' });
  }

  try {
    const result = await orchestrator.processPayment({ provider, amount, currency, description });
    return res.status(201).json(result);
  } catch (err) {
    logger.error(`createPayment: ${err.message}`);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

async function refundPayment(req, res) {
  const { transactionId } = req.params;
  const { provider, amount } = req.body;

  if (!provider || !transactionId) {
    return res.status(400).json({ error: 'provider and transactionId are required' });
  }

  try {
    const result = await orchestrator.processRefund({ provider, transactionId, amount });
    return res.status(200).json(result);
  } catch (err) {
    logger.error(`refundPayment: ${err.message}`);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

async function getPaymentStatus(req, res) {
  const { transactionId } = req.params;
  const { provider } = req.query;

  if (!provider || !transactionId) {
    return res.status(400).json({ error: 'provider and transactionId are required' });
  }

  try {
    const result = await orchestrator.getPaymentStatus({ provider, transactionId });
    return res.status(200).json(result);
  } catch (err) {
    logger.error(`getPaymentStatus: ${err.message}`);
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

module.exports = { createPayment, refundPayment, getPaymentStatus };
