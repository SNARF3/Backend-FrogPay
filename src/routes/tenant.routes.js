const express = require('express');
const router = express.Router();
const { registerTenant, loginTenant } = require('../modules/tenants/tenant.controller');


// Exponemos la ruta POST /register
router.post('/register', registerTenant);
router.post('/login', loginTenant);
module.exports = router;