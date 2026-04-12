const orchestrator = require('./payment.orchestrator');
const logger = require('../../utils/logger');

async function createPayment(req, res) {
  const {
    provider,
    amount, monto,
    currency, moneda,
    description, descripcion,
    cardNumber,
  } = req.body;

  const resolvedAmount   = amount   ?? monto;
  const resolvedCurrency = currency ?? moneda;
  const resolvedDesc     = description ?? descripcion;

  if (!provider || !resolvedAmount || !resolvedCurrency) {
    return res.status(400).json({ error: 'provider, amount y currency son requeridos' });
  }

  try {
    const result = await orchestrator.processPayment({
      provider,
      amount: resolvedAmount,
      currency: resolvedCurrency,
      description: resolvedDesc,
      cardNumber,
    });
    return res.status(201).json({
      ...result,
      payment_id: result.transactionId,
      estado: result.status,
      mensaje: 'Pago procesado exitosamente',
    });
  } catch (err) {
    logger.error(`createPayment: ${err.message}`);
    return res.status(err.statusCode || 500).json({
      error: err.message,
      estado: 'FAILED',
      raw: err.raw || null,
    });
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

async function createPaypalOrder(req, res) {
  const { amount, currency, description } = req.body;

  if (!amount || !currency) {
    return res.status(400).json({ error: 'amount y currency son requeridos' });
  }

  try {
    const registry = require('../providers/provider.registry');
    const paypal = registry.getProvider('paypal');
    const result = await paypal.createOrder({
      amount: parseFloat(amount),
      currency,
      description: description || 'Pago FrogPay',
    });
    return res.status(201).json(result);
  } catch (err) {
    logger.error(`createPaypalOrder: ${err.message}`);
    return res.status(err.statusCode || 500).json({ error: err.message, raw: err.raw });
  }
}

async function capturePaypalOrder(req, res) {
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: 'orderId es requerido' });
  }

  try {
    const registry = require('../providers/provider.registry');
    const paypal = registry.getProvider('paypal');
    const result = await paypal.captureOrder(orderId);
    return res.status(200).json({
      ...result,
      payment_id: result.transactionId,
      estado: result.status,
      mensaje: 'Pago capturado exitosamente',
    });
  } catch (err) {
    logger.error(`capturePaypalOrder: ${err.message}`);
    return res.status(err.statusCode || 500).json({ error: err.message, raw: err.raw });
  }
}

module.exports = { createPayment, refundPayment, getPaymentStatus, createPaypalOrder, capturePaypalOrder };
