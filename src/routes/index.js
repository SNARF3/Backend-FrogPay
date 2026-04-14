const express = require('express');
const router = express.Router();

const tenantRoutes = require('./tenant.routes');
const paymentRoutes = require('./payment.routes');
const cardRoutes = require('./card.routes');
const financeRoutes = require('./finance.routes');

router.use('/tenants', tenantRoutes);
router.use('/payments', paymentRoutes);
router.use('/cards', cardRoutes);
router.use('/finances', financeRoutes);

module.exports = router;