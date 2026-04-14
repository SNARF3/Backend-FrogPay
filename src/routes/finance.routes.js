const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth.middleware');
const { getFinanceKpisController,getChart } = require('../modules/finances/finance.controller');

router.get('/kpis', authMiddleware, getFinanceKpisController);
router.get('/chart', authMiddleware, getChart);
module.exports = router;