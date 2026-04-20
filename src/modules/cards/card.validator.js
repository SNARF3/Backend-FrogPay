/**
 * Validaciones para la tokenización de tarjetas.
 * Criterios de aceptación de la HU:
 * - card_number: 16 dígitos numéricos
 * - cvv: 3 o 4 dígitos numéricos
 * - expiry: formato MM/YY, no vencida
 */

function validateCardNumber(cardNumber) {
	if (!cardNumber) return 'El campo card_number es obligatorio';

	const cleaned = String(cardNumber).replace(/\s/g, '');

	if (!/^\d{16}$/.test(cleaned)) {
		return 'El número de tarjeta debe tener exactamente 16 dígitos';
	}

	return null;
}

function validateCvv(cvv) {
	if (!cvv && cvv !== 0) return 'El campo cvv es obligatorio';

	const cleaned = String(cvv).trim();

	if (!/^\d{3,4}$/.test(cleaned)) {
		return 'El CVV debe tener 3 o 4 dígitos';
	}

	return null;
}

function validateExpiry(expiry) {
	if (!expiry) return 'El campo expiry es obligatorio';

	const cleaned = String(expiry).trim();

	// Aceptamos MM/YY o MM/YYYY
	const match = cleaned.match(/^(\d{2})\/(\d{2,4})$/);
	if (!match) {
		return 'El formato de expiry debe ser MM/YY o MM/YYYY';
	}

	const month = parseInt(match[1], 10);
	let year = parseInt(match[2], 10);

	// Normalizar año de 2 dígitos a 4
	if (year < 100) {
		year += 2000;
	}

	if (month < 1 || month > 12) {
		return 'El mes de expiración debe estar entre 01 y 12';
	}

	// Verificar que no esté vencida
	const now = new Date();
	const currentMonth = now.getMonth() + 1; // getMonth() es 0-indexed
	const currentYear = now.getFullYear();

	if (year < currentYear || (year === currentYear && month < currentMonth)) {
		return 'La tarjeta está vencida';
	}

	return null;
}

/**
 * Valida todos los campos de la tarjeta.
 * @returns {{ field: string, message: string } | null} Error encontrado o null si todo OK
 */
function validateCardData({ card_number, cvv, expiry }) {
	const cardError = validateCardNumber(card_number);
	if (cardError) return { field: 'card_number', message: cardError };

	const cvvError = validateCvv(cvv);
	if (cvvError) return { field: 'cvv', message: cvvError };

	const expiryError = validateExpiry(expiry);
	if (expiryError) return { field: 'expiry', message: expiryError };

	return null;
}

module.exports = {
	validateCardData,
	validateCardNumber,
	validateCvv,
	validateExpiry,
};
