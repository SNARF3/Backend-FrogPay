const express = require('express');
const router = express.Router();
const { 
    registerTenant, 
    loginTenant, 
    getTenantMe, 
    upgradePlan, 
    downgradePlan,
    getTenantUsage 
} = require('../modules/tenants/tenant.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');

// Public routes
router.post('/register', registerTenant);
router.post('/login', loginTenant);

// Protected routes
router.get('/me', authMiddleware, getTenantMe);
router.put('/upgrade', authMiddleware, upgradePlan);
router.put('/downgrade', authMiddleware, downgradePlan);
router.get('/usage', authMiddleware, getTenantUsage);

module.exports = router;