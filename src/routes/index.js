const express = require('express');

const router = express.Router();

const tenantRoutes = require('./tenant.routes');
const paymentRoutes = require('./payment.routes');
const webhookRoutes = require('./webhook.routes');
const financeRoutes = require('./finance.routes');
const qrApiRoutes = require('./qr.api.routes');
const currencyRoutes = require('../modules/currencies/currency.routes');
const dashboardsRoutes = require('./dashboards.routes');

router.use('/tenants', tenantRoutes);
router.use('/payments', paymentRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/finances', financeRoutes);
router.use('/financesdashboards', dashboardsRoutes);
router.use('/qr', qrApiRoutes);
router.use('/currencies', currencyRoutes);

module.exports = router;
