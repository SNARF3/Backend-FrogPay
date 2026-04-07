const express = require('express');
const router = express.Router();
const { createPayment, refundPayment, getPaymentStatus } = require('../modules/payments/payment.controller');

router.post('/', createPayment);
router.post('/:transactionId/refund', refundPayment);
router.get('/:transactionId/status', getPaymentStatus);

module.exports = router;
