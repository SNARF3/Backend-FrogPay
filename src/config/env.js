const env = {
  PORT: process.env.PORT,
  JWT_SECRET: process.env.JWT_SECRET,
  DB_USER: process.env.DB_USER,
  DB_HOST: process.env.DB_HOST,
  DB_NAME: process.env.DB_NAME,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_PORT: process.env.DB_PORT,
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
  PAYPAL_BASE_URL: process.env.PAYPAL_BASE_URL,
  DEFAULT_PROVIDER: process.env.DEFAULT_PROVIDER,
};

module.exports = env;
