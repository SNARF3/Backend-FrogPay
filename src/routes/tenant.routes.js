const express = require('express');
const router = express.Router();
const { registerTenant } = require('../modules/tenants/tenant.controller');

// Exponemos la ruta POST /register
router.post('/register', registerTenant);

module.exports = router;