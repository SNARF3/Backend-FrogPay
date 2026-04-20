const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const {
    findUserByCorreo,
    insertAuditoriaLogin,
    findEmpresaById,
    updateEmpresaPlan,
    insertAuditoriaPlanChange
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

const getTenantPlan = async (empresaId) => {
    const empresa = await findEmpresaById(empresaId);
    if (!empresa) {
        throw new Error('Empresa no encontrada');
    }
    return empresa;
};

const upgradeTenantPlan = async (empresaId) => {
    // 1. Verificar que la empresa existe
    const empresa = await findEmpresaById(empresaId);
    if (!empresa) {
        throw new Error('Empresa no encontrada');
    }

    const planActual = empresa.plan?.toUpperCase();

    // 2. Validar que no es un downgrade ni un no-op para PREMIUM
    if (planActual === 'PREMIUM') {
        throw new Error('La empresa ya cuenta con el plan PREMIUM.');
    }

    // 3. Solo se puede upgradear desde FREEMIUM
    if (planActual !== 'FREEMIUM') {
        throw new Error(`No se puede hacer upgrade desde el plan actual: "${empresa.plan}".`);
    }

    // 4. Persistir el cambio
    const actualizada = await updateEmpresaPlan(empresaId, 'PREMIUM');

    // 5. Registrar auditoría del cambio de plan
    await insertAuditoriaPlanChange(empresaId, planActual, 'PREMIUM');

    return actualizada;
};

const downgradeTenantPlan = async (empresaId) => {
    // 1. Verificar que la empresa existe
    const empresa = await findEmpresaById(empresaId);
    if (!empresa) {
        throw new Error('Empresa no encontrada');
    }

    const planActual = empresa.plan?.toUpperCase();

    // 2. Solo se puede bajar desde PREMIUM
    if (planActual === 'FREEMIUM') {
        throw new Error('La empresa ya se encuentra en el plan FREEMIUM.');
    }

    if (planActual !== 'PREMIUM') {
        throw new Error(`No se puede hacer downgrade desde el plan actual: "${empresa.plan}".`);
    }

    // 3. Persistir el cambio
    const actualizada = await updateEmpresaPlan(empresaId, 'FREEMIUM');

    // 4. Registrar auditoría
    await insertAuditoriaPlanChange(empresaId, planActual, 'FREEMIUM');

    return actualizada;
};

module.exports = {
    loginEmpresa,
    getTenantPlan,
    upgradeTenantPlan,
    downgradeTenantPlan
};