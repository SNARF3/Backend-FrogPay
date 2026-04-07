const mockProvider = require('./mock.provider');
const stripeProvider = require('./stripe.provider');
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
}

const providerRegistry = new ProviderRegistry();
providerRegistry.register('mock', mockProvider);
providerRegistry.register('stripe', stripeProvider);

module.exports = providerRegistry;
