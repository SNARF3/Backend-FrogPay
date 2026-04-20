const axios = require('axios');

const BASE_CURRENCY = 'USD'; // Moneda base
const API_URL = 'https://api.exchangerate-api.com/v4/latest/'; // API gratuita

async function getExchangeRate(fromCurrency, toCurrency = BASE_CURRENCY) {
    try {
        const response = await axios.get(`${API_URL}${fromCurrency}`);
        const rates = response.data.rates;
        const rate = rates[toCurrency];
        if (!rate) {
            throw new Error(`Tasa de cambio no disponible para ${fromCurrency} a ${toCurrency}`);
        }
        return {
            rate,
            from: fromCurrency,
            to: toCurrency,
            timestamp: new Date().toISOString(),
        };
    } catch (error) {
        console.error('Error obteniendo tasa de cambio:', error.message);
        throw new Error('No se pudo obtener la tasa de cambio');
    }
}

async function calculateConvertedAmount(amount, fromCurrency, toCurrency = BASE_CURRENCY) {
    const exchangeData = await getExchangeRate(fromCurrency, toCurrency);
    const convertedAmount = amount * exchangeData.rate;
    return {
        originalAmount: amount,
        convertedAmount: Math.round(convertedAmount * 100) / 100, // Redondear a 2 decimales
        exchangeRate: exchangeData.rate,
        fromCurrency,
        toCurrency,
        timestamp: exchangeData.timestamp,
    };
}

module.exports = {
    getExchangeRate,
    calculateConvertedAmount,
};