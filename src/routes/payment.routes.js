const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth.middleware');
const {
    createPayment,
    refundPayment,
    getPaymentStatus,
    registerCard,
    getCards,
} = require('../modules/payments/payment.controller');

// 📌 Registrar tarjeta (PROTEGIDO)
router.post('/cards', authMiddleware, registerCard);

// 📌 Listar tarjetas de la empresa (PROTEGIDO)
router.get('/cards', authMiddleware, getCards);

// 📌 Crear pago
router.post('/', authMiddleware, createPayment);

// 📌 Reembolso
router.post('/:transactionId/refund', authMiddleware, refundPayment);

// 📌 Estado del pago
router.get('/:transactionId/status', authMiddleware, getPaymentStatus);

module.exports = router;