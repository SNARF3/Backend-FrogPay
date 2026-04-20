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
    this.retryCooldownSeconds = 30;
  }

  async checkUnnotifiedPayments() {
    try {
      console.log('[WebhookPollingService] Checking for unnotified payments...');

      // 1) Solo pagos de empresas con al menos un webhook activo.
      // 2) Excluye pagos ya entregados con exito para el estado actual.
      // 3) Aplica cooldown para no reencolar cada ciclo cuando hay fallos.
      const query = `
        WITH active_companies AS (
          SELECT DISTINCT empresa_id
          FROM webhooks
          WHERE activo = true
        )
        SELECT p.*
        FROM pagos p
        INNER JOIN active_companies ac ON ac.empresa_id = p.empresa_id
        WHERE NOT EXISTS (
          SELECT 1
          FROM logs_webhooks l
          INNER JOIN webhooks w ON w.id = l.webhook_id
          WHERE w.empresa_id = p.empresa_id
            AND (l.payload->'data'->>'payment_id') = p.id::text
            AND (l.payload->'data'->>'status') = p.estado
            AND l.estado = 'success'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM logs_webhooks l
          INNER JOIN webhooks w ON w.id = l.webhook_id
          WHERE w.empresa_id = p.empresa_id
            AND (l.payload->'data'->>'payment_id') = p.id::text
            AND (l.payload->'data'->>'status') = p.estado
            AND COALESCE(l.ultimo_intento, CURRENT_TIMESTAMP - INTERVAL '365 days') >=
              CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 second')
        )
        ORDER BY p.actualizado_en DESC
        LIMIT 50
      `;

      const result = await pool.query(query, [this.retryCooldownSeconds]);

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
