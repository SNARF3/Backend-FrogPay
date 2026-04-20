const paymentModel = require('../payments/payment.model');
const auditLogger = require('../../utils/auditLogger');
const logger = require('../../utils/logger');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidPaymentId(id) {
    return typeof id === 'string' && (UUID_REGEX.test(id) || /^\d+$/.test(id));
}

function buildQrPage(payment) {
    const isPending = payment.estado === 'PENDING';
    const isCompleted = payment.estado === 'COMPLETED';

    const statusColor = isCompleted ? '#22c55e' : payment.estado === 'FAILED' ? '#ef4444' : '#f59e0b';
    const statusLabel = isCompleted ? 'Pago completado' : payment.estado === 'FAILED' ? 'Pago cancelado' : 'Pendiente de pago';

    const qrImage = payment.qr_code
        ? `<img src="${payment.qr_code}" alt="Codigo QR de pago" style="width:200px;height:200px;border:1px solid #e5e7eb;border-radius:8px;">`
        : '<p style="color:#9ca3af;font-size:14px;">QR no disponible</p>';

    const actionButtons = isPending
        ? `
        <div id="actions" style="display:flex;gap:12px;justify-content:center;margin-top:24px;">
            <button
                onclick="handleAction('confirm')"
                style="background:#22c55e;color:#fff;border:none;padding:12px 28px;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;">
                Confirmar Pago
            </button>
            <button
                onclick="handleAction('fail')"
                style="background:#ef4444;color:#fff;border:none;padding:12px 28px;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;">
                Cancelar Pago
            </button>
        </div>
        <p style="margin-top:14px;font-size:12px;color:#9ca3af;">Escanea el QR con tu celular o usa los botones para simular el pago.</p>`
        : '';

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FrogPay - Confirmar Pago</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f4f6; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .card { background: #fff; border-radius: 16px; padding: 32px; max-width: 420px; width: 90%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
        .logo { font-size: 24px; font-weight: 700; color: #1e293b; margin-bottom: 8px; }
        .subtitle { color: #64748b; font-size: 14px; margin-bottom: 24px; }
        .divider { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
        .amount { font-size: 36px; font-weight: 700; color: #1e293b; }
        .currency { font-size: 16px; color: #64748b; margin-top: 4px; }
        .payment-id { font-size: 12px; color: #9ca3af; margin-top: 8px; }
        .qr-container { margin: 20px auto; display: flex; justify-content: center; }
        .status-badge { display: inline-block; padding: 6px 16px; border-radius: 999px; font-size: 14px; font-weight: 600; color: #fff; background: ${statusColor}; margin-top: 12px; }
        .footer { margin-top: 24px; font-size: 11px; color: #9ca3af; }
        button:hover { opacity: 0.9; }
        button:active { transform: scale(0.98); }
        #message { margin-top: 16px; font-size: 14px; font-weight: 500; min-height: 20px; }
    </style>
</head>
<body>
    <div class="card">
        <div class="logo">FrogPay</div>
        <div class="subtitle">Confirmar pago con QR</div>
        <hr class="divider">
        <div class="amount">${Number(payment.monto).toFixed(2)}</div>
        <div class="currency">${payment.moneda}</div>
        <div class="payment-id">Pago #${payment.id}</div>
        <div class="qr-container">${qrImage}</div>
        <span class="status-badge">${statusLabel}</span>
        ${actionButtons}
        <div id="message"></div>
        <hr class="divider">
        <div class="footer">Pagina de simulacion de pago. No realizar transacciones reales.</div>
    </div>
    <script>
        const PAYMENT_ID = '${payment.id}';
        const IS_PENDING = ${isPending};
        let pollingTimer = null;

        async function handleAction(action) {
            const msg = document.getElementById('message');
            const actions = document.getElementById('actions');
            if (actions) actions.style.pointerEvents = 'none';
            msg.textContent = 'Procesando...';
            msg.style.color = '#64748b';
            try {
                const res = await fetch('/api/qr/' + PAYMENT_ID + '/' + action, { method: 'POST' });
                const data = await res.json();
                if (res.ok) {
                    stopPolling();
                    showResult(data.status);
                } else {
                    msg.textContent = data.error || 'Error procesando la accion.';
                    msg.style.color = '#ef4444';
                    if (actions) actions.style.pointerEvents = 'auto';
                }
            } catch (e) {
                msg.textContent = 'Error de conexion. Intenta nuevamente.';
                msg.style.color = '#ef4444';
                if (actions) actions.style.pointerEvents = 'auto';
            }
        }

        function showResult(status) {
            const isOk = status === 'COMPLETED';
            const color = isOk ? '#22c55e' : '#ef4444';
            const label = isOk ? 'Pago completado' : 'Pago cancelado';
            const badge = document.querySelector('.status-badge');
            const actions = document.getElementById('actions');
            const msg = document.getElementById('message');
            if (badge) { badge.textContent = label; badge.style.background = color; }
            if (actions) actions.remove();
            if (msg) { msg.textContent = isOk ? 'Transaccion procesada correctamente.' : 'El pago fue cancelado.'; msg.style.color = color; }
        }

        function stopPolling() {
            if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
        }

        async function pollStatus() {
            try {
                const res = await fetch('/api/qr/' + PAYMENT_ID + '/status');
                const data = await res.json();
                if (data.status && data.status !== 'PENDING') {
                    stopPolling();
                    showResult(data.status);
                }
            } catch (_) {}
        }

        if (IS_PENDING) {
            pollingTimer = setInterval(pollStatus, 3000);
        }
    </script>
</body>
</html>`;
}

async function renderQrPage(req, res) {
    const paymentId = req.params.paymentId;
    if (!isValidPaymentId(paymentId)) {
        return res.status(400).send('<h2>ID de pago invalido</h2>');
    }

    try {
        const payment = await paymentModel.findPaymentById(paymentId);
        if (!payment) {
            return res.status(404).send(`<!DOCTYPE html><html><head><title>FrogPay</title></head><body style="font-family:sans-serif;text-align:center;padding:40px;"><h2>Pago no encontrado</h2><p>El pago #${paymentId} no existe.</p></body></html>`);
        }

        return res.status(200).type('text/html').send(buildQrPage(payment));
    } catch (error) {
        logger.error(`renderQrPage: ${error.message}`);
        return res.status(500).send('<h2>Error interno. Intenta nuevamente.</h2>');
    }
}

async function confirmQrPayment(req, res) {
    const paymentId = req.params.paymentId;
    if (!isValidPaymentId(paymentId)) {
        return res.status(400).json({ error: 'ID de pago invalido', code: 'INVALID_PAYMENT_ID' });
    }

    try {
        const payment = await paymentModel.findPaymentById(paymentId);
        if (!payment) {
            return res.status(404).json({ error: 'Pago no encontrado', code: 'PAYMENT_NOT_FOUND' });
        }

        if (payment.estado !== 'PENDING') {
            return res.status(200).json({
                success: true,
                payment_id: paymentId,
                status: payment.estado,
                message: 'El pago ya fue procesado anteriormente.',
            });
        }

        await paymentModel.updatePaymentStatus(paymentId, payment.empresa_id, 'COMPLETED');

        await paymentModel.insertTransaction({
            pagoId: paymentId,
            idTransaccionProveedor: `qr_${paymentId}`,
            estado: 'COMPLETED',
            codigoRespuesta: 'QR_CONFIRMED',
            mensajeRespuesta: 'Pago QR confirmado por el usuario',
        });

        await paymentModel.incrementMonthlyUsage(payment.empresa_id, payment.monto);

        await auditLogger.recordPaymentEvent({
            empresaId: payment.empresa_id,
            paymentId,
            from: 'PENDING',
            to: 'COMPLETED',
            provider: 'qr',
            providerTransactionId: `qr_${paymentId}`,
        });

        return res.status(200).json({
            success: true,
            payment_id: paymentId,
            status: 'COMPLETED',
        });
    } catch (error) {
        logger.error(`confirmQrPayment: ${error.message}`);
        return res.status(500).json({ error: 'Error interno', code: 'INTERNAL_ERROR' });
    }
}

async function failQrPayment(req, res) {
    const paymentId = req.params.paymentId;
    if (!isValidPaymentId(paymentId)) {
        return res.status(400).json({ error: 'ID de pago invalido', code: 'INVALID_PAYMENT_ID' });
    }

    try {
        const payment = await paymentModel.findPaymentById(paymentId);
        if (!payment) {
            return res.status(404).json({ error: 'Pago no encontrado', code: 'PAYMENT_NOT_FOUND' });
        }

        if (payment.estado !== 'PENDING') {
            return res.status(200).json({
                success: true,
                payment_id: paymentId,
                status: payment.estado,
                message: 'El pago ya fue procesado anteriormente.',
            });
        }

        await paymentModel.updatePaymentStatus(paymentId, payment.empresa_id, 'FAILED');

        await paymentModel.insertTransaction({
            pagoId: paymentId,
            idTransaccionProveedor: `qr_${paymentId}`,
            estado: 'FAILED',
            codigoRespuesta: 'QR_CANCELLED',
            mensajeRespuesta: 'Pago QR cancelado por el usuario',
        });

        await auditLogger.recordPaymentEvent({
            empresaId: payment.empresa_id,
            paymentId,
            from: 'PENDING',
            to: 'FAILED',
            provider: 'qr',
            providerTransactionId: `qr_${paymentId}`,
        });

        return res.status(200).json({
            success: true,
            payment_id: paymentId,
            status: 'FAILED',
        });
    } catch (error) {
        logger.error(`failQrPayment: ${error.message}`);
        return res.status(500).json({ error: 'Error interno', code: 'INTERNAL_ERROR' });
    }
}

async function getQrPaymentStatus(req, res) {
    const paymentId = req.params.paymentId;
    if (!isValidPaymentId(paymentId)) {
        return res.status(400).json({ error: 'ID de pago invalido', code: 'INVALID_PAYMENT_ID' });
    }
    try {
        const payment = await paymentModel.findPaymentById(paymentId);
        if (!payment) {
            return res.status(404).json({ error: 'Pago no encontrado', code: 'PAYMENT_NOT_FOUND' });
        }
        return res.status(200).json({ payment_id: paymentId, status: payment.estado });
    } catch (error) {
        logger.error(`getQrPaymentStatus: ${error.message}`);
        return res.status(500).json({ error: 'Error interno', code: 'INTERNAL_ERROR' });
    }
}

module.exports = {
    renderQrPage,
    confirmQrPayment,
    failQrPayment,
    getQrPaymentStatus,
};
