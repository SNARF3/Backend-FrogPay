/**
 * Genera un token interno para registrar tarjetas de forma segura.
 */
const tokenizeCard = async (cardData) => {
    await new Promise((resolve) => setTimeout(resolve, 300));

    if (!cardData.cardNumber || !cardData.expiry || !cardData.cvc) {
        throw new Error('Faltan datos en el proveedor de pagos.');
    }

    const randomHash = Math.random().toString(36).substring(2, 15)
        + Math.random().toString(36).substring(2, 15);

    return {
        id: `cardtok_${randomHash}`,
        object: 'card',
        last4: cardData.cardNumber.slice(-4),
        exp_month: cardData.expiry.split('/')[0],
        exp_year: cardData.expiry.split('/')[1],
        funding: cardData.cardType || 'credit',
    };
};

module.exports = {
    tokenizeCard,
};
