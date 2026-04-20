const express = require('express');
const router = express.Router();
const currencyController = require('./currency.controller');

router.get('/', currencyController.getCurrencies);

module.exports = router;