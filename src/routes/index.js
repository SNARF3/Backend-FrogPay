const express = require('express');
const router = express.Router();

const tenantRoutes = require('./tenant.routes');
const paymentRoutes = require('./payment.routes');

router.use('/tenants', tenantRoutes);
router.use('/payments', paymentRoutes);

module.exports = router;