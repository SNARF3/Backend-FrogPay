const pool = require('../config/database');
const crypto = require('crypto');

const authMiddleware = async (req, res, next) => {
    try {
        const apiKeyHeader = req.headers['x-api-key'];
        const devApiKey = process.env.DEV_API_KEY;

        if (!apiKeyHeader) {
            return res.status(401).json({ error: "Falta la API Key (Header: x-api-key)" });
        }

        if (devApiKey && apiKeyHeader === devApiKey) {
            const { rows } = await pool.query(
                `SELECT id FROM empresas WHERE estado = 'activo' ORDER BY creado_en ASC LIMIT 1;`
            );

            if (rows.length === 0) {
                return res.status(401).json({ error: "No existe una empresa activa para DEV_API_KEY." });
            }

            req.empresaId = rows[0].id;
            return next();
        }

        const hashedIncomingKey = crypto.createHash('sha256').update(apiKeyHeader).digest('hex');

        const queryText = `SELECT id, estado FROM empresas WHERE api_key = $1 OR api_key = $2;`;
        const { rows } = await pool.query(queryText, [hashedIncomingKey, apiKeyHeader]);

        if (rows.length === 0) {
            return res.status(401).json({ error: "API Key inválida." });
        }

        const empresa = rows[0];
        if (empresa.estado !== 'activo') {
            return res.status(403).json({ error: "La cuenta de la empresa está inactiva." });
        }

        // Inyectamos el ID
        req.empresaId = empresa.id;
        next();

    } catch (error) {
        console.error("Error en authMiddleware:", error);
        res.status(500).json({ error: "Error interno de autenticación." });
    }
};

module.exports = { authMiddleware };