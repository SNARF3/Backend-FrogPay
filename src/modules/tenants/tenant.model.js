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
            e.plan,
            e.api_key,
            e.moneda_operativa
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

async function getTenantCurrencyPreference(empresaId) {
    const { rows } = await pool.query(
        `SELECT moneda_operativa FROM empresas WHERE id = $1 LIMIT 1;`,
        [empresaId]
    );

    return String(rows[0]?.moneda_operativa || 'USD').toUpperCase();
}

async function updateTenantCurrencyPreference(empresaId, monedaOperativa) {
    const { rows } = await pool.query(
        `
            UPDATE empresas
            SET moneda_operativa = $1
            WHERE id = $2
            RETURNING id, nombre, moneda_operativa;
        `,
        [String(monedaOperativa || 'USD').toUpperCase(), empresaId]
    );

    return rows[0] || null;
}

module.exports = {
    findUserByCorreo,
    insertAuditoriaLogin,
    getTenantCurrencyPreference,
    updateTenantCurrencyPreference,
};