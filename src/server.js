// Cargar variables de entorno lo primero de todo
require('dotenv').config();

const app = require('./app');
const enableWebhooks = process.env.ENABLE_WEBHOOKS === 'true';
// const webhookWorker = enableWebhooks ? require('./modules/webhooks/webhook.worker') : null;
// const webhookPolling = enableWebhooks ? require('./modules/webhooks/webhook.polling') : null;

const PORT = process.env.PORT;

app.listen(PORT, () => {
    console.log(`🚀 Servidor de FrogPay corriendo en el puerto ${PORT}`);
    if (enableWebhooks) {
        // webhookWorker.start();
        // webhookPolling.start();
        console.log('[Webhooks] Desactivados temporalmente (Redis no disponible).');
    } else {
        console.log('[Webhooks] Desactivados. Define ENABLE_WEBHOOKS=true para habilitarlos.');
    }
});