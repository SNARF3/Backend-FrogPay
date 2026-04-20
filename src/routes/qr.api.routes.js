const express = require('express');
const router = express.Router();
const qrController = require('../modules/qr/qr.controller');

router.get('/:paymentId/status', qrController.getQrPaymentStatus);
router.post('/:paymentId/confirm', qrController.confirmQrPayment);
router.post('/:paymentId/fail', qrController.failQrPayment);

module.exports = router;
