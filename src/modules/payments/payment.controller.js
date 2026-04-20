const paymentModel = require('./payment.model');
const cardModel = require('./card.model');
const paymentOrchestrator = require('./payment.orchestrator');
const { BusinessError } = require('../../utils/errors');
const env = require('../../config/env');
const auditLogger = require('../../utils/auditLogger');
const logger = require('../../utils/logger');
const pool = require('../../config/database');
const currencyModel = require('../currencies/currency.model');
const exchangeRateService = require('../../utils/exchangeRateService');

// Nuevas importaciones para el manejo de tarjetas
const { isLuhnValid, getCardNetwork } = require('../../utils/cardValidator');
const { tokenizeCardMock } = require('../providers/stripe.mock');
const paypalProvider = require('../providers/paypal.provider');

const SUPPORTED_PROVIDER_ACCOUNTS = {
    paypal: {
        type: 'wallet',
        requiredConfig: [],
        requireApiKey: true,
        requireSecretKey: true,
    },
    paypal_mock: {
        type: 'wallet_mock',
        requiredConfig: ['displayName', 'merchantEmail', 'merchantAccountId', 'settlementCurrency'],
    },
    card_simulated: {
        type: 'card_mock',
        requiredConfig: ['accountHolderName', 'settlementAccountAlias', 'supportEmail', 'acceptedBrands', 'statementDescriptor'],
    },
};

function detectCardBrandFromToken(cardToken) {
	const normalized = String(cardToken || '').replace(/\D/g, '');
	if (normalized.startsWith('4')) return 'VISA';
	if (normalized.startsWith('5')) return 'MASTERCARD';
	return 'UNKNOWN';
}

async function validatePayload(body) {
    if (!body) return 'Payload inválido';
    const amount = body.monto ?? body.amount;
    const currency = body.moneda ?? body.currency;
    if (amount === undefined || amount === null || Number(amount) <= 0) return 'El campo monto/amount debe ser mayor a 0';
    if (!currency) return 'El campo moneda/currency es obligatorio';

    // Validar que la moneda existe y está habilitada
    const validCurrency = await currencyModel.getCurrencyByCode(currency);
    if (!validCurrency) return `La moneda '${currency}' no es válida o no está habilitada`;

    return null;
}

function validateProviderAccountPayload(provider, body) {
    const config = body?.configuracion || body?.configuration || {};
    const apiKey = body?.api_key ?? body?.apiKey ?? null;
    const secretKey = body?.secret_key ?? body?.secretKey ?? null;
    const isActive = body?.activo !== false;

    const spec = SUPPORTED_PROVIDER_ACCOUNTS[provider];
    if (!spec) {
        throw new BusinessError(`Proveedor no soportado para configuración: ${provider}`, {
            code: 'UNSUPPORTED_PROVIDER_ACCOUNT',
            statusCode: 400,
        });
    }

    if (spec.requireApiKey && isActive) {
        if (!apiKey || String(apiKey).trim().length < 10) {
            throw new BusinessError('paypal_client_id (api_key) es obligatorio y debe ser un string válido', {
                code: 'PROVIDER_ACCOUNT_INVALID_PAYLOAD',
                statusCode: 400,
            });
        }
    }

    if (spec.requireSecretKey && isActive) {
        if (!secretKey || String(secretKey).trim().length < 10) {
            throw new BusinessError('paypal_client_secret (secret_key) es obligatorio y debe ser un string válido', {
                code: 'PROVIDER_ACCOUNT_INVALID_PAYLOAD',
                statusCode: 400,
            });
        }
    }

    for (const field of spec.requiredConfig) {
        if (field === 'acceptedBrands') {
            if (!Array.isArray(config.acceptedBrands) || config.acceptedBrands.length === 0) {
                throw new BusinessError('acceptedBrands es obligatorio para card_simulated', {
                    code: 'PROVIDER_ACCOUNT_INVALID_PAYLOAD',
                    statusCode: 400,
                });
            }
            continue;
        }

        if (!String(config[field] || '').trim()) {
            throw new BusinessError(`Campo obligatorio faltante: ${field}`, {
                code: 'PROVIDER_ACCOUNT_INVALID_PAYLOAD',
                statusCode: 400,
            });
        }
    }

    if (provider === 'paypal_mock') {
        const merchantEmail = String(config.merchantEmail || '');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(merchantEmail)) {
            throw new BusinessError('merchantEmail no tiene formato válido', {
                code: 'PROVIDER_ACCOUNT_INVALID_EMAIL',
                statusCode: 400,
            });
        }
    }

    if (provider === 'card_simulated') {
        const supportEmail = String(config.supportEmail || '');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
            throw new BusinessError('supportEmail no tiene formato válido', {
                code: 'PROVIDER_ACCOUNT_INVALID_EMAIL',
                statusCode: 400,
            });
        }
    }

    return {
        providerType: spec.type,
        apiKey: apiKey ? String(apiKey).trim() : null,
        secretKey: secretKey ? String(secretKey).trim() : null,
        configuracion: config,
        activo: isActive,
    };
}

function maskSecret(value) {
    const str = String(value || '');
    if (!str) return null;
    if (str.length <= 6) return '*'.repeat(str.length);
    return `${str.slice(0, 3)}***${str.slice(-3)}`;
}

function normalizeProviderAccountRow(row) {
    return {
        id: row.id,
        provider: String(row.provider_name || '').toLowerCase(),
        provider_type: row.provider_type || null,
        activo: row.activo !== false,
        api_key_masked: maskSecret(row.api_key),
        secret_key_masked: maskSecret(row.secret_key),
        configuracion: row.configuracion || {},
    };
}

async function createPayment(req, res) {
    try {
        const validationError = await validatePayload(req.body);
        if (validationError) {
            return res.status(400).json({ error: validationError });
        }

		const empresaId = req.empresaId;
		const proveedor = req.body.proveedor || req.body.provider || req.body.paymentProvider
			|| (String(req.body.payment_method || '').toUpperCase() === 'QR' ? 'qr' : null)
			|| env.DEFAULT_PROVIDER || 'mock';
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

        // HU-29: Validar que el metodo QR este habilitado para el tenant
        if (proveedor === 'qr') {
            const enabledMethods = await paymentModel.getEnabledPaymentMethods(empresaId);
            if (!enabledMethods.includes('qr')) {
                return res.status(403).json({
                    error: 'El metodo de pago QR no esta habilitado para esta empresa.',
                    code: 'QR_METHOD_NOT_ENABLED',
                });
            }
        }

        // Idempotencia
        if (claveIdempotencia) {
            const existingPayment = await paymentModel.findByIdempotency(
                empresaId,
                claveIdempotencia
            );

            if (existingPayment) {
                const replayResponse = {
                    payment_id: existingPayment.id,
                    estado: existingPayment.estado,
                    proveedor: existingPayment.proveedor,
                    idempotent_replay: true,
                };
                if (existingPayment.proveedor === 'qr') {
                    replayResponse.qr_code = existingPayment.qr_code;
                    replayResponse.qr_url = existingPayment.qr_url;
                }
                return res.status(200).json(replayResponse);
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

		const responseBody = {
			payment_id: result.paymentId,
			estado: result.status,
			proveedor: result.provider,
			card_brand: cardBrand,
			id_transaccion_proveedor: result.providerTransactionId,
			mensaje: result.message,
		};

		if (proveedor === 'qr') {
			responseBody.qr_code = result.qrCode;
			responseBody.qr_url = result.qrUrl;
		}

		if (proveedor === 'paypal' && result.approvalUrl) {
			responseBody.paypal_approval_url = result.approvalUrl;
		}

		return res.status(201).json(responseBody);
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

async function getExchangeRate(req, res) {
    try {
        const { amount, fromCurrency, toCurrency } = req.query;
        if (!amount || !fromCurrency) {
            return res.status(400).json({ error: 'amount y fromCurrency son requeridos' });
        }
        const result = await exchangeRateService.calculateConvertedAmount(
            parseFloat(amount),
            fromCurrency.toUpperCase(),
            toCurrency ? toCurrency.toUpperCase() : 'USD'
        );
        res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error('Error obteniendo tipo de cambio:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
        });
    }
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
            empresaId: req.empresaId,
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
            empresaId: req.empresaId,
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

async function getPaymentsMonitor(req, res) {
    try {
        const empresaId = req.empresaId;
        const parsedLimit = Number(req.query.limit);
        const limit = Number.isFinite(parsedLimit)
            ? Math.min(Math.max(Math.trunc(parsedLimit), 1), 100)
            : 30;

        const items = await paymentModel.getRecentPaymentsForTenant(empresaId, limit);

        return res.status(200).json({
            success: true,
            count: items.length,
            data: items,
        });
    } catch (error) {
        logger.error(`getPaymentsMonitor: ${error.message}`);
        return res.status(500).json({
            error: 'Error interno obteniendo monitor de pagos',
            code: 'PAYMENTS_MONITOR_FAILED',
        });
    }
}

async function getProviderAccounts(req, res) {
    try {
        const empresaId = req.empresaId;
        const rows = await paymentModel.getProviderAccountsByEmpresa(empresaId);
        const data = rows.map(normalizeProviderAccountRow);

        return res.status(200).json({
            success: true,
            count: data.length,
            data,
        });
    } catch (error) {
        logger.error(`getProviderAccounts: ${error.message}`);
        return res.status(500).json({
            error: 'Error obteniendo configuración de proveedores',
            code: 'PROVIDER_ACCOUNTS_FETCH_FAILED',
        });
    }
}

async function upsertProviderAccount(req, res) {
    try {
        const empresaId = req.empresaId;
        const provider = String(req.params.provider || '').trim().toLowerCase();

        const payload = validateProviderAccountPayload(provider, req.body || {});
        const result = await paymentModel.upsertProviderAccountByEmpresa({
            empresaId,
            providerName: provider,
            providerType: payload.providerType,
            apiKey: payload.apiKey,
            secretKey: payload.secretKey,
            configuracion: payload.configuracion,
            activo: payload.activo,
        });

        paymentModel.registerAuditEvent({
            empresaId,
            entidadId: empresaId,
            from: null,
            to: 'CONFIGURED',
            provider,
            metadata: { action: 'PROVIDER_CREDENTIALS_UPDATED', activo: payload.activo },
        }).catch(() => {});

        return res.status(200).json({
            success: true,
            message: 'Cuenta de cobro actualizada correctamente',
            data: normalizeProviderAccountRow(result),
        });
    } catch (error) {
        if (error instanceof BusinessError) {
            return res.status(error.statusCode).json({
                error: error.message,
                code: error.code,
            });
        }

        logger.error(`upsertProviderAccount: ${error.message}`);
        return res.status(500).json({
            error: 'Error guardando configuración de proveedor',
            code: 'PROVIDER_ACCOUNT_UPSERT_FAILED',
        });
    }
}

function renderPaypalPage({ title, icon, lines, color, extra = '' }) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — FrogPay</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #040A0B; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1rem; }
    .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 1.5rem; padding: 2.5rem 2rem; max-width: 420px; width: 100%; text-align: center; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; font-weight: 800; color: ${color}; margin-bottom: 0.75rem; }
    p { color: #9ca3af; font-size: 0.875rem; line-height: 1.6; margin-bottom: 0.4rem; }
    .close-btn { display: inline-block; margin-top: 1.5rem; background: ${color}; color: #040A0B; font-weight: 700; padding: 0.75rem 2rem; border-radius: 1rem; text-decoration: none; font-size: 0.875rem; cursor: pointer; border: none; }
    .close-btn:hover { opacity: 0.85; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    ${lines.map((l) => `<p>${l}</p>`).join('')}
    ${extra}
    <br />
    <button class="close-btn" onclick="history.go(-2)">Volver a la tienda</button>
  </div>
</body>
</html>`;
}

async function handlePaypalReturn(req, res) {
    const { token: orderId } = req.query;
    logger.info(`[PayPal Return] orderId=${orderId}`);

    if (!orderId) {
        return res.status(400).send(renderPaypalPage({
            title: 'Error', icon: '⚠️', color: '#ef4444',
            lines: ['No se recibió el identificador de la orden.'],
        }));
    }

    try {
        const paymentRef = await paymentModel.findPaymentByProviderTransaction(orderId);
        logger.info(`[PayPal Return] paymentRef=${JSON.stringify(paymentRef)}`);

        if (!paymentRef) {
            return res.status(404).send(renderPaypalPage({
                title: 'Pago no encontrado', icon: '🔍', color: '#f59e0b',
                lines: [`Orden PayPal: ${orderId}`, 'La referencia de transacción no fue encontrada en la base de datos.'],
            }));
        }

        const { payment_id: paymentId, empresa_id: empresaId } = paymentRef;

        const existingPayment = await paymentModel.findPaymentById(paymentId);
        if (existingPayment?.estado === 'COMPLETED') {
            return res.send(renderPaypalPage({
                title: '¡Pago completado!', icon: '✅', color: '#22c55e',
                lines: ['Tu pago ya fue procesado correctamente.', `Referencia: ${orderId}`],
            }));
        }

        const creds = await paymentModel.getPaypalCredentialsByEmpresa(empresaId);
        logger.info(`[PayPal Return] creds found=${Boolean(creds)} empresaId=${empresaId}`);

        if (!creds) {
            return res.status(400).send(renderPaypalPage({
                title: 'Error de configuración', icon: '⚙️', color: '#f59e0b',
                lines: ['No hay credenciales de PayPal configuradas para este tenant.', `empresaId: ${empresaId}`],
            }));
        }

        logger.info(`[PayPal Return] Capturing orderId=${orderId}...`);
        const captured = await paypalProvider.captureOrder(orderId, creds.clientId, creds.clientSecret);
        logger.info(`[PayPal Return] Capture result=${JSON.stringify(captured)}`);

        await paymentModel.updatePaymentStatus(paymentId, empresaId, 'COMPLETED');
        await paymentModel.insertTransaction({
            pagoId: paymentId,
            idTransaccionProveedor: orderId,
            estado: 'COMPLETED',
            codigoRespuesta: '00',
            mensajeRespuesta: 'Pago capturado con PayPal',
        });
        await paymentModel.incrementMonthlyUsage(empresaId, existingPayment?.monto || 0);
        await paymentModel.registerAuditEvent({
            empresaId,
            paymentId,
            from: 'PENDING',
            to: 'COMPLETED',
            provider: 'paypal',
            providerTransactionId: orderId,
        });

        logger.info(`[PayPal Return] SUCCESS orderId=${orderId} paymentId=${paymentId}`);

        return res.send(renderPaypalPage({
            title: '¡Pago completado!', icon: '✅', color: '#22c55e',
            lines: [
                'Tu pago fue aprobado y procesado correctamente.',
                `Referencia: ${orderId}`,
                existingPayment ? `Monto: ${existingPayment.moneda} ${existingPayment.monto}` : '',
            ].filter(Boolean),
        }));
    } catch (error) {
        const detail = error.details ? JSON.stringify(error.details) : '';
        logger.error(`[PayPal Return] ERROR: ${error.message} ${detail}`);
        return res.status(500).send(renderPaypalPage({
            title: 'Error al procesar el pago', icon: '❌', color: '#ef4444',
            lines: [
                error.message || 'Ocurrió un error inesperado.',
                detail ? `Detalle: ${detail}` : '',
            ].filter(Boolean),
        }));
    }
}

async function handlePaypalCancel(req, res) {
    const { token: orderId } = req.query;

    if (orderId) {
        try {
            const paymentRef = await paymentModel.findPaymentByProviderTransaction(orderId);
            if (paymentRef) {
                await paymentModel.updatePaymentStatus(paymentRef.payment_id, paymentRef.empresa_id, 'FAILED');
            }
        } catch (err) {
            logger.error(`handlePaypalCancel cleanup: ${err.message}`);
        }
    }

    return res.send(renderPaypalPage({
        title: 'Pago cancelado', icon: '🚫', color: '#f59e0b',
        lines: ['Cancelaste el pago en PayPal.', 'Puedes cerrar esta ventana y volver a intentarlo.'],
    }));
}

async function verifyPaypalCredentials(req, res) {
    const empresaId = req.empresaId;

    try {
        const creds = await paymentModel.getPaypalCredentialsByEmpresa(empresaId);

        if (!creds) {
            return res.status(200).json({
                success: false,
                configured: false,
                error: 'No hay credenciales de PayPal configuradas',
                code: 'NOT_CONFIGURED',
            });
        }

        const credentials = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
        const response = await fetch(`${env.PAYPAL_BASE_URL}/v1/oauth2/token`, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: 'grant_type=client_credentials',
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            return res.status(200).json({
                success: false,
                configured: true,
                error: data.error_description || 'PayPal rechazó las credenciales',
                paypal_error: data.error || null,
                client_id_preview: `${creds.clientId.slice(0, 4)}...${creds.clientId.slice(-4)}`,
            });
        }

        return res.status(200).json({
            success: true,
            configured: true,
            message: 'Credenciales de PayPal válidas ✓',
            client_id_preview: `${creds.clientId.slice(0, 4)}...${creds.clientId.slice(-4)}`,
        });
    } catch (error) {
        logger.error(`verifyPaypalCredentials: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: 'Error verificando credenciales',
            code: 'VERIFY_ERROR',
        });
    }
}

async function getPaymentById(req, res) {
    const paymentId = req.params.id;
    if (!paymentId || typeof paymentId !== 'string' || !paymentId.trim()) {
        return res.status(400).json({ error: 'ID de pago invalido', code: 'INVALID_PAYMENT_ID' });
    }

    const empresaId = req.empresaId;

    try {
        const payment = await paymentModel.findPaymentByIdAndEmpresa(paymentId, empresaId);
        if (!payment) {
            return res.status(404).json({ error: 'Pago no encontrado', code: 'PAYMENT_NOT_FOUND' });
        }

        return res.status(200).json({
            success: true,
            payment_id: payment.id,
            estado: payment.estado,
            proveedor: payment.proveedor,
            monto: payment.monto,
            moneda: payment.moneda,
            qr_url: payment.qr_url || null,
            creado_en: payment.creado_en,
            actualizado_en: payment.actualizado_en,
        });
    } catch (error) {
        logger.error(`getPaymentById: ${error.message}`);
        return res.status(500).json({ error: 'Error interno', code: 'INTERNAL_ERROR' });
    }
}

module.exports = {
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
	getExchangeRate,
	getPaymentsMonitor,
    getProviderAccounts,
    upsertProviderAccount,
    verifyPaypalCredentials,
    handlePaypalReturn,
    handlePaypalCancel,
};