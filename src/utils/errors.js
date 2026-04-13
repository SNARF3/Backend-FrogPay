class AppError extends Error {
	constructor(message, options = {}) {
		super(message);
		this.name = this.constructor.name;
		this.code = options.code || 'APP_ERROR';
		this.statusCode = options.statusCode || 500;
		this.retryable = Boolean(options.retryable);
		this.details = options.details || null;
	}
}

// 🧠 Errores de negocio (no reintentar)
class BusinessError extends AppError {
	constructor(message, options = {}) {
		super(message, {
			code: options.code || 'BUSINESS_ERROR',
			statusCode: options.statusCode || 422,
			retryable: false,
			details: options.details || null,
		});
	}
}

// ⚙️ Errores técnicos (sí reintentar)
class TechnicalError extends AppError {
	constructor(message, options = {}) {
		super(message, {
			code: options.code || 'TECHNICAL_ERROR',
			statusCode: options.statusCode || 503,
			retryable: true,
			details: options.details || null,
		});
	}
}

// 🚧 Método no implementado
class NotImplementedError extends AppError {
	constructor(methodName) {
		super(`Method "${methodName}" is not implemented`, {
			code: 'NOT_IMPLEMENTED',
			statusCode: 501,
			retryable: false,
		});
	}
}

// 🔌 Provider no registrado
class ProviderNotFoundError extends BusinessError {
	constructor(providerName) {
		super(`Provider "${providerName}" is not registered`, {
			code: 'PROVIDER_NOT_FOUND',
			statusCode: 400,
		});
	}
}

// 💳 Pago fallido (puede mapearse desde providers)
class PaymentFailedError extends BusinessError {
	constructor(message, details = null) {
		super(message || 'Pago fallido', {
			code: 'PAYMENT_FAILED',
			statusCode: 402,
			details,
		});
	}
}

// 🔁 Helper para retry automático
function isTechnicalError(error) {
	if (!error) return false;

	if (error.retryable === true) return true;

	const technicalCodes = new Set([
		'ECONNRESET',
		'ECONNREFUSED',
		'ETIMEDOUT',
		'EAI_AGAIN',
		'NETWORK_ERROR',
		'PROVIDER_TIMEOUT',
	]);

	if (error.code && technicalCodes.has(error.code)) return true;

	return typeof error.statusCode === 'number' && error.statusCode >= 500;
}

module.exports = {
	AppError,
	BusinessError,
	TechnicalError,
	NotImplementedError,
	ProviderNotFoundError,
	PaymentFailedError,
	isTechnicalError,
};