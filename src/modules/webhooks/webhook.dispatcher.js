const { webhookQueue } = require('./webhook.queue');

/**
 * Dispatcher responsible for enqueuing webhook events into BullMQ.
 * This is the entry point for notifying external systems of state changes.
 */
class WebhookDispatcher {
  /**
   * Enqueues a notification job for a payment status change.
   * @param {Object} payment - The payment object containing at least id, empresa_id, and estado.
   * @param {string} eventName - The name of the event (e.g., 'pago.completado').
   */
  async dispatch(payment, eventName) {
    try {
      console.log(`[WebhookDispatcher] Enqueuing event ${eventName} for payment ${payment.id}`);
      
      const jobData = {
        paymentId: payment.id,
        empresaId: payment.empresa_id,
        status: payment.estado,
        monto: payment.monto,
        moneda: payment.moneda,
        eventName: eventName,
        timestamp: new Date().toISOString()
      };

      // Add to BullMQ queue with retry logic
      await webhookQueue.add(`webhook-${payment.id}-${eventName}`, jobData, {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5000, // 5s, 10s, 20s...
        },
      });

      return true;
    } catch (error) {
      console.error('[WebhookDispatcher] Error enqueuing webhook job:', error);
      return false;
    }
  }
}

module.exports = new WebhookDispatcher();
