const express = require('express');
const router = express.Router();
const { createPayment, refundPayment, getPaymentStatus, createPaypalOrder, capturePaypalOrder } = require('../modules/payments/payment.controller');

router.get('/health-check', (_req, res) => res.json({ ok: true }));
router.post('/paypal/create-order', createPaypalOrder);
router.post('/paypal/capture-order', capturePaypalOrder);
router.post('/', createPayment);
router.post('/:transactionId/refund', refundPayment);
router.get('/:transactionId/status', getPaymentStatus);

module.exports = router;
