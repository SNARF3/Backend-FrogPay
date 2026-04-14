const express = require('express');
const router = express.Router();

const { authMiddleware } = require('../middlewares/auth.middleware');
const { tenantRateLimit } = require('../middlewares/rateLimit.middleware');
const { getKpis } = require('../modules/finance/finance.controller');

router.use(authMiddleware, tenantRateLimit);

router.get('/kpis', getKpis);

module.exports = router;
