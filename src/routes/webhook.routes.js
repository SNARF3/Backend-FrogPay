const express = require('express');
const router = express.Router();

const { authMiddleware } = require('../middlewares/auth.middleware');
const { tenantRateLimit } = require('../middlewares/rateLimit.middleware');
const {
  getWebhookConfig,
  upsertWebhookConfig,
} = require('../modules/webhooks/webhook.controller');

router.use(authMiddleware, tenantRateLimit);

router.get('/', getWebhookConfig);
router.put('/', upsertWebhookConfig);

module.exports = router;
