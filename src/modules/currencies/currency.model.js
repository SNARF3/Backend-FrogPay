const pool = require('../../config/database');

async function getAllCurrencies() {
    const query = `
        SELECT id, codigo, nombre, habilitada
        FROM monedas
        WHERE habilitada = TRUE
        ORDER BY codigo;
    `;
    const { rows } = await pool.query(query);
    return rows;
}

async function getCurrencyByCode(codigo) {
    const query = `
        SELECT id, codigo, nombre, habilitada
        FROM monedas
        WHERE codigo = $1 AND habilitada = TRUE
        LIMIT 1;
    `;
    const { rows } = await pool.query(query, [codigo]);
    return rows[0] || null;
}

module.exports = {
    getAllCurrencies,
    getCurrencyByCode,
};