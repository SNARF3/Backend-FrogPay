const Redis = require('ioredis');
require('dotenv').config();

const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || null,
  maxRetriesPerRequest: null, // Critical requirement for BullMQ
};

const connection = new Redis(redisConfig);

module.exports = {
  connection,
  redisConfig,
};
