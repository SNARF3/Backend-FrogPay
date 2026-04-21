const pool = require('../../config/database');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { loginEmpresa, getTenantPlan, upgradeTenantPlan, downgradeTenantPlan } = require('./tenant.service');
const { getMonthlyUsageStats } = require('../../common/limits');

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
            'FREEMIUM',
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

/**
 * GET /api/tenants/me
 * Retorna la información actual del tenant autenticado, incluyendo su plan.
 */
const getTenantMe = async (req, res) => {
    try {
        const empresaId = req.empresaId;
        if (!empresaId) {
            return res.status(401).json({ error: 'No autenticado.' });
        }

        const empresa = await getTenantPlan(empresaId);

        return res.status(200).json({
            id: empresa.id,
            nombre: empresa.nombre,
            correo: empresa.correo,
            plan: empresa.plan,
            estado: empresa.estado,
            metodos_pago_habilitados: empresa.metodos_pago_habilitados,
            creado_en: empresa.creado_en
        });
    } catch (error) {
        console.error('getTenantMe:', error.message);
        if (error.message === 'Empresa no encontrada') {
            return res.status(404).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Error interno al obtener datos del tenant.' });
    }
};

/**
 * PUT /api/tenants/upgrade
 * Actualiza el plan del tenant autenticado a PREMIUM.
 */
const upgradePlan = async (req, res) => {
    try {
        const empresaId = req.empresaId;
        if (!empresaId) {
            return res.status(401).json({ error: 'No autenticado.' });
        }

        const resultado = await upgradeTenantPlan(empresaId);

        return res.status(200).json({
            mensaje: 'Plan actualizado a PREMIUM exitosamente.',
            empresa: {
                id: resultado.id,
                nombre: resultado.nombre,
                plan: resultado.plan
            }
        });
    } catch (error) {
        console.error('upgradePlan:', error.message);

        if (
            error.message === 'Empresa no encontrada' ||
            error.message.startsWith('La empresa ya cuenta') ||
            error.message.startsWith('No se puede hacer upgrade')
        ) {
            return res.status(409).json({ error: error.message });
        }

        return res.status(500).json({ error: 'Error interno al actualizar el plan.' });
    }
};

/**
 * PUT /api/tenants/downgrade
 * Regresa el plan del tenant autenticado a FREEMIUM.
 */
const downgradePlan = async (req, res) => {
    try {
        const empresaId = req.empresaId;
        if (!empresaId) {
            return res.status(401).json({ error: 'No autenticado.' });
        }

        const resultado = await downgradeTenantPlan(empresaId);

        return res.status(200).json({
            mensaje: 'Plan cambiado a FREEMIUM exitosamente.',
            empresa: {
                id: resultado.id,
                nombre: resultado.nombre,
                plan: resultado.plan
            }
        });
    } catch (error) {
        console.error('downgradePlan:', error.message);

        if (
            error.message === 'Empresa no encontrada' ||
            error.message.startsWith('La empresa ya se encuentra') ||
            error.message.startsWith('No se puede hacer downgrade')
        ) {
            return res.status(409).json({ error: error.message });
        }

        return res.status(500).json({ error: 'Error interno al cambiar el plan.' });
    }
};

/**
 * GET /api/tenants/usage
 */
const getTenantUsage = async (req, res) => {
    try {
        const empresaId = req.empresaId;
        const plan = req.plan || 'FREEMIUM';

        if (!empresaId) {
            return res.status(401).json({ error: "No autorizado" });
        }

        // Recuperar nombre para confirmar identidad en el log/respuesta
        const { rows } = await pool.query('SELECT nombre FROM empresas WHERE id = $1', [empresaId]);
        const nombreEmpresa = rows[0]?.nombre || 'Empresa desconocida';

        const stats = await getMonthlyUsageStats(empresaId, plan);

        res.status(200).json({
            success: true,
            empresa: nombreEmpresa, // Identificador visual
            data: stats
        });
    } catch (error) {
        console.error("Error en getTenantUsage:", error);
        res.status(500).json({ error: "Error interno al obtener estadísticas de uso." });
    }
};

/**
 * PUT /api/tenants/me
 * Actualiza los datos del tenant autenticado (nombre, correo, teléfono, dirección)
 */
const updateTenantMe = async (req, res) => {
    try {
        const empresaId = req.empresaId;
        if (!empresaId) {
            return res.status(401).json({ error: 'No autenticado.' });
        }

        const { nombre, correo, telefono, direccion } = req.body;

        if (!nombre || !correo) {
            return res.status(400).json({ error: 'Nombre y correo son obligatorios.' });
        }

        const query = `
            UPDATE empresas 
            SET nombre = $1, correo = $2, telefono = $3, direccion = $4
            WHERE id = $5
            RETURNING id, nombre, correo, telefono, direccion, plan, estado;
        `;

        const result = await pool.query(query, [nombre, correo, telefono || null, direccion || null, empresaId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Empresa no encontrada.' });
        }

        const empresa = result.rows[0];
        return res.status(200).json({
            mensaje: 'Datos actualizados correctamente.',
            data: {
                id: empresa.id,
                nombre: empresa.nombre,
                correo: empresa.correo,
                telefono: empresa.telefono,
                direccion: empresa.direccion,
                plan: empresa.plan,
                estado: empresa.estado
            }
        });
    } catch (error) {
        console.error('updateTenantMe:', error.message);
        res.status(500).json({ error: 'Error interno al actualizar los datos.' });
    }
};

/**
 * POST /api/tenants/change-password
 * Cambia la contraseña del usuario autenticado
 */
const changePassword = async (req, res) => {
    try {
        const empresaId = req.empresaId;
        if (!empresaId) {
            return res.status(401).json({ error: 'No autenticado.' });
        }

        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Contraseña actual y nueva son obligatorias.' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
        }

        // Obtener usuario del tenant
        const userQuery = 'SELECT id, password_hash FROM usuarios WHERE empresa_id = $1 LIMIT 1;';
        const userResult = await pool.query(userQuery, [empresaId]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        const usuario = userResult.rows[0];

        // Verificar contraseña actual
        const isPasswordValid = await bcrypt.compare(currentPassword, usuario.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Contraseña actual incorrecta.' });
        }

        // Encriptar nueva contraseña
        const salt = await bcrypt.genSalt(10);
        const newPasswordHash = await bcrypt.hash(newPassword, salt);

        // Actualizar contraseña
        const updateQuery = 'UPDATE usuarios SET password_hash = $1 WHERE id = $2;';
        await pool.query(updateQuery, [newPasswordHash, usuario.id]);

        return res.status(200).json({
            mensaje: 'Contraseña cambiada exitosamente.'
        });
    } catch (error) {
        console.error('changePassword:', error.message);
        res.status(500).json({ error: 'Error interno al cambiar la contraseña.' });
    }
};

module.exports = { 
    registerTenant, 
    loginTenant, 
    getTenantMe, 
    upgradePlan, 
    downgradePlan, 
    getTenantUsage,
    updateTenantMe,
    changePassword
};