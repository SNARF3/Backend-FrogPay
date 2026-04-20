const express = require('express');
const router = express.Router();
const qrController = require('../modules/qr/qr.controller');

router.get('/qr/:paymentId', qrController.renderQrPage);

module.exports = router;
