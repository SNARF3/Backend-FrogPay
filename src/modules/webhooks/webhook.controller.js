const pool = require('../../config/database');

function normalizeEvent(input) {
  const value = String(input || 'payment.completed').trim();
  return value || 'payment.completed';
}

async function getWebhookConfig(req, res) {
  try {
    const empresaId = req.empresaId;
    const { rows } = await pool.query(
      `
        SELECT id, url, evento, activo, creado_en
        FROM webhooks
        WHERE empresa_id = $1
        ORDER BY creado_en DESC
        LIMIT 1
      `,
      [empresaId]
    );

    return res.status(200).json({
      data: rows[0] || null,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Error obteniendo configuración de webhook',
      code: 'WEBHOOK_FETCH_FAILED',
    });
  }
}

async function upsertWebhookConfig(req, res) {
  try {
    const empresaId = req.empresaId;
    const { url, evento, activo } = req.body || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        error: 'La URL del webhook es obligatoria',
        code: 'WEBHOOK_URL_REQUIRED',
      });
    }

    if (!url.startsWith('https://')) {
      return res.status(400).json({
        error: 'La URL del webhook debe usar HTTPS',
        code: 'WEBHOOK_URL_NOT_HTTPS',
      });
    }

    const eventName = normalizeEvent(evento);
    const isActive = activo !== false;

    const existing = await pool.query(
      `
        SELECT id
        FROM webhooks
        WHERE empresa_id = $1
        ORDER BY creado_en DESC
        LIMIT 1
      `,
      [empresaId]
    );

    let result;
    if (existing.rows.length > 0) {
      result = await pool.query(
        `
          UPDATE webhooks
          SET url = $1, evento = $2, activo = $3
          WHERE id = $4
          RETURNING id, url, evento, activo, creado_en
        `,
        [url, eventName, isActive, existing.rows[0].id]
      );
    } else {
      result = await pool.query(
        `
          INSERT INTO webhooks (empresa_id, url, evento, activo)
          VALUES ($1, $2, $3, $4)
          RETURNING id, url, evento, activo, creado_en
        `,
        [empresaId, url, eventName, isActive]
      );
    }

    return res.status(200).json({
      message: 'Webhook actualizado correctamente',
      data: result.rows[0],
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Error guardando webhook',
      code: 'WEBHOOK_UPSERT_FAILED',
    });
  }
}

module.exports = {
  getWebhookConfig,
  upsertWebhookConfig,
};
