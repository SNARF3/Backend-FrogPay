const paymentModel = require('./payment.model');
const cardModel = require('./card.model');
const paymentOrchestrator = require('./payment.orchestrator');
const { BusinessError } = require('../../utils/errors');
const env = require('../../config/env');
const auditLogger = require('../../utils/auditLogger');
const logger = require('../../utils/logger');
const pool = require('../../config/database');

// ✅ Ambos imports (merge correcto)
const cardService = require('../cards/card.service');
const {
    getPaymentEventsService,
    getTimelineService,
    getTransactionsService,
    getAuditService,
    getErrorsService
} = require('./payment.service');

// Nuevas importaciones para el manejo de tarjetas
const { isLuhnValid, getCardNetwork } = require('../../utils/cardValidator');
const { tokenizeCardMock } = require('../providers/stripe.mock');

function detectCardBrandFromToken(cardToken) {
    const normalized = String(cardToken || '').replace(/\D/g, '');
    if (normalized.startsWith('4')) return 'VISA';
    if (normalized.startsWith('5')) return 'MASTERCARD';
    return 'UNKNOWN';
}

function validatePayload(body) {
    if (!body) return 'Payload inválido';
    const amount = body.monto ?? body.amount;
    const currency = body.moneda ?? body.currency;
    if (amount === undefined || amount === null || Number(amount) <= 0) return 'El campo monto/amount debe ser mayor a 0';
    if (!currency) return 'El campo moneda/currency es obligatorio';
    return null;
}

async function createPayment(req, res) {
    try {
        const validationError = validatePayload(req.body);
        if (validationError) {
            return res.status(400).json({ error: validationError });
        }

        const empresaId = req.empresaId;
        const proveedor = req.body.proveedor || req.body.provider || req.body.paymentProvider || env.DEFAULT_PROVIDER || 'mock';
        const monto = req.body.monto ?? req.body.amount;
        const moneda = req.body.moneda ?? req.body.currency;
        const claveIdempotencia = req.body.clave_idempotencia || req.body.idempotencyKey || null;
        const descripcion = req.body.descripcion ?? req.body.description ?? null;
        const token = req.body.card_token ?? req.body.token ?? req.body.paymentToken ?? null;
        const cardBrand = proveedor === 'card' ? detectCardBrandFromToken(token) : null;

        if (proveedor === 'card' && !token) {
            return res.status(400).json({
                error: 'El campo card_token es obligatorio cuando provider es card',
                code: 'CARD_TOKEN_REQUIRED',
            });
        }

        let tokenData = null;
        if (proveedor === 'card' && token) {
            tokenData = await cardService.consumeToken(token);
            if (!tokenData) {
                return res.status(400).json({
                    error: 'Token inválido o expirado',
                    code: 'INVALID_TOKEN',
                });
            }
        }

        if (claveIdempotencia) {
            const existingPayment = await paymentModel.findByIdempotency(
                empresaId,
                claveIdempotencia
            );

            if (existingPayment) {
                return res.status(200).json({
                    payment_id: existingPayment.id,
                    estado: existingPayment.estado,
                    proveedor: existingPayment.proveedor,
                    idempotent_replay: true,
                });
            }
        }

        const payment = await paymentModel.createPayment({
            empresaId,
            monto,
            moneda,
            estado: 'INITIATED',
            proveedor,
            claveIdempotencia,
            descripcion,
            cardBrand,
        });

        await auditLogger.recordPaymentEvent({
            empresaId,
            paymentId: payment.id,
            from: null,
            to: 'INITIATED',
            provider: proveedor,
        });

        const result = await paymentOrchestrator.processPayment({
            empresaId,
            proveedor,
            payment,
            token,
            metadata: req.body.metadata || {},
        });

        return res.status(201).json({
            payment_id: result.paymentId,
            estado: result.status,
            proveedor: result.provider,
            card_brand: payment.card_brand || cardBrand,
            id_transaccion_proveedor: result.providerTransactionId,
            mensaje: result.message,
        });
    } catch (error) {
        logger.error(`createPayment: ${error.message}`);

        if (error instanceof BusinessError) {
            return res.status(error.statusCode).json({
                error: error.message,
                code: error.code,
            });
        }

        return res.status(error.statusCode || 500).json({
            error: error.message || 'Error interno al procesar el pago',
            code: error.code || 'INTERNAL_ERROR',
        });
    }
}

async function getPaymentStatus(req, res) {
    try {
        const { transactionId } = req.params;
        const proveedor = req.query.proveedor || req.query.provider;

        if (!proveedor || !transactionId) {
            return res.status(400).json({
                error: 'proveedor y transactionId son requeridos',
            });
        }

        const result = await paymentOrchestrator.getPaymentStatus({
            proveedor,
            transactionId,
        });

        return res.status(200).json(result);
    } catch (error) {
        logger.error(`getPaymentStatus: ${error.message}`);

        return res.status(error.statusCode || 500).json({
            error: error.message,
        });
    }
}

async function registerCard(req, res) {
    try {
        const empresaId = req.empresaId;
        const { card_number, cvv, expiry, holder_name } = req.body;

        if (!card_number || !cvv || !expiry) {
            return res.status(400).json({
                error: 'card_number, cvv y expiry son obligatorios',
            });
        }

        if (!isLuhnValid(card_number)) {
            return res.status(400).json({ error: 'Número de tarjeta inválido' });
        }

        const network = getCardNetwork(card_number);
        const tokenResult = await tokenizeCardMock(card_number);

        const saved = await cardModel.saveCardToken({
            empresaId,
            tokenProveedor: tokenResult.token,
            ultimosCuatro: card_number.slice(-4),
            red: network,
            tipo: 'credit',
        });

        return res.status(201).json({
            message: 'Tarjeta registrada correctamente',
            card: {
                id: saved.id,
                last4: saved.ultimos_cuatro,
                network: saved.red,
                type: saved.tipo,
            },
        });
    } catch (error) {
        logger.error(`registerCard: ${error.message}`);
        return res.status(500).json({ error: 'Error al registrar la tarjeta' });
    }
}

async function getCards(req, res) {
    try {
        const empresaId = req.empresaId;
        const cards = await paymentModel.getCardsByEmpresa(empresaId);

        return res.status(200).json({ cards });
    } catch (error) {
        logger.error(`getCards: ${error.message}`);
        return res.status(500).json({ error: 'Error al obtener tarjetas' });
    }
}

async function getPaymentEventsController(req, res) {
    try {
        const { id } = req.params;
        const empresaId = req.empresaId;
        const events = await getPaymentEventsService(id, empresaId);
        return res.status(200).json({ events });
    } catch (error) {
        if (error.message === 'NOT_FOUND') {
            return res.status(404).json({ error: 'Pago no encontrado' });
        }
        logger.error(`getPaymentEventsController: ${error.message}`);
        return res.status(500).json({ error: 'Error interno' });
    }
}

async function getTimelineController(req, res) {
    try {
        const { id } = req.params;
        const empresaId = req.empresaId;
        const timeline = await getTimelineService(id, empresaId);
        return res.status(200).json(timeline);
    } catch (error) {
        if (error.message === 'NOT_FOUND') {
            return res.status(404).json({ error: 'Pago no encontrado' });
        }
        logger.error(`getTimelineController: ${error.message}`);
        return res.status(500).json({ error: 'Error interno' });
    }
}

async function getTransactionsController(req, res) {
    try {
        const { id } = req.params;
        const empresaId = req.empresaId;
        const transactions = await getTransactionsService(id, empresaId);
        return res.status(200).json({ transactions });
    } catch (error) {
        if (error.message === 'NOT_FOUND') {
            return res.status(404).json({ error: 'Pago no encontrado' });
        }
        logger.error(`getTransactionsController: ${error.message}`);
        return res.status(500).json({ error: 'Error interno' });
    }
}

async function getAuditController(req, res) {
    try {
        const { id } = req.params;
        const empresaId = req.empresaId;
        const audit = await getAuditService(id, empresaId);
        return res.status(200).json({ audit });
    } catch (error) {
        if (error.message === 'NOT_FOUND') {
            return res.status(404).json({ error: 'Pago no encontrado' });
        }
        logger.error(`getAuditController: ${error.message}`);
        return res.status(500).json({ error: 'Error interno' });
    }
}

async function getErrorsController(req, res) {
    try {
        const { id } = req.params;
        const empresaId = req.empresaId;
        const errors = await getErrorsService(id, empresaId);
        return res.status(200).json({ errors });
    } catch (error) {
        if (error.message === 'NOT_FOUND') {
            return res.status(404).json({ error: 'Pago no encontrado' });
        }
        logger.error(`getErrorsController: ${error.message}`);
        return res.status(500).json({ error: 'Error interno' });
    }
}

async function refundPayment(req, res) {
    const proveedor = req.body.proveedor || req.body.provider;
    const transactionId = req.body.transactionId;
    const monto = req.body.monto ?? req.body.amount;

    if (!proveedor || !transactionId) {
        return res.status(400).json({
            error: 'proveedor y transactionId son requeridos',
        });
    }

    try {
        const result = await paymentOrchestrator.processRefund({
            proveedor,
            transactionId,
            monto,
        });

        return res.status(200).json(result);
    } catch (error) {
        logger.error(`refundPayment: ${error.message}`);

        return res.status(error.statusCode || 500).json({
            error: error.message,
        });
    }
}

module.exports = {
    createPayment,
    refundPayment,
    getPaymentStatus,
    registerCard,
    getCards,
    getPaymentEventsController,
    getTimelineController,
    getTransactionsController,
    getAuditController,
    getErrorsController,
};
