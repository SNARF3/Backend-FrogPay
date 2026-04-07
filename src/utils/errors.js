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
	isTechnicalError,
};
