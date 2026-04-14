const paymentModel = require('./payment.model');
const cardModel = require('./card.model');
const paymentOrchestrator = require('./payment.orchestrator');
const { BusinessError } = require('../../utils/errors');
const env = require('../../config/env');
const auditLogger = require('../../utils/auditLogger');
const logger = require('../../utils/logger');
const pool = require('../../config/database');
const { getPaymentEventsService ,  getTimelineService,
  getTransactionsService,
  getAuditService,
  getErrorsService} = require('./payment.service');
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

        // 🔁 Idempotencia
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

		// 💾 Crear pago
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

        // ⚙️ Orquestador
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

async function refundPayment(req, res) {

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

async function getPaymentStatus(req, res) {
    const { transactionId } = req.params;
    const proveedor = req.query.proveedor || req.query.provider || env.DEFAULT_PROVIDER || 'paypal';

    if (!proveedor || !transactionId) {
        return res.status(400).json({
            error: 'proveedor y transactionId son requeridos',
        });
    }

    try {
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

// 💳 Endpoint para validar, tokenizar y guardar tarjetas usando el Model
async function registerCard(req, res) {
    try {
        const { cardType, cardholder, cardNumber, expiry, cvc } = req.body;
        
        // 1. Tomamos el ID ESTRICTAMENTE del middleware (ya sea por JWT o API Key real)
        const empresaId = req.empresaId;

        // Si por alguna razón el middleware no inyectó el ID, rechazamos la petición
        if (!empresaId) {
            return res.status(401).json({ 
                error: 'No autorizado. No se pudo determinar a qué empresa pertenece esta acción.', 
                code: 'UNAUTHORIZED' 
            });
        }

        // Limpiar el número de tarjeta (quitar espacios)
        const cleanCardNumber = cardNumber ? cardNumber.replace(/\s/g, '') : '';

        // 2. Validaciones previas
        if (!cleanCardNumber || !cardholder || !expiry || !cvc) {
            return res.status(400).json({ error: 'Faltan datos obligatorios.', code: 'MISSING_DATA' });
        }
        if (!isLuhnValid(cleanCardNumber)) {
            return res.status(400).json({ error: 'El número de tarjeta es inválido.', code: 'INVALID_CARD' });
        }

        const network = getCardNetwork(cleanCardNumber);

        // 3. Simular Tokenización con Stripe
        const stripeResponse = await tokenizeCardMock({
            cardNumber: cleanCardNumber,
            expiry,
            cvc,
            cardType,
            cardholder
        });

        // 4. Guardar el Token Seguro en Base de Datos
        const savedCard = await cardModel.saveCardToken({
            empresaId: empresaId, // <--- Ahora sí, usa el ID real
            tokenProveedor: stripeResponse.id, 
            ultimosCuatro: stripeResponse.last4,
            red: network,
            tipo: cardType
        });

        // 5. Respuesta Exitosa
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
        return res.status(500).json({
            error: error.message || 'Error interno al procesar la validación de la tarjeta.',
            code: 'INTERNAL_ERROR'
        });
    }
}

async function getCards(req, res) {
    try {
        // req.empresaId ahora viene del JWT desencriptado por el middleware
        const empresaId = req.empresaId; 

        const cards = await paymentModel.getCardsByEmpresa(empresaId);

        return res.status(200).json({
            success: true,
            count: cards.length,
            data: cards
        });
    } catch (error) {
        // ... (manejo de errores)
        logger.error(`getCards: ${error.message}`);
        
        return res.status(500).json({
            error: 'Error interno al obtener el listado de tarjetas.',
            code: 'INTERNAL_ERROR'
        });
    }
}
const getPaymentEventsController = async (req, res) => {
  try {
    const { id } = req.params;
    const empresaId = req.empresaId;

    const events = await getPaymentEventsService(id, empresaId);

    return res.status(200).json(events);

  } catch (error) {
    if (error.message === "NOT_FOUND") {
      return res.status(404).json({ error: "Payment not found" });
    }

    console.error("Error getting payment events:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
const handle404 = (res) => res.status(404).json({ error: "Payment not found" });

const getTimelineController = async (req, res) => {
  try {
    const data = await getTimelineService(req.params.id, req.empresaId);
    res.json(data);
  } catch (e) {
    if (e.message === "NOT_FOUND") return handle404(res);
    res.status(500).json({ error: "Internal error" });
  }
};

const getTransactionsController = async (req, res) => {
  try {
    const data = await getTransactionsService(req.params.id, req.empresaId);
    res.json(data);
  } catch (e) {
    if (e.message === "NOT_FOUND") return handle404(res);
    res.status(500).json({ error: "Internal error" });
  }
};

const getAuditController = async (req, res) => {
  try {
    const data = await getAuditService(req.params.id, req.empresaId);
    res.json(data);
  } catch (e) {
    if (e.message === "NOT_FOUND") return handle404(res);
    res.status(500).json({ error: "Internal error" });
  }
};

const getErrorsController = async (req, res) => {
  try {
    const data = await getErrorsService(req.params.id, req.empresaId);
    res.json(data);
  } catch (e) {
    if (e.message === "NOT_FOUND") return handle404(res);
    res.status(500).json({ error: "Internal error" });
  }
};
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
    getErrorsController
};