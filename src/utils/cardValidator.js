/**
 * Valida un número de tarjeta usando el Algoritmo de Luhn.
 * @param {string} cardNumber 
 * @returns {boolean}
 */
const isLuhnValid = (cardNumber) => {
    let sum = 0;
    let shouldDouble = false;
    for (let i = cardNumber.length - 1; i >= 0; i--) {
        let digit = parseInt(cardNumber.charAt(i), 10);

        if (shouldDouble) {
            if ((digit *= 2) > 9) digit -= 9;
        }

        sum += digit;
        shouldDouble = !shouldDouble;
    }
    return (sum % 10) === 0;
};

/**
 * Identifica la red de la tarjeta (Visa, Mastercard, etc.) basada en el IIN/BIN.
 * @param {string} cardNumber 
 * @returns {string}
 */
const getCardNetwork = (cardNumber) => {
    const networks = {
        visa: /^4[0-9]{12}(?:[0-9]{3})?$/,
        mastercard: /^5[1-5][0-9]{14}$/,
        amex: /^3[47][0-9]{13}$/,
        discover: /^6(?:011|5[0-9]{2})[0-9]{12}$/
    };

    for (const key in networks) {
        if (networks[key].test(cardNumber)) {
            return key;
        }
    }
    return 'unknown';
};

module.exports = {
    isLuhnValid,
    getCardNetwork
};