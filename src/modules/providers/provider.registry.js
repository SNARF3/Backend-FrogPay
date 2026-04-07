const { ProviderNotFoundError } = require('../../utils/errors');
const PayPalProvider = require('./paypal.provider');
const MockProvider = require('./mock.provider');

class ProviderRegistry {
  constructor() {
    this._providers = new Map();
  }

  register(name, instance) {
    this._providers.set(name, instance);
  }

  getProvider(name) {
    if (!this._providers.has(name)) {
      throw new ProviderNotFoundError(name);
    }
    return this._providers.get(name);
  }
}

const registry = new ProviderRegistry();
registry.register('paypal', new PayPalProvider());
registry.register('mock', new MockProvider());

module.exports = registry;
