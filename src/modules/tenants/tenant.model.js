const pool = require('../../config/database');

const findUserByCorreo = async (correo) => {
    const query = `
        SELECT 
            u.id AS usuario_id,
            u.password_hash,
            u.rol,
            e.id AS empresa_id,
            e.nombre,
            e.estado,
            e.plan
        FROM usuarios u
        INNER JOIN empresas e ON u.empresa_id = e.id
        WHERE u.correo = $1
        LIMIT 1;
    `;

    const { rows } = await pool.query(query, [correo]);
    return rows[0];
};

const insertAuditoriaLogin = async (empresaId, userId) => {
    const query = `
        INSERT INTO auditoria (empresa_id, accion, entidad, metadata)
        VALUES ($1, 'LOGIN', 'empresa', $2);
    `;

    await pool.query(query, [
        empresaId,
        JSON.stringify({ userId })
    ]);
};

module.exports = {
    findUserByCorreo,
    insertAuditoriaLogin
};