const express = require('express');
const router = express.Router();
const { registerTenant } = require('../modules/tenants/tenant.controller');

// Ruta final: /api/tenants/register
router.post('/register', registerTenant);

module.exports = router;