const express = require('express');
const router = express.Router();
const { registerTenant, loginTenant, getTenantUsage } = require('../modules/tenants/tenant.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');

// Exponemos la ruta POST /register
router.post('/register', registerTenant);
router.post('/login', loginTenant);

// Cuota de uso (Protegido)
router.get('/usage', authMiddleware, getTenantUsage);

module.exports = router;