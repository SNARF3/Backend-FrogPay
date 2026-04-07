const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth.middleware');
const { createPayment } = require('../modules/payments/payment.controller');

// Toda ruta de pagos usa el middleware automáticamente
router.use(authMiddleware);

// Ruta final: POST /api/payments
router.post('/', createPayment);

module.exports = router;