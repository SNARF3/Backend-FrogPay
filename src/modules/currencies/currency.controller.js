const currencyModel = require('./currency.model');

async function getCurrencies(req, res) {
    try {
        const currencies = await currencyModel.getAllCurrencies();
        res.json({
            success: true,
            data: currencies,
        });
    } catch (error) {
        console.error('Error fetching currencies:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
        });
    }
}

module.exports = {
    getCurrencies,
};