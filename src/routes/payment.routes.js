const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth.middleware');
const pool = require('../config/database');

// Toda ruta de pagos usa el middleware automáticamente
router.use(authMiddleware);

// Ruta final: /api/payments/
router.post('/', async (req, res) => {
    // Ejemplo rápido de cómo usar la empresa_id inyectada
    try {
        const empresaId = req.empresaId; 
        res.status(201).json({ mensaje: `Pago autorizado para la empresa ID: ${empresaId}` });
    } catch (error) {
        res.status(500).json({ error: "Error en pago" });
    }
});

module.exports = router;