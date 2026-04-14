const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth.middleware');
const { tenantRateLimit } = require('../middlewares/rateLimit.middleware');
const {
    createPayment,
    refundPayment,
    getPaymentStatus,
    registerCard,
    getCards,
    createPayPalOrder,
    capturePayPalOrder,
    paymentHealthCheck,
    getStripeConfig,
} = require('../modules/payments/payment.controller');

router.use(authMiddleware, tenantRateLimit);

// 📌 Registrar tarjeta (PROTEGIDO)
router.post('/cards', registerCard);

// 📌 Listar tarjetas de la empresa (PROTEGIDO)
router.get('/cards', getCards);

// 📌 PayPal explícito (flujo approve/capture)
router.post('/paypal/create-order', createPayPalOrder);
router.post('/paypal/capture-order', capturePayPalOrder);

// 📌 Configuración pública para frontend (Stripe)
router.get('/config/stripe', getStripeConfig);

// 📌 Health check de pagos
router.get('/health-check', paymentHealthCheck);

// 📌 Crear pago
router.post('/', createPayment);

// 📌 Reembolso
router.post('/:transactionId/refund', refundPayment);

// 📌 Estado del pago
router.get('/:transactionId/status', getPaymentStatus);

module.exports = router;