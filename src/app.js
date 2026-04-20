const express = require('express');
const cors = require('cors');
const routes = require('./routes/index');
const env = require('./config/env');
const { publicRateLimit } = require('./middlewares/rateLimit.middleware');
const qrPageRoutes = require('./routes/qr.page.routes');

const app = express();

const allowedOrigins = env.CORS_ALLOWED_ORIGINS
	.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean);

function isLocalDevOrigin(origin) {
	if (!origin) return false;
	return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

app.use(
	cors({
		origin(origin, callback) {
			if (!origin || allowedOrigins.includes(origin)) {
				return callback(null, true);
			}

			if (env.NODE_ENV !== 'production' && isLocalDevOrigin(origin)) {
				return callback(null, true);
			}

			return callback(null, false);
		},
	})
);

app.use(express.json());
app.use('/api/tenants', publicRateLimit);

app.get('/health', (_req, res) => {
	res.status(200).json({
		status: 'ok',
		service: 'frogpay-backend',
		timestamp: new Date().toISOString(),
	});
});

app.use('/pay', qrPageRoutes);
app.use('/api', routes);

module.exports = app;