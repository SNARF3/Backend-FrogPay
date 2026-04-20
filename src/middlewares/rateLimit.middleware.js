const env = require('../config/env');

function createMemoryRateLimiter({ windowMs, getLimit, getKey, message }) {
	const buckets = new Map();

	return (req, res, next) => {
		const key = getKey(req);
		const limit = Math.max(1, Number(getLimit(req) || 1));
		const now = Date.now();
		const current = buckets.get(key);

		if (!current || now > current.resetAt) {
			buckets.set(key, { count: 1, resetAt: now + windowMs });
			return next();
		}

		current.count += 1;
		if (current.count > limit) {
			return res.status(429).json({
				error: message,
				code: 'RATE_LIMIT_EXCEEDED',
				retry_after_ms: Math.max(0, current.resetAt - now),
			});
		}

		return next();
	};
}

const publicRateLimit = createMemoryRateLimiter({
	windowMs: env.RATE_LIMIT_WINDOW_MS,
	getLimit: () => env.RATE_LIMIT_PUBLIC_MAX,
	getKey: (req) => req.ip || req.headers['x-forwarded-for'] || 'unknown',
	message: 'Demasiadas solicitudes. Intenta nuevamente en un momento.',
});

const tenantRateLimit = createMemoryRateLimiter({
	windowMs: env.RATE_LIMIT_WINDOW_MS,
	getLimit: (req) => (req.plan === 'pro' ? env.RATE_LIMIT_PRO_MAX : env.RATE_LIMIT_FREE_MAX),
	getKey: (req) => `tenant:${req.empresaId || 'unknown'}`,
	message: 'Límite de solicitudes por empresa excedido.',
});

module.exports = {
	createMemoryRateLimiter,
	publicRateLimit,
	tenantRateLimit,
};
