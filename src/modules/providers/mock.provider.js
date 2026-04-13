const { randomUUID } = require('crypto');
const { PaymentProvider } = require('./provider.interface');
const { BusinessError, TechnicalError, PaymentFailedError } = require('../../utils/errors');

// Tarjetas de prueba: número (sin espacios) → escenario de fallo (Versión JJ)
const TEST_CARD_FAILURES = {
    '4000000000009995': { code: 'INSUFFICIENT_FUNDS', message: 'La tarjeta no tiene fondos suficientes' },
    '4000000000000002': { code: 'CARD_BLOCKED', message: 'La tarjeta ha sido bloqueada' },
};

class MockProvider extends PaymentProvider {
    async charge(paymentData) {
        const metadata = paymentData.metadata || {};
        const cardNumber = String(paymentData.token || paymentData.cardNumber || '4242424242424242').replace(/\s/g, '');

        // 1. 🔥 Simulación de error técnico (Versión Main)
        if (metadata.forceTechnicalError) {
            throw new TechnicalError('Mock provider timeout simulation', {
                code: 'PROVIDER_TIMEOUT',
                statusCode: 504,
            });
        }

        // 2. 💸 Simulación de error de negocio por Metadata o Monto (Versión Main)
        if (metadata.forceInsufficientFunds || Number(paymentData.amount) > 1000000) {
            throw new BusinessError('Fondos insuficientes (Simulación)', {
                code: 'INSUFFICIENT_FUNDS',
                statusCode: 402,
            });
        }

        // 3. 💳 Simulación de error de negocio por Número de Tarjeta (Versión JJ)
        const failure = TEST_CARD_FAILURES[cardNumber];
        if (failure) {
            // Se usa BusinessError para mantener consistencia con el orquestador unificado
            throw new BusinessError(failure.message, { 
                code: failure.code, 
                statusCode: 402,
                card_last4: cardNumber.slice(-4) 
            });
        }

        // 4. ✅ Respuesta de éxito unificada
        return {
            providerTransactionId: `mock_${randomUUID()}`,
            transactionId: `mock_${randomUUID()}`, // Retrocompatibilidad
            status: 'COMPLETED',
            responseCode: '00',
            message: 'Pago aprobado por MockProvider',
            raw: { card_last4: cardNumber.slice(-4) }
        };
    }

    async refund(transactionId, amount) {
        // Soporta tanto objeto desestructurado como argumentos simples
        const tId = typeof transactionId === 'object' ? transactionId.transactionId : transactionId;
        
        return {
            providerRefundId: `mock_refund_${randomUUID()}`,
            status: 'COMPLETED',
            message: `Reembolso simulado para ${tId}`,
        };
    }

    async getStatus(transactionId) {
        return {
            providerTransactionId: transactionId,
            status: 'COMPLETED',
        };
    }
}

module.exports = new MockProvider();