const pool = require('../../config/database'); // Ajusta la ruta a tu config real

/**
 * Guarda el token de una tarjeta en la base de datos.
 */
const saveCardToken = async ({ empresaId, tokenProveedor, ultimosCuatro, red, tipo }) => {
    const query = `
        INSERT INTO tarjetas (empresa_id, token_proveedor, ultimos_cuatro, red, tipo) 
        VALUES ($1, $2, $3, $4, $5) 
        RETURNING *;
    `;
    
    const values = [empresaId, tokenProveedor, ultimosCuatro, red, tipo];

    try {
        const { rows } = await pool.query(query, values);
        return rows[0];
    } catch (error) {
        throw new Error(`Error al guardar la tarjeta en BD: ${error.message}`);
    }
};

module.exports = {
    saveCardToken
};