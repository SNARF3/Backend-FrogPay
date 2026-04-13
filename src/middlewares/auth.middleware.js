const pool = require('../config/database');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
require('dotenv').config(); // 👈 CRÍTICO: Asegura que JWT_SECRET exista aquí

const authMiddleware = async (req, res, next) => {
    console.log(`\n--- 🛡️ INICIANDO AUTENTICACIÓN PARA: ${req.method} ${req.originalUrl} ---`);
    
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        console.log("1. Header 'Authorization' recibido:", authHeader ? "SÍ" : "NO");
        
        // Estrategia 1: JWT (Bearer Token)
        if (authHeader && authHeader.startsWith('Bearer ')) {
            console.log("2. Estrategia JWT Detectada.");
            const token = authHeader.split(' ')[1];
            
            try {
                // Verificamos el token
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                console.log("3. ✅ Token desencriptado con éxito. Empresa ID:", decoded.empresaId);
                
                req.empresaId = decoded.empresaId;
                req.usuarioId = decoded.usuarioId || decoded.sub; 
                
                if (!req.empresaId) {
                    console.log("❌ Error: El token es válido pero no contiene empresaId.");
                    return res.status(401).json({ error: "Token válido, pero sin empresa asignada." });
                }

                console.log("4. 🚀 Autenticación exitosa. Pasando al controlador...");
                return next(); 
            } catch (jwtError) {
                console.log("❌ Error al desencriptar JWT:", jwtError.message);
                return res.status(401).json({ 
                    error: "Token JWT inválido o expirado.", 
                    detalle: jwtError.message 
                });
            }
        }

        // Estrategia 2: API Key (para integraciones externas)
        const apiKeyHeader = req.headers['x-api-key'];
        console.log("2. Estrategia API Key Detectada. Header 'x-api-key':", apiKeyHeader ? "SÍ" : "NO");

        if (!apiKeyHeader) {
            console.log("❌ Error: Petición rechazada por falta de credenciales.");
            return res.status(401).json({ 
                error: "Falta autenticación. Se requiere 'Authorization: Bearer <token>' o 'x-api-key'." 
            });
        }

        // Hashear la API Key recibida para comparar con la almacenada
        const hashedIncomingKey = crypto.createHash('sha256').update(apiKeyHeader).digest('hex');
        const queryText = `SELECT id, estado FROM empresas WHERE api_key = $1 OR api_key = $2;`;
        const { rows } = await pool.query(queryText, [hashedIncomingKey, apiKeyHeader]);

        if (rows.length === 0) {
            console.log("❌ Error: API Key no encontrada en la base de datos.");
            return res.status(401).json({ error: "API Key inválida." });
        }

        req.empresaId = rows[0].id;
        console.log("3. ✅ API Key válida. Empresa ID:", req.empresaId);
        next();

    } catch (error) {
        console.error("❌ Error grave en authMiddleware:", error);
        res.status(500).json({ error: "Error interno de autenticación." });
    }
};

module.exports = { authMiddleware };