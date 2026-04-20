const QRCode = require('qrcode');
const { PaymentProvider } = require('./provider.interface');
const { BusinessError } = require('../../utils/errors');
const env = require('../../config/env');

class QrProvider extends PaymentProvider {
    async charge(paymentData) {
        const qrUrl = `${env.APP_BASE_URL}/pay/qr/${paymentData.paymentId}`;
        const qrCode = await QRCode.toDataURL(qrUrl);

        return {
            providerTransactionId: `qr_${paymentData.paymentId}`,
            status: 'PENDING',
            qrCode,
            qrUrl,
            responseCode: 'QR_GENERATED',
            message: 'QR generado. Escanea para confirmar el pago.',
        };
    }

    async refund() {
        throw new BusinessError('Los pagos QR no soportan reembolso via API', {
            code: 'QR_REFUND_NOT_SUPPORTED',
            statusCode: 400,
        });
    }

    async getStatus(transactionId) {
        return {
            providerTransactionId: transactionId,
            status: 'PENDING',
        };
    }
}

module.exports = new QrProvider();
