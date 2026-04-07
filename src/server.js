// Cargar variables de entorno lo primero de todo
require('dotenv').config();

const app = require('./app');

const PORT = process.env.PORT;

app.listen(PORT, () => {
    console.log(`🚀 Servidor de FrogPay corriendo en el puerto ${PORT}`);
});