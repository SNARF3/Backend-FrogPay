const mockProvider = require('./mock.provider');
const paypalProvider = require('./paypal.provider');
const cardProvider = require('./card.provider');
const stripeProvider = require('./stripe.provider');
const qrProvider = require('./qr.provider');
const { BusinessError } = require('../../utils/errors');

class ProviderRegistry {
	constructor() {
		this.providers = new Map();
	}

	register(name, provider) {
		this.providers.set(String(name).toLowerCase(), provider);
	}

	resolve(name = 'mock') {
		const key = String(name).toLowerCase();
		const provider = this.providers.get(key);

		if (!provider) {
			throw new BusinessError(`Proveedor no soportado: ${name}`, {
				code: 'UNSUPPORTED_PROVIDER',
				statusCode: 400,
			});
		}

		return provider;
	}

	// 🔥 opcional pero útil para debugging/testing
	list() {
		return Array.from(this.providers.keys());
	}
}

const providerRegistry = new ProviderRegistry();

// 📦 Registro de providers
providerRegistry.register('mock', mockProvider);
providerRegistry.register('paypal', paypalProvider);
providerRegistry.register('card', cardProvider);
providerRegistry.register('stripe', stripeProvider);
providerRegistry.register('qr', qrProvider);

module.exports = providerRegistry;