const { Queue } = require('bullmq');
const { connection } = require('../../config/redis');

const webhookQueue = new Queue('webhook-queue', { connection });

module.exports = {
  webhookQueue,
};
