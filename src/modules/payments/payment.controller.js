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
const paypalProvider = require('../providers/paypal.provider');

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
        const token = req.body.card_token ?? req.body.token ?? req.body.paymentToken ?? req.body.paymentMethodId ?? null;
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
            plan: req.plan,
            proveedor,
            payment,
            token,
            metadata: req.body.metadata || {},
        });

		return res.status(201).json({
			payment_id: result.paymentId,
			estado: result.status,
			proveedor: result.provider,
            card_brand: cardBrand,
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

function paymentHealthCheck(_req, res) {
    return res.status(200).json({
        ok: true,
        service: 'payments',
        timestamp: new Date().toISOString(),
    });
}

function getStripeConfig(_req, res) {
    return res.status(200).json({
        publishableKey: env.STRIPE_PUBLISHABLE_KEY || null,
        enabled: Boolean(env.STRIPE_PUBLISHABLE_KEY),
    });
}

async function refundPayment(req, res) {
    const { transactionId } = req.params;
    const proveedor = req.body?.proveedor || req.body?.provider || req.query?.proveedor || req.query?.provider || env.DEFAULT_PROVIDER || 'paypal';
    const monto = req.body?.monto ?? req.body?.amount ?? null;

    if (!proveedor || !transactionId) {
        return res.status(400).json({
            error: 'proveedor y transactionId son requeridos',
        });
    }

    try {
        const alreadyRefunded = await paymentModel.hasRefundForProviderTransaction(transactionId);
        if (alreadyRefunded) {
            return res.status(409).json({
                error: 'La transacción ya fue reembolsada previamente.',
                code: 'REFUND_ALREADY_PROCESSED',
            });
        }

        const result = await paymentOrchestrator.processRefund({
            proveedor,
            transactionId,
            monto,
        });

        const paymentRef = await paymentModel.findPaymentByProviderTransaction(transactionId);
        if (paymentRef?.payment_id) {
            await paymentModel.insertTransaction({
                pagoId: paymentRef.payment_id,
                idTransaccionProveedor: transactionId,
                estado: 'REFUNDED',
                codigoRespuesta: 'REFUND_OK',
                mensajeRespuesta: 'Reembolso completado',
            });
        }

        return res.status(200).json(result);
    } catch (error) {
        logger.error(`refundPayment: ${error.message}`);

        return res.status(error.statusCode || 500).json({
            error: error.message,
        });
    }
}

async function createPayPalOrder(req, res) {
    try {
        const amount = Number(req.body?.amount);
        const currency = req.body?.currency || 'USD';
        const description = req.body?.description || 'Pago con PayPal';

        if (!amount || amount <= 0) {
            return res.status(400).json({
                error: 'amount debe ser mayor a 0',
                code: 'INVALID_AMOUNT',
            });
        }

        const result = await paypalProvider.createOrder({
            amount,
            currency,
            description,
        });

        return res.status(201).json(result);
    } catch (error) {
        logger.error(`createPayPalOrder: ${error.message}`);
        return res.status(error.statusCode || 500).json({
            error: error.message || 'Error creando orden PayPal',
            code: error.code || 'PAYPAL_CREATE_ORDER_FAILED',
        });
    }
}

async function capturePayPalOrder(req, res) {
    try {
        const orderId = req.body?.orderId;
        if (!orderId) {
            return res.status(400).json({
                error: 'orderId es obligatorio',
                code: 'PAYPAL_ORDER_ID_REQUIRED',
            });
        }

        const result = await paypalProvider.captureOrder(orderId);
        return res.status(200).json(result);
    } catch (error) {
        logger.error(`capturePayPalOrder: ${error.message}`);
        return res.status(error.statusCode || 500).json({
            error: error.message || 'Error capturando orden PayPal',
            code: error.code || 'PAYPAL_CAPTURE_ORDER_FAILED',
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

module.exports = {
    createPayment,
    refundPayment,
    getPaymentStatus,
    registerCard,
	getCards,
    createPayPalOrder,
    capturePayPalOrder,
    paymentHealthCheck,
    getStripeConfig,
};