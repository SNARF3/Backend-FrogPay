const pool = require('../config/database');

// Límite mensual en USD para empresas en plan FREEMIUM
const FREEMIUM_MONTHLY_LIMIT_USD = 50_000;

/**
 * Obtiene la suma total de transacciones completadas (en USD base) para una empresa
 * en el mes calendario actual.
 *
 * Consulta la tabla `pagos` usando `converted_amount` (que siempre está en USD base)
 * y solo considera pagos en estado COMPLETED o PROCESSING.
 *
 * @param {string} empresaId - UUID de la empresa
 * @returns {Promise<number>} - Suma total en USD del mes actual
 */
async function getMonthlyVolumeUSD(empresaId) {
    if (!empresaId) return 0;

    const query = `
        SELECT COALESCE(SUM(COALESCE(converted_amount, monto, 0)), 0) AS total_usd
        FROM pagos
        WHERE (empresa_id = $1::uuid OR empresa_id::text = $1::text)
          AND estado IN ('COMPLETED', 'PROCESSING', 'PENDING')
          AND creado_en >= date_trunc('month', now());
    `;

    const diagnosticQuery = `SELECT COUNT(*) as cuenta FROM pagos WHERE empresa_id = $1::uuid`;

    try {
        const { rows } = await pool.query(query, [empresaId]);
        const diag = await pool.query(diagnosticQuery, [empresaId]);

        const total = parseFloat(rows[0].total_usd || 0);
        const totalFilas = diag.rows[0].cuenta;

        console.log(`[DEBUG LÍMITES] EmpresaId: ${empresaId}`);
        console.log(`[DEBUG LÍMITES] Intentos totales (todas las filas): ${totalFilas}`);
        console.log(`[DEBUG LÍMITES] Volumen real (COMPLETED/PENDING/PROCESSING): ${total} USD`);

        return total;
    } catch (error) {
        console.error(`[ERROR LÍMITES] Error al calcular volumen:`, error);
        return 0;
    }
}

/**
 * Verifica si una nueva transacción (newAmountUSD) excede el límite mensual
 * para una empresa FREEMIUM.
 *
 * Si el plan es PREMIUM, siempre permite la transacción.
 *
 * @param {object} params
 * @param {string} params.empresaId
 * @param {string} params.plan - 'FREEMIUM' | 'PREMIUM'
 * @param {number} params.newAmountUSD - Monto de la nueva transacción en USD
 * @returns {Promise<{ allowed: boolean, currentVolumeUSD: number, limitUSD: number, projectedVolumeUSD: number }>}
 */
async function checkMonthlyVolumeLimit({ empresaId, plan, newAmountUSD }) {
    // PREMIUM no tiene restricción de volumen
    if (plan === 'PREMIUM') {
        return {
            allowed: true,
            currentVolumeUSD: null,
            limitUSD: null,
            projectedVolumeUSD: null,
        };
    }

    const currentVolumeUSD = await getMonthlyVolumeUSD(empresaId);
    const projectedVolumeUSD = currentVolumeUSD + Number(newAmountUSD);
    const limitUSD = FREEMIUM_MONTHLY_LIMIT_USD;

    return {
        allowed: projectedVolumeUSD <= limitUSD,
        currentVolumeUSD,
        limitUSD,
        projectedVolumeUSD,
    };
}

/**
 * Calcula el porcentaje de uso del volumen mensual para una empresa FREEMIUM.
 * Retorna null si el plan es PREMIUM (sin límite).
 *
 * @param {string} empresaId
 * @param {string} plan - 'FREEMIUM' | 'PREMIUM'
 * @returns {Promise<{ currentVolumeUSD: number|null, limitUSD: number|null, percentageUsed: number|null, remainingUSD: number|null }>}
 */
async function getMonthlyUsageStats(empresaId, plan) {
    if (plan === 'PREMIUM') {
        return {
            plan: 'PREMIUM',
            currentVolumeUSD: null,
            limitUSD: null,
            percentageUsed: null,
            remainingUSD: null,
            message: 'Tu plan PREMIUM no tiene límite de volumen mensual.',
        };
    }

    const currentVolumeUSD = await getMonthlyVolumeUSD(empresaId);
    const limitUSD = FREEMIUM_MONTHLY_LIMIT_USD;
    const percentageUsed = Math.min((currentVolumeUSD / limitUSD) * 100, 100);
    const remainingUSD = Math.max(limitUSD - currentVolumeUSD, 0);

    return {
        plan: 'FREEMIUM',
        currentVolumeUSD: parseFloat(currentVolumeUSD.toFixed(2)),
        limitUSD,
        percentageUsed: parseFloat(percentageUsed.toFixed(2)),
        remainingUSD: parseFloat(remainingUSD.toFixed(2)),
        message: percentageUsed >= 100
            ? 'Has alcanzado el límite mensual. Considera actualizar tu plan a PREMIUM.'
            : percentageUsed >= 80
                ? 'Estás cerca del límite mensual. Considera actualizar tu plan a PREMIUM.'
                : null,
    };
}

module.exports = {
    FREEMIUM_MONTHLY_LIMIT_USD,
    getMonthlyVolumeUSD,
    checkMonthlyVolumeLimit,
    getMonthlyUsageStats,
};
