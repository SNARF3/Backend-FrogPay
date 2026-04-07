class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

class NotImplementedError extends AppError {
  constructor(methodName) {
    super(`Method "${methodName}" is not implemented`, 501);
    this.name = 'NotImplementedError';
  }
}

class ProviderNotFoundError extends AppError {
  constructor(providerName) {
    super(`Provider "${providerName}" is not registered`, 400);
    this.name = 'ProviderNotFoundError';
  }
}

class PaymentFailedError extends AppError {
  constructor(message, raw) {
    super(message, 502);
    this.name = 'PaymentFailedError';
    this.raw = raw;
  }
}

module.exports = { AppError, NotImplementedError, ProviderNotFoundError, PaymentFailedError };
