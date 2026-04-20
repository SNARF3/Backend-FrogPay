const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth.middleware');
const { tenantRateLimit } = require('../middlewares/rateLimit.middleware');
const {
    createPayment,
    refundPayment,
    getPaymentStatus,
    getPaymentById,
    registerCard,
    getCards,
    createPayPalOrder,
    capturePayPalOrder,
    paymentHealthCheck,
    getStripeConfig,
	getPaymentsMonitor,
    getProviderAccounts,
    upsertProviderAccount,
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

// 📌 Monitor de pagos + estado de entrega de webhooks
router.get('/monitor', getPaymentsMonitor);

// 📌 Configuración de cuentas de cobro por tenant (mock/simulado)
router.get('/provider-accounts', getProviderAccounts);
router.put('/provider-accounts/:provider', upsertProviderAccount);

// 📌 Crear pago
router.post('/', createPayment);

// 📌 Reembolso
router.post('/:transactionId/refund', refundPayment);

// 📌 Estado del pago
router.get('/:transactionId/status', getPaymentStatus);

// 📌 Consulta de pago por ID interno (polling QR)
router.get('/:id', getPaymentById);

module.exports = router;