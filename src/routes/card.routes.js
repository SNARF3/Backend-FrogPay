const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth.middleware');
const { tokenize } = require('../modules/cards/card.controller');

// 💳 Tokenizar tarjeta (un solo uso, Redis TTL 15 min)
router.post('/tokenize', authMiddleware, tokenize);

module.exports = router;
