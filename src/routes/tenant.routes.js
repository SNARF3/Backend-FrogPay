const express = require('express');
const router = express.Router();
const { registerTenant, loginTenant, getTenantMe, upgradePlan, downgradePlan } = require('../modules/tenants/tenant.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');

// Rutas públicas (no requieren auth)
router.post('/register', registerTenant);
router.post('/login', loginTenant);

// Rutas protegidas (requieren JWT o API Key)
router.get('/me', authMiddleware, getTenantMe);
router.put('/upgrade', authMiddleware, upgradePlan);
router.put('/downgrade', authMiddleware, downgradePlan);

module.exports = router;
