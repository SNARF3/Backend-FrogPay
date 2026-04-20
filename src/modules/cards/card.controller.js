const { validateCardData } = require('./card.validator');
const cardService = require('./card.service');
const logger = require('../../utils/logger');

/**
 * POST /api/cards/tokenize
 *
 * Recibe los datos de una tarjeta, los valida, genera un token de un solo uso
 * almacenado en Redis con TTL de 15 minutos, y lo devuelve al cliente.
 *
 * Body: { card_number, expiry, cvv }
 * Response: { card_token: "tok_abc123" }
 */
async function tokenize(req, res) {
	try {
		const { card_number, expiry, cvv } = req.body;
		const empresaId = req.empresaId;

		// 1. Validar datos de la tarjeta (16 dígitos, CVV 3-4, expiración no vencida)
		const validationError = validateCardData({ card_number, cvv, expiry });

		if (validationError) {
			return res.status(400).json({
				error: validationError.message,
				field: validationError.field,
				code: 'VALIDATION_ERROR',
			});
		}

		// 2. Limpiar el número de tarjeta
		const cleanCardNumber = String(card_number).replace(/\s/g, '');

		// 3. Generar token en Redis (TTL 15 min, un solo uso)
		// NOTA: El CVV se valida arriba pero NO se almacena en Redis
		const cardToken = await cardService.createToken({
			cardNumber: cleanCardNumber,
			expiry,
			empresaId,
		});

		// 4. Responder con el token (sin datos sensibles en la respuesta)
		logger.info(`Tarjeta tokenizada para empresa ${empresaId} — token: ${cardToken}`);

		return res.status(201).json({
			card_token: cardToken,
		});
	} catch (error) {
		logger.error(`tokenize: ${error.message}`);
		return res.status(500).json({
			error: 'Error interno al tokenizar la tarjeta',
			code: 'INTERNAL_ERROR',
		});
	}
}

module.exports = {
	tokenize,
};
