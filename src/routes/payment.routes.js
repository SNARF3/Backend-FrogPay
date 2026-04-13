const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth.middleware');
const {
    createPayment,
    refundPayment,
    getPaymentStatus,
    registerCard,
    getCards,
    createPaypalOrder,
    capturePaypalOrder
} = require('../modules/payments/payment.controller');

/**
 * 🛠 Check de Salud
 */
router.get('/health-check', (_req, res) => res.json({ ok: true }));

/**
 * 💳 Gestión de Tarjetas (Protegido)
 */
// Registrar tarjeta (Tokenización)
router.post('/cards', authMiddleware, registerCard);

// Listar tarjetas de la empresa
router.get('/cards', authMiddleware, getCards);

/**
 * 💰 Flujo de Pagos Estándar (Protegido)
 */
// Crear pago (Orquestado)
router.post('/', authMiddleware, createPayment);

// Reembolso de pago
router.post('/:transactionId/refund', authMiddleware, refundPayment);

// Estado del pago
router.get('/:transactionId/status', authMiddleware, getPaymentStatus);

/**
 * 🅿️ Flujo Específico de PayPal (Protegido)
 */
// Crear orden en PayPal
router.post('/paypal/create-order', authMiddleware, createPaypalOrder);

// Capturar orden de PayPal
router.post('/paypal/capture-order', authMiddleware, capturePaypalOrder);

module.exports = router;