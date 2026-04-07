const express = require('express');
const router = express.Router();

const { authMiddleware } = require('../middlewares/auth.middleware');
const {
	createPayment,
	refundPayment,
	getPaymentStatus,
} = require('../modules/payments/payment.controller');

// 🔐 Todas las rutas protegidas
router.use(authMiddleware);

// 💳 Crear pago
router.post('/', createPayment);

// 🔁 Reembolso
router.post('/:transactionId/refund', refundPayment);

// 🔍 Estado del pago
router.get('/:transactionId/status', getPaymentStatus);

module.exports = router;