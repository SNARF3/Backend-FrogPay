const { Worker } = require('bullmq');
const { connection } = require('../../config/redis');
const pool = require('../../config/database');

/**
 * Worker that processes the webhook queue and sends POST requests.
 * It's isolated for scalability and processes the actual HTTP calls.
 */
class WebhookWorker {
  constructor() {
    this.worker = new Worker('webhook-queue', async (job) => {
      const { paymentId, empresaId, status, monto, moneda, eventName, timestamp } = job.data;
      console.log(`[WebhookWorker] Processing job for payment ${paymentId}`);

      try {
        // 1. Fetch registered webhooks for this company and event
        const webhookResult = await pool.query(
          'SELECT id, url FROM webhooks WHERE empresa_id = $1 AND activo = true',
          [empresaId]
        );

        if (webhookResult.rows.length === 0) {
          console.log(`[WebhookWorker] No active webhooks found for empresa ${empresaId}`);
          return;
        }

        for (const webhookConfig of webhookResult.rows) {
          const payload = {
            event: eventName,
            data: {
              payment_id: paymentId,
              status: status,
              amount: monto,
              currency: moneda,
              occurred_at: timestamp
            }
          };

          // Guard rail idempotente: evita reenviar si ese webhook ya tuvo exito
          // para el mismo payment_id y estado.
          const alreadyDelivered = await pool.query(
            `
              SELECT 1
              FROM logs_webhooks l
              WHERE l.webhook_id = $1
                AND l.estado = 'success'
                AND (l.payload->'data'->>'payment_id') = $2
                AND (l.payload->'data'->>'status') = $3
              LIMIT 1
            `,
            [webhookConfig.id, String(paymentId), String(status)]
          );

          if (alreadyDelivered.rows.length > 0) {
            continue;
          }

          let deliveryStatus = 'success';
          let errorInfo = null;

          try {
            const response = await fetch(webhookConfig.url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'FrogPay/1.0 Webhook Dispatcher'
              },
              body: JSON.stringify(payload),
            });

            if (!response.ok) {
              deliveryStatus = 'failed';
              errorInfo = `HTTP ${response.status}: ${response.statusText}`;
            }
          } catch (error) {
            deliveryStatus = 'failed';
            errorInfo = error.message;
          }

          // 2. Log result to logs_webhooks table
          await pool.query(
            `INSERT INTO logs_webhooks (webhook_id, payload, estado, intentos, ultimo_intento) 
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
            [webhookConfig.id, JSON.stringify(payload), deliveryStatus, job.attemptsMade + 1]
          );

          if (deliveryStatus === 'failed') {
            throw new Error(`Webhook notification failed for ${webhookConfig.url}: ${errorInfo}`);
          }
        }
      } catch (error) {
        console.error(`[WebhookWorker] Job failed:`, error.message);
        throw error; // Rethrow lets BullMQ handle retry
      }
    }, { connection });

    this.worker.on('completed', (job) => {
      console.log(`[WebhookWorker] Job ${job.id} completed successfully.`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[WebhookWorker] Job ${job.id} failed after ${job.attemptsMade} attempts: ${err.message}`);
    });
  }

  start() {
    console.log('[WebhookWorker] Webhook worker initialized and listening...');
  }
}

module.exports = new WebhookWorker();
