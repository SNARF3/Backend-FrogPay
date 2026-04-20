const Stripe = require('stripe');
const { PaymentProvider } = require('./provider.interface');
const { BusinessError, TechnicalError } = require('../../utils/errors');
const env = require('../../config/env');

function toMinorUnits(amount, currency) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new BusinessError('Monto inválido para Stripe', {
      code: 'INVALID_AMOUNT',
      statusCode: 400,
    });
  }

  const zeroDecimal = new Set(['JPY', 'KRW']);
  const normalizedCurrency = String(currency || 'USD').toUpperCase();
  if (zeroDecimal.has(normalizedCurrency)) {
    return Math.round(value);
  }
  return Math.round(value * 100);
}

class StripeProvider extends PaymentProvider {
  constructor() {
    super();
    this.client = null;
  }

  get stripe() {
    if (!env.STRIPE_SECRET_KEY) {
      throw new TechnicalError('Falta STRIPE_SECRET_KEY en el entorno', {
        code: 'STRIPE_NOT_CONFIGURED',
        statusCode: 500,
      });
    }

    if (!this.client) {
      this.client = new Stripe(env.STRIPE_SECRET_KEY, {
        apiVersion: '2025-03-31.basil',
      });
    }

    return this.client;
  }

  async charge(paymentData) {
    const paymentMethodId = paymentData.token;
    if (!paymentMethodId) {
      throw new BusinessError('paymentMethodId es obligatorio para Stripe', {
        code: 'STRIPE_PAYMENT_METHOD_REQUIRED',
        statusCode: 400,
      });
    }

    try {
      const intent = await this.stripe.paymentIntents.create({
        amount: toMinorUnits(paymentData.amount, paymentData.currency),
        currency: String(paymentData.currency || 'usd').toLowerCase(),
        payment_method: paymentMethodId,
        confirm: true,
        description: paymentData.description || 'Pago FrogPay con Stripe',
        metadata: {
          paymentId: paymentData.paymentId || '',
          empresaId: paymentData.empresaId || '',
        },
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never',
        },
      });

      if (intent.status !== 'succeeded' && intent.status !== 'processing') {
        throw new BusinessError(`Stripe devolvió estado no exitoso: ${intent.status}`, {
          code: 'STRIPE_CHARGE_NOT_COMPLETED',
          statusCode: 402,
          details: { status: intent.status },
        });
      }

      return {
        providerTransactionId: intent.id,
        status: 'COMPLETED',
        responseCode: '00',
        message: 'Pago aprobado por Stripe',
      };
    } catch (error) {
      if (error instanceof BusinessError || error instanceof TechnicalError) {
        throw error;
      }

      const type = String(error?.type || '');
      if (type.startsWith('StripeCardError') || error?.code === 'card_declined') {
        throw new BusinessError(error.message || 'Pago rechazado por Stripe', {
          code: 'STRIPE_CARD_DECLINED',
          statusCode: 402,
        });
      }

      throw new TechnicalError(error.message || 'Error técnico con Stripe', {
        code: 'STRIPE_TECHNICAL_ERROR',
        statusCode: 502,
      });
    }
  }

  async refund({ transactionId, amount }) {
    try {
      const data = {
        payment_intent: transactionId,
      };

      if (amount) {
        data.amount = toMinorUnits(amount, 'USD');
      }

      const refund = await this.stripe.refunds.create(data);
      return {
        success: true,
        providerRefundId: refund.id,
        status: refund.status === 'succeeded' ? 'REFUNDED' : refund.status,
      };
    } catch (error) {
      throw new TechnicalError(error.message || 'Error técnico en refund Stripe', {
        code: 'STRIPE_REFUND_ERROR',
        statusCode: 502,
      });
    }
  }

  async getStatus(transactionId) {
    try {
      const intent = await this.stripe.paymentIntents.retrieve(transactionId);
      return {
        success: true,
        providerTransactionId: intent.id,
        status: intent.status,
      };
    } catch (error) {
      throw new TechnicalError(error.message || 'No se pudo consultar estado en Stripe', {
        code: 'STRIPE_STATUS_ERROR',
        statusCode: 502,
      });
    }
  }
}

module.exports = new StripeProvider();
