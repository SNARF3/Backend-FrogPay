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

/**
 * Busca una empresa por su ID y retorna campos clave incluyendo el plan.
 */
const findEmpresaById = async (empresaId) => {
    const query = `
        SELECT id, nombre, correo, plan, estado, metodos_pago_habilitados, creado_en
        FROM empresas
        WHERE id = $1
        LIMIT 1;
    `;
    const { rows } = await pool.query(query, [empresaId]);
    return rows[0] || null;
};

/**
 * Actualiza el plan de una empresa a un nuevo valor.
 * Solo permite valores: 'FREEMIUM' | 'PREMIUM'
 */
const PLANES_VALIDOS = ['FREEMIUM', 'PREMIUM'];

const updateEmpresaPlan = async (empresaId, nuevoPlan) => {
    const planUpper = nuevoPlan?.toUpperCase();
    if (!PLANES_VALIDOS.includes(planUpper)) {
        throw new Error(`Plan inválido: "${nuevoPlan}". Solo se permiten: ${PLANES_VALIDOS.join(', ')}.`);
    }

    const query = `
        UPDATE empresas
        SET plan = $1
        WHERE id = $2
        RETURNING id, nombre, plan;
    `;
    const { rows } = await pool.query(query, [planUpper, empresaId]);
    return rows[0] || null;
};

/**
 * Registra un evento de auditoría cuando el plan de una empresa cambia.
 */
const insertAuditoriaPlanChange = async (empresaId, planAnterior, planNuevo) => {
    const query = `
        INSERT INTO auditoria (empresa_id, accion, entidad, entidad_id, metadata)
        VALUES ($1, 'PLAN_UPGRADE', 'empresa', $1, $2);
    `;
    await pool.query(query, [
        empresaId,
        JSON.stringify({ plan_anterior: planAnterior, plan_nuevo: planNuevo })
    ]);
};

module.exports = {
    findUserByCorreo,
    insertAuditoriaLogin,
    getTenantCurrencyPreference,
    updateTenantCurrencyPreference,
    insertAuditoriaLogin,
    findEmpresaById,
    updateEmpresaPlan,
    insertAuditoriaPlanChange,
    PLANES_VALIDOS
};