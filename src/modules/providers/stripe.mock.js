/**
 * Simula la API de Stripe para tokenizar una tarjeta de crédito/débito.
 * En la vida real, esto se hace en el Frontend con Stripe.js o vía API segura.
 */
const tokenizeCardMock = async (cardData) => {
    // Simulamos el tiempo de respuesta de red (ej. 800ms)
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Validamos que vengan los datos mínimos para simular un rechazo si faltan
    if (!cardData.cardNumber || !cardData.expiry || !cardData.cvc) {
        throw new Error('Faltan datos en el proveedor de pagos.');
    }

    // Generamos un string aleatorio simulando el token de Stripe (ej: tok_1xyz...)
    const randomHash = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const simulatedToken = `tok_${randomHash}`;

    // Stripe normalmente devuelve los últimos 4 dígitos y la marca
    return {
        id: simulatedToken,
        object: 'card',
        last4: cardData.cardNumber.slice(-4),
        exp_month: cardData.expiry.split('/')[0],
        exp_year: cardData.expiry.split('/')[1],
        funding: cardData.cardType || 'credit'
    };
};

module.exports = {
    tokenizeCardMock
};