const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth.middleware');
const {
    createPayment,
    refundPayment,
    getPaymentStatus,
    registerCard,
    getCards,
    getPaymentEventsController,
    getTimelineController,
    getTransactionsController,
    getAuditController,
    getErrorsController

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

router.get('/payments/:id/events', authMiddleware, getPaymentEventsController);
router.get('/payments/:id/timeline', authMiddleware, getTimelineController);
router.get('/payments/:id/transactions', authMiddleware, getTransactionsController);
router.get('/payments/:id/audit', authMiddleware, getAuditController);
router.get('/payments/:id/errors', authMiddleware, getErrorsController);
module.exports = router;