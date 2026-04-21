const express = require('express');

const router = express.Router();

const controller = require('../modules/financesDashboardsResources/dashboards.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { tenantRateLimit } = require('../middlewares/rateLimit.middleware');

router.use(authMiddleware, tenantRateLimit);

router.get('/kpis', controller.getKpis);
router.get('/kpis/export/excel', controller.exportKpisExcel);
router.get('/kpis/export/pdf', controller.exportKpisPdf);

module.exports = router;
