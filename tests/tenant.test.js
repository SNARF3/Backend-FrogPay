const test = require('node:test');
const assert = require('node:assert/strict');

const { createMemoryRateLimiter } = require('../src/middlewares/rateLimit.middleware');

test('memory rate limiter allows requests under limit', () => {
	const limiter = createMemoryRateLimiter({
		windowMs: 1000,
		getLimit: () => 2,
		getKey: () => 'demo',
		message: 'limit',
	});

	const req = { ip: '127.0.0.1' };
	const res = {
		statusCode: 200,
		payload: null,
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(data) {
			this.payload = data;
			return this;
		},
	};

	let nextCalls = 0;
	limiter(req, res, () => { nextCalls += 1; });
	limiter(req, res, () => { nextCalls += 1; });

	assert.equal(nextCalls, 2);
	assert.equal(res.statusCode, 200);
});

test('memory rate limiter blocks above limit', () => {
	const limiter = createMemoryRateLimiter({
		windowMs: 1000,
		getLimit: () => 1,
		getKey: () => 'demo-block',
		message: 'limit',
	});

	const req = { ip: '127.0.0.2' };
	const res = {
		statusCode: 200,
		payload: null,
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(data) {
			this.payload = data;
			return this;
		},
	};

	limiter(req, res, () => {});
	limiter(req, res, () => {});

	assert.equal(res.statusCode, 429);
	assert.equal(res.payload.code, 'RATE_LIMIT_EXCEEDED');
});
