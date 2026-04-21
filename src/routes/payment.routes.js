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
	getPaymentsMonitor,
    getProviderAccounts,
    upsertProviderAccount,
    getExchangeRate,
    getCurrencyConfig,
    updateCurrencyConfig,
    verifyPaypalCredentials,
    handlePaypalReturn,
    handlePaypalCancel,
} = require('../modules/payments/payment.controller');
const {
    getPaymentsController,
    getPaymentDetailController,
} = require('../modules/finances/finance.controller');

// 📌 Callbacks públicos de PayPal (sin auth — redirigidos por PayPal tras aprobación)
router.get('/paypal/return', handlePaypalReturn);
router.get('/paypal/cancel', handlePaypalCancel);

router.use(authMiddleware, tenantRateLimit);

// 📌 Registrar tarjeta (PROTEGIDO)
router.post('/cards', registerCard);

// 📌 Listar tarjetas de la empresa (PROTEGIDO)
router.get('/cards', getCards);

// 📌 PayPal explícito (flujo approve/capture)
router.post('/paypal/create-order', createPayPalOrder);
router.post('/paypal/capture-order', capturePayPalOrder);

// 📌 Configuración de moneda operativa + tipo de cambio
router.get('/currency-config', getCurrencyConfig);
router.put('/currency-config', updateCurrencyConfig);

// 📌 Health check de pagos
router.get('/health-check', paymentHealthCheck);

// 📌 Monitor de pagos + estado de entrega de webhooks
router.get('/monitor', getPaymentsMonitor);

// 📌 Listado de transacciones para dashboard (HU-19)
router.get('/', getPaymentsController);

// 📌 Configuración de cuentas de cobro por tenant
router.get('/provider-accounts', getProviderAccounts);
router.put('/provider-accounts/:provider', upsertProviderAccount);

// 📌 Verificar credenciales PayPal del tenant
router.get('/paypal/verify-credentials', verifyPaypalCredentials);

// 📌 Obtener tipo de cambio
router.get('/exchange-rate', getExchangeRate);

// 📌 Crear pago
router.post('/', createPayment);

// 📌 Reembolso
router.post('/:transactionId/refund', refundPayment);

// 📌 Estado del pago
router.get('/:transactionId/status', getPaymentStatus);

// 📌 Consulta detallada de pago por ID
router.get('/:id', getPaymentDetailController);

module.exports = router;
