const PaymentProvider = require('./provider.interface');
const { PaymentFailedError } = require('../../utils/errors');
const env = require('../../config/env');

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

    const data = await response.json();

    if (!response.ok) {
      throw new PaymentFailedError('Failed to obtain PayPal access token', data);
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

    const order = await createRes.json();

    if (!createRes.ok) {
      throw new PaymentFailedError('Failed to create PayPal order', order);
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

    const captured = await captureRes.json();

    if (!captureRes.ok) {
      throw new PaymentFailedError('Failed to capture PayPal order', captured);
    }

    return { success: true, transactionId: orderId, status: 'COMPLETED', raw: captured };
  }

  async refund(transactionId, amount) {
    const accessToken = await this._getAccessToken();

    const orderRes = await fetch(
      `${env.PAYPAL_BASE_URL}/v2/checkout/orders/${transactionId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const order = await orderRes.json();

    if (!orderRes.ok) {
      throw new PaymentFailedError('Failed to retrieve PayPal order for refund', order);
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
      throw new PaymentFailedError('Failed to refund PayPal payment', refund);
    }

    return { success: true, refundId: refund.id, status: 'REFUNDED', raw: refund };
  }

  async getStatus(transactionId) {
    const accessToken = await this._getAccessToken();

    const res = await fetch(
      `${env.PAYPAL_BASE_URL}/v2/checkout/orders/${transactionId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new PaymentFailedError('Failed to get PayPal order status', data);
    }

    return { success: true, transactionId, status: data.status, raw: data };
  }
}

module.exports = PayPalProvider;
