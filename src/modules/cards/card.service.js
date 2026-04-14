const { randomUUID } = require('crypto');
const { connection: redis } = require('../../config/redis');
const logger = require('../../utils/logger');

const TOKEN_PREFIX = 'card_token:';
const TOKEN_TTL_SECONDS = 900; // 15 minutos

/**
 * Genera un token único para una tarjeta y lo guarda en Redis con TTL de 15 minutos.
 * Los datos sensibles (card_number completo, cvv) NO se guardan — solo lo mínimo
 * necesario para procesar el pago cuando se consuma el token.
 *
 * @param {Object} params
 * @param {string} params.cardNumber - Número limpio (16 dígitos)
 * @param {string} params.expiry - Expiración MM/YY
 * @param {string} params.empresaId - ID de la empresa que tokeniza
 * @returns {Promise<string>} El card_token generado (ej: tok_abc123)
 */
async function createToken({ cardNumber, expiry, empresaId }) {
	const token = `tok_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
	const redisKey = `${TOKEN_PREFIX}${token}`;

	// Solo almacenamos lo necesario para procesar el pago.
	// El CVV NO se almacena en Redis (se valida en el momento y se descarta).
	const tokenData = JSON.stringify({
		last4: cardNumber.slice(-4),
		expiry,
		empresaId,
		createdAt: new Date().toISOString(),
	});

	await redis.set(redisKey, tokenData, 'EX', TOKEN_TTL_SECONDS);

	logger.info(`Token generado para empresa ${empresaId}: ${token} (TTL: ${TOKEN_TTL_SECONDS}s)`);

	return token;
}

/**
 * Consume un token de Redis (un solo uso).
 * Usa un script Lua para GET + DEL atómico (compatible con todas las versiones de Redis).
 * Si el token no existe o ya fue usado, retorna null.
 *
 * @param {string} token - El card_token (ej: tok_abc123)
 * @returns {Promise<Object|null>} Los datos del token o null si inválido/expirado/ya usado
 */
async function consumeToken(token) {
	const redisKey = `${TOKEN_PREFIX}${token}`;

	// Script Lua: obtiene el valor y lo elimina atómicamente.
	// Garantiza que el token solo se puede usar UNA vez, incluso con requests concurrentes.
	const luaScript = `
		local val = redis.call('GET', KEYS[1])
		if val then
			redis.call('DEL', KEYS[1])
		end
		return val
	`;

	const raw = await redis.eval(luaScript, 1, redisKey);

	if (!raw) {
		logger.warn(`Token inválido o expirado: ${token}`);
		return null;
	}

	logger.info(`Token consumido y eliminado: ${token}`);
	return JSON.parse(raw);
}

module.exports = {
	createToken,
	consumeToken,
	TOKEN_PREFIX,
	TOKEN_TTL_SECONDS,
};
