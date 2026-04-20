const pool = require('../../config/database');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { loginEmpresa } = require('./tenant.service');
const registerTenant = async (req, res) => {
    // Obtenemos una conexión exclusiva para hacer una transacción segura
    const client = await pool.connect();

    try {
        // Estos son los datos que nos enviará el Frontend (el React Modal)
        const { nombre_empresa, correo_empresa, password_admin } = req.body;

        await client.query('BEGIN'); // Iniciamos transacción

        // 1. Generar la API Key única por tenant
        const plainApiKey = 'fp_live_' + crypto.randomBytes(32).toString('hex');

        // 2. Guardar la empresa
        const insertEmpresaQuery = `
            INSERT INTO empresas (nombre, correo, api_key, plan, estado) 
            VALUES ($1, $2, $3, $4, $5) RETURNING id;
        `;
        const empresaResult = await client.query(insertEmpresaQuery, [
            nombre_empresa, 
            correo_empresa, 
            plainApiKey,
            'freemium', 
            'activo'
        ]);
        const empresaId = empresaResult.rows[0].id;

        // 3. Encriptar contraseña y guardar al usuario administrador (humano)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password_admin, salt);

        const insertUsuarioQuery = `
            INSERT INTO usuarios (empresa_id, correo, password_hash, rol) 
            VALUES ($1, $2, $3, $4);
        `;
        await client.query(insertUsuarioQuery, [empresaId, correo_empresa, hashedPassword, 'admin']);

        await client.query('COMMIT'); // Guardamos todo permanentemente

        // 4. Respondemos al Frontend con éxito
        res.status(201).json({
            mensaje: "Empresa registrada con éxito.",
            empresa_id: empresaId,
            api_key: plainApiKey, // Enviamos la llave para que el Frontend la muestre
            nombre_empresa: nombre_empresa // Agregar nombre
        });

    } catch (error) {
        await client.query('ROLLBACK'); // Si algo falla, deshacemos todo
        console.error("Error en registerTenant:", error);
        
        if (error.code === '23505') {
            return res.status(400).json({ error: "Este correo ya está registrado en FrogPay." });
        }
        res.status(500).json({ error: "Error interno al registrar la empresa." });
    } finally {
        client.release(); // Devolvemos la conexión al pool
    }
};


const loginTenant = async (req, res) => {
    try {
        const { correo, password } = req.body;

        if (!correo || !password) {
            return res.status(400).json({
                error: "Correo y contraseña son obligatorios"
            });
        }

        const result = await loginEmpresa(correo, password);

        res.status(200).json({
            mensaje: "Login exitoso",
            ...result
        });

    } catch (error) {
        console.error("loginTenant:", error.message);

        res.status(401).json({
            error: error.message
        });
    }
};


module.exports = { registerTenant , loginTenant};