const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const {
    findUserByCorreo,
    insertAuditoriaLogin,
} = require('./tenant.model');

const loginEmpresa = async (correo, password) => {

    const data = await findUserByCorreo(correo);

    if (!data) {
        throw new Error('Credenciales inválidas');
    }

    if (data.estado !== 'activo') {
        throw new Error('Empresa inactiva');
    }
    const isMatch = await bcrypt.compare(password, data.password_hash);

    if (!isMatch) {
        throw new Error('Credenciales inválidas');
    }

    const token = jwt.sign(
        {
            sub: data.usuario_id,
            empresaId: data.empresa_id,
            empresa: data.nombre,
            rol: data.rol,
            plan: data.plan,
            moneda_operativa: data.moneda_operativa || 'USD',
        },
        process.env.JWT_SECRET,
        { expiresIn: '2h' }
    );

    
    await insertAuditoriaLogin(data.empresa_id, data.usuario_id);

    return {
        token,
        api_key: data.api_key,
        empresa: {
            id: data.empresa_id,
            nombre: data.nombre,
            plan: data.plan,
            moneda_operativa: data.moneda_operativa || 'USD',
        }
    };
};

module.exports = {
    loginEmpresa
};