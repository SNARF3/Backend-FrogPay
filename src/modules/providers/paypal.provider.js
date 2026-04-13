const { PaymentProvider } = require('./provider.interface');
const { PaymentFailedError, TechnicalError } = require('../../utils/errors');
const env = require('../../config/env');

function isTechnicalStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

function buildError(operation, response, data) {
  const payload = data || {};
  const message = payload.error_description || payload.message || payload.name || `PayPal ${operation} failed`;

  if (isTechnicalStatus(response.status)) {
    return new TechnicalError(message, {
      code: 'PAYPAL_TECHNICAL_ERROR',
      statusCode: response.status || 503,
      details: payload,
    });
  }

  return new PaymentFailedError(message, payload);
}

function hasIssue(data, issueCode) {
  return Array.isArray(data?.details) && data.details.some((detail) => detail?.issue === issueCode);
}

class PayPalProvider extends PaymentProvider {
  async _getAccessToken() {
    const credentials = Buffer.from(
      `${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`
    ).toString('base64');

    const response = await fetch(`${env.PAYPAL_BASE_URL}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    const data = await readJsonSafe(response);

    if (!response.ok) {
      throw buildError('obtain access token', response, data);
    }

    return data.access_token;
  }

  // Paso 1: crea la orden y devuelve la URL de aprobación
  async createOrder(payload) {
    const { amount, currency, description } = payload;
    const accessToken = await this._getAccessToken();

    const createRes = await fetch(`${env.PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            description,
            amount: { currency_code: currency, value: String(amount) },
          },
        ],
        application_context: {
          return_url: 'http://localhost:5173/checkout',
          cancel_url: 'http://localhost:5173/checkout',
          user_action: 'PAY_NOW',
        },
      }),
    });

    const order = await createRes.json();

    if (!createRes.ok) {
      throw new PaymentFailedError('Failed to create PayPal order', order);
    }

    const approvalUrl = order.links?.find((l) => l.rel === 'approve')?.href;

    return {
      orderId: order.id,
      approvalUrl,
      status: order.status,
    };
  }

  // Paso 2: captura la orden ya aprobada por el usuario
  async captureOrder(orderId) {
    const accessToken = await this._getAccessToken();

    const captureRes = await fetch(
      `${env.PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const captured = await captureRes.json();

    if (!captureRes.ok) {
      throw new PaymentFailedError('Failed to capture PayPal order', captured);
    }

    return { success: true, transactionId: orderId, status: 'COMPLETED', raw: captured };
  }

  async charge(payload) {
    const { amount, currency, description } = payload;
    const accessToken = await this._getAccessToken();

    const createRes = await fetch(`${env.PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            description,
            amount: { currency_code: currency, value: String(amount) },
          },
        ],
      }),
    });

    const order = await readJsonSafe(createRes);

    if (!createRes.ok) {
      throw buildError('create PayPal order', createRes, order);
    }

    const orderId = order.id;

    const captureRes = await fetch(
      `${env.PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const captured = await readJsonSafe(captureRes);

    if (!captureRes.ok) {
      if (
        process.env.PAYPAL_DEV_SIMULATE_SUCCESS === 'true' &&
        hasIssue(captured, 'ORDER_NOT_APPROVED')
      ) {
        return {
          success: true,
          providerTransactionId: orderId,
          status: 'COMPLETED',
          responseCode: 'PAYPAL_SANDBOX_SIMULATION',
          message: 'Pago completado en modo developer (sandbox sin aprobacion de comprador).',
          raw: {
            simulated: true,
            order,
            captureError: captured,
          },
        };
      }

      throw buildError('capture PayPal order', captureRes, captured);
    }

    return { success: true, providerTransactionId: orderId, status: 'COMPLETED', message: 'Pago completado con PayPal', raw: captured };
  }

  async refund(transactionId, amount) {
    const accessToken = await this._getAccessToken();

    const orderRes = await fetch(
      `${env.PAYPAL_BASE_URL}/v2/checkout/orders/${transactionId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const order = await readJsonSafe(orderRes);

    if (!orderRes.ok) {
      throw buildError('retrieve PayPal order for refund', orderRes, order);
    }

    const captureId =
      order.purchase_units?.[0]?.payments?.captures?.[0]?.id;

    if (!captureId) {
      throw new PaymentFailedError('No capture ID found for refund', order);
    }

    const refundRes = await fetch(
      `${env.PAYPAL_BASE_URL}/v2/payments/captures/${captureId}/refund`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          amount ? { amount: { value: String(amount), currency_code: order.purchase_units[0].amount.currency_code } } : {}
        ),
      }
    );

    const refund = await refundRes.json();

    if (!refundRes.ok) {
      throw buildError('refund PayPal payment', refundRes, refund);
    }

    return { success: true, providerRefundId: refund.id, status: 'REFUNDED', raw: refund };
  }

  async getStatus(transactionId) {
    const accessToken = await this._getAccessToken();

    const res = await fetch(
      `${env.PAYPAL_BASE_URL}/v2/checkout/orders/${transactionId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const data = await readJsonSafe(res);

    if (!res.ok) {
      throw buildError('get PayPal order status', res, data);
    }

    return { success: true, providerTransactionId: transactionId, status: data.status, raw: data };
  }
}

module.exports = new PayPalProvider();
