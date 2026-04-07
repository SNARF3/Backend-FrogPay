// Cargar variables de entorno lo primero de todo
require('dotenv').config();

const app = require('./app');
const webhookWorker = require('./modules/webhooks/webhook.worker');
const webhookPolling = require('./modules/webhooks/webhook.polling');

const PORT = process.env.PORT;

app.listen(PORT, () => {
    console.log(`🚀 Servidor de FrogPay corriendo en el puerto ${PORT}`);
    webhookWorker.start();
    webhookPolling.start();
});