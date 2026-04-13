const paymentModel = require('./payment.model');
const cardModel = require('./card.model');
const paymentOrchestrator = require('./payment.orchestrator');
const { BusinessError } = require('../../utils/errors');
const env = require('../../config/env');
const auditLogger = require('../../utils/auditLogger');
const logger = require('../../utils/logger');
const pool = require('../../config/database');

// Nuevas importaciones para el manejo de tarjetas
const { isLuhnValid, getCardNetwork } = require('../../utils/cardValidator');
const { tokenizeCardMock } = require('../providers/stripe.mock');

/**
 * UTILS
 */
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

/**
 * HANDLERS
 */

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
        const descripcion = req.body.descripcion ?? req.body.description ?? 'Pago FrogPay';
        const token = req.body.card_token ?? req.body.token ?? req.body.paymentToken ?? req.body.cardNumber ?? null;
        
        const cardBrand = (proveedor === 'card' || proveedor === 'stripe') ? detectCardBrandFromToken(token) : null;

        if ((proveedor === 'card' || proveedor === 'stripe') && !token) {
            return res.status(400).json({
                error: 'El campo card_token o cardNumber es obligatorio para este proveedor',
                code: 'CARD_TOKEN_REQUIRED',
            });
        }

        // 🔁 Idempotencia
        if (claveIdempotencia) {
            const existingPayment = await paymentModel.findByIdempotency(empresaId, claveIdempotencia);
            if (existingPayment) {
                return res.status(200).json({
                    payment_id: existingPayment.id,
                    estado: existingPayment.estado,
                    proveedor: existingPayment.proveedor,
                    idempotent_replay: true,
                });
            }
        }

        // 💾 Crear registro inicial en BD
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

        // 🧾 Auditoría
        await auditLogger.recordPaymentEvent({
            empresaId,
            paymentId: payment.id,
            from: null,
            to: 'INITIATED',
            provider: proveedor,
        });

        // ⚙️ Ejecutar Orquestador
        const result = await paymentOrchestrator.processPayment({
            empresaId,
            proveedor,
            payment,
            token,
            metadata: req.body.metadata || {},
        });

        return res.status(201).json({
            payment_id: result.paymentId || result.transactionId,
            estado: result.status,
            proveedor: result.provider,
            card_brand: payment.cardBrand || cardBrand,
            id_transaccion_proveedor: result.providerTransactionId,
            mensaje: result.message || 'Pago procesado exitosamente',
        });

    } catch (error) {
        logger.error(`createPayment: ${error.message}`);
        const statusCode = error.statusCode || (error instanceof BusinessError ? error.statusCode : 500);
        
        return res.status(statusCode).json({
            error: error.message || 'Error interno al procesar el pago',
            estado: 'FAILED',
            code: error.code || 'INTERNAL_ERROR',
            raw: error.raw || null
        });
    }
}

async function refundPayment(req, res) {
    const { transactionId } = req.params;
    const proveedor = req.body.proveedor || req.body.provider || env.DEFAULT_PROVIDER || 'paypal';
    const { monto } = req.body;

    if (!transactionId) {
        return res.status(400).json({ error: 'transactionId es requerido' });
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
        return res.status(error.statusCode || 500).json({ error: error.message });
    }
}

async function getPaymentStatus(req, res) {
    const { transactionId } = req.params;
    const proveedor = req.query.proveedor || req.query.provider || env.DEFAULT_PROVIDER || 'paypal';

    if (!transactionId) {
        return res.status(400).json({ error: 'transactionId es requerido' });
    }

    try {
        const result = await paymentOrchestrator.getPaymentStatus({
            proveedor,
            transactionId,
        });
        return res.status(200).json(result);
    } catch (error) {
        logger.error(`getPaymentStatus: ${error.message}`);
        return res.status(error.statusCode || 500).json({ error: error.message });
    }
}

async function registerCard(req, res) {
    try {
        const { cardType, cardholder, cardNumber, expiry, cvc } = req.body;
        const empresaId = req.empresaId;

        if (!empresaId) {
            return res.status(401).json({ error: 'No autorizado.', code: 'UNAUTHORIZED' });
        }

        const cleanCardNumber = cardNumber ? String(cardNumber).replace(/\s/g, '') : '';

        if (!cleanCardNumber || !cardholder || !expiry || !cvc) {
            return res.status(400).json({ error: 'Faltan datos obligatorios.', code: 'MISSING_DATA' });
        }

        if (!isLuhnValid(cleanCardNumber)) {
            return res.status(400).json({ error: 'El número de tarjeta es inválido.', code: 'INVALID_CARD' });
        }

        const network = getCardNetwork(cleanCardNumber);

        const stripeResponse = await tokenizeCardMock({
            cardNumber: cleanCardNumber,
            expiry,
            cvc,
            cardType,
            cardholder
        });

        const savedCard = await cardModel.saveCardToken({
            empresaId,
            tokenProveedor: stripeResponse.id, 
            ultimosCuatro: stripeResponse.last4,
            red: network,
            tipo: cardType || 'CREDIT'
        });

        return res.status(201).json({
            message: 'Tarjeta registrada y tokenizada correctamente.',
            data: {
                id_tarjeta_interna: savedCard.id,
                token_proveedor: savedCard.token_proveedor,
                last4: savedCard.ultimos_cuatro,
                network: savedCard.red,
                cardType: savedCard.tipo
            }
        });
    } catch (error) {
        logger.error(`registerCard: ${error.message}`);
        return res.status(500).json({ error: error.message, code: 'INTERNAL_ERROR' });
    }
}

async function getCards(req, res) {
    try {
        const empresaId = req.empresaId; 
        const cards = await paymentModel.getCardsByEmpresa(empresaId);
        return res.status(200).json({ success: true, count: cards.length, data: cards });
    } catch (error) {
        logger.error(`getCards: ${error.message}`);
        return res.status(500).json({ error: 'Error al obtener tarjetas.', code: 'INTERNAL_ERROR' });
    }
}

/**
 * PAYPAL SPECIFIC METHODS
 */
async function createPaypalOrder(req, res) {
    const { amount, currency, description } = req.body;
    if (!amount || !currency) {
        return res.status(400).json({ error: 'amount y currency son requeridos' });
    }
    try {
        const registry = require('../providers/provider.registry');
        const paypal = registry.getProvider('paypal');
        const result = await paypal.createOrder({
            amount: parseFloat(amount),
            currency,
            description: description || 'Pago FrogPay',
        });
        return res.status(201).json(result);
    } catch (err) {
        logger.error(`createPaypalOrder: ${err.message}`);
        return res.status(err.statusCode || 500).json({ error: err.message, raw: err.raw });
    }
}

async function capturePaypalOrder(req, res) {
    const { orderId } = req.body;
    if (!orderId) {
        return res.status(400).json({ error: 'orderId es requerido' });
    }
    try {
        const registry = require('../providers/provider.registry');
        const paypal = registry.getProvider('paypal');
        const result = await paypal.captureOrder(orderId);
        return res.status(200).json({
            ...result,
            payment_id: result.transactionId,
            estado: result.status,
            mensaje: 'Pago capturado exitosamente',
        });
    } catch (err) {
        logger.error(`capturePaypalOrder: ${err.message}`);
        return res.status(err.statusCode || 500).json({ error: err.message, raw: err.raw });
    }
}

module.exports = { 
    createPayment, 
    refundPayment, 
    getPaymentStatus, 
    registerCard, 
    getCards, 
    createPaypalOrder, 
    capturePaypalOrder 
};