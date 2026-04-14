const express = require('express');
const router = express.Router();

const tenantRoutes = require('./tenant.routes');
const paymentRoutes = require('./payment.routes');
const cardRoutes = require('./card.routes');

router.use('/tenants', tenantRoutes);
router.use('/payments', paymentRoutes);
router.use('/cards', cardRoutes);

module.exports = router;