const express = require('express');
const routes = require('./routes/index'); // Llama al index de rutas

const app = express();

// Middlewares globales
app.use(express.json());

// Inyectar todas las rutas bajo el prefijo /api
app.use('/api', routes);

module.exports = app;