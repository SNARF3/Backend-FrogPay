const pool = require('../../config/database');
const webhookDispatcher = require('./webhook.dispatcher');

/**
 * WebhookPollingService
 * Periodically checks for payments that haven't been notified for their current status.
 * This simulates a webhook trigger based on database polling as requested.
 */
class WebhookPollingService {
  constructor(intervalMs = 3000) {
    this.intervalMs = intervalMs;
    this.isRunning = false;
    this.timer = null;
  }

  async checkUnnotifiedPayments() {
    try {
      console.log('[WebhookPollingService] Checking for unnotified payments...');

      /**
       * Query to find payments that don't have a record in logs_webhooks for their current state.
       * We use JSONB operators to check the payload field.
       */
      const query = `
        SELECT p.*
        FROM pagos p
        WHERE NOT EXISTS (
          SELECT 1 
          FROM logs_webhooks l 
          WHERE (l.payload->'data'->>'payment_id')::uuid = p.id 
          AND l.payload->'data'->>'status' = p.estado
          AND l.estado = 'success'
        )
        ORDER BY p.actualizado_en DESC
        LIMIT 50
      `;

      const result = await pool.query(query);

      for (const payment of result.rows) {
        console.log(`[WebhookPollingService] Found unnotified payment: ${payment.id} state: ${payment.estado}`);

        // Trigger the dispatcher for this specific status
        const eventName = `pago.${payment.estado.toLowerCase().replace(/\s+/g, '_')}`;
        await webhookDispatcher.dispatch(payment, eventName);
      }
    } catch (error) {
      console.error('[WebhookPollingService] Error during polling:', error);
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[WebhookPollingService] Started polling every ${this.intervalMs / 1000}s`);

    this.timer = setInterval(() => {
      this.checkUnnotifiedPayments();
    }, this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }
}

module.exports = new WebhookPollingService();
