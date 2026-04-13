const pool = require('../config/database');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
require('dotenv').config(); // 👈 CRÍTICO: Asegura que JWT_SECRET exista aquí

const authMiddleware = async (req, res, next) => {
    
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        
        // Estrategia 1: JWT (Bearer Token)
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            
            try {
                // Verificamos el token
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                
                req.empresaId = decoded.empresaId;
                req.usuarioId = decoded.usuarioId || decoded.sub; 
                
                if (!req.empresaId) {
                    return res.status(401).json({ error: "Token válido, pero sin empresa asignada." });
                }

                return next(); 
            } catch (jwtError) {
                return res.status(401).json({ 
                    error: "Token JWT inválido o expirado.", 
                    detalle: jwtError.message 
                });
            }
        }

        // Estrategia 2: API Key (para integraciones externas)
        const apiKeyHeader = req.headers['x-api-key'];

        if (!apiKeyHeader) {
            return res.status(401).json({ 
                error: "Falta autenticación. Se requiere 'Authorization: Bearer <token>' o 'x-api-key'." 
            });
        }

        // Hashear la API Key recibida para comparar con la almacenada
        const hashedIncomingKey = crypto.createHash('sha256').update(apiKeyHeader).digest('hex');
        const queryText = `SELECT id, estado FROM empresas WHERE api_key = $1 OR api_key = $2;`;
        const { rows } = await pool.query(queryText, [hashedIncomingKey, apiKeyHeader]);

        if (rows.length === 0) {
            return res.status(401).json({ error: "API Key inválida." });
        }

        req.empresaId = rows[0].id;
        next();

    } catch (error) {
        console.error("❌ Error grave en authMiddleware:", error);
        res.status(500).json({ error: "Error interno de autenticación." });
    }
};

module.exports = { authMiddleware };