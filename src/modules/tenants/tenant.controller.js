const pool = require('../../config/database');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const registerTenant = async (req, res) => {
    const client = await pool.connect();

    try {
        const { nombre_empresa, correo_empresa, plan, password_admin } = req.body;

        await client.query('BEGIN');

        const plainApiKey = 'fp_live_' + crypto.randomBytes(32).toString('hex');
        const hashedApiKey = crypto.createHash('sha256').update(plainApiKey).digest('hex');

        const insertEmpresaQuery = `
            INSERT INTO empresas (nombre, correo, api_key, plan, estado) 
            VALUES ($1, $2, $3, $4, $5) RETURNING id;
        `;
        const empresaResult = await client.query(insertEmpresaQuery, [nombre_empresa, correo_empresa, hashedApiKey, plan || 'freemium', 'activo']);
        const empresaId = empresaResult.rows[0].id;

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password_admin, salt);

        const insertUsuarioQuery = `
            INSERT INTO usuarios (empresa_id, correo, password_hash, rol) 
            VALUES ($1, $2, $3, $4);
        `;
        await client.query(insertUsuarioQuery, [empresaId, correo_empresa, hashedPassword, 'admin']);

        await client.query('COMMIT');

        res.status(201).json({
            mensaje: "Empresa registrada. Guarda tu API Key.",
            empresa_id: empresaId,
            api_key: plainApiKey
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error en registerTenant:", error);
        if (error.code === '23505') return res.status(400).json({ error: "Correo ya registrado." });
        res.status(500).json({ error: "Error al registrar la empresa." });
    } finally {
        client.release();
    }
};

module.exports = { registerTenant };