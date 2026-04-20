const pool = require('../../config/database');
const { connection } = require('../../config/redis');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const { executeWithRetry } = require('../../utils/retry');
const { BusinessError, TechnicalError, isTechnicalError } = require('../../utils/errors');

const DEFAULT_SUPPORTED_CURRENCIES = [
  { codigo: 'USD', nombre: 'Dólar estadounidense' },
  { codigo: 'BOB', nombre: 'Boliviano' },
  { codigo: 'ARS', nombre: 'Peso argentino' },
  { codigo: 'CLP', nombre: 'Peso chileno' },
  { codigo: 'COP', nombre: 'Peso colombiano' },
  { codigo: 'PEN', nombre: 'Sol peruano' },
  { codigo: 'MXN', nombre: 'Peso mexicano' },
  { codigo: 'EUR', nombre: 'Euro' },
  { codigo: 'BRL', nombre: 'Real brasileño' },
  { codigo: 'UYU', nombre: 'Peso uruguayo' },
  { codigo: 'PYG', nombre: 'Guaraní paraguayo' },
  { codigo: 'CAD', nombre: 'Dólar canadiense' },
  { codigo: 'AUD', nombre: 'Dólar australiano' },
  { codigo: 'GBP', nombre: 'Libra esterlina' },
  { codigo: 'CHF', nombre: 'Franco suizo' },
  { codigo: 'JPY', nombre: 'Yen japonés' },
  { codigo: 'CNY', nombre: 'Yuan chino' },
  { codigo: 'INR', nombre: 'Rupia india' },
  { codigo: 'KRW', nombre: 'Won surcoreano' },
  { codigo: 'NZD', nombre: 'Dólar neozelandés' },
  { codigo: 'TRY', nombre: 'Lira turca' },
  { codigo: 'SEK', nombre: 'Corona sueca' },
  { codigo: 'NOK', nombre: 'Corona noruega' },
  { codigo: 'DKK', nombre: 'Corona danesa' },
  { codigo: 'PLN', nombre: 'Zloty polaco' },
  { codigo: 'CZK', nombre: 'Corona checa' },
  { codigo: 'HUF', nombre: 'Forinto húngaro' },
  { codigo: 'AED', nombre: 'Dírham emiratí' },
  { codigo: 'SAR', nombre: 'Riyal saudí' },
  { codigo: 'MXV', nombre: 'Unidad de inversión mexicana' },
];

function normalizeCurrencyCode(value) {
  return String(value || '').trim().toUpperCase();
}

function getBaseCurrency() {
  return normalizeCurrencyCode(env.BASE_CURRENCY || 'USD') || 'USD';
}

function buildCacheKey(baseCurrency, targetCurrency) {
  return `fx:rate:${baseCurrency}:${targetCurrency}`;
}

function buildSnapshotKey(baseCurrency) {
  return `fx:snapshot:${baseCurrency}`;
}

function parseReferenceRateFromText(text) {
  const html = String(text || '');

  const parseValue = (value) => Number(String(value).replace(/\./g, '').replace(',', '.'));

  const extractRate = (sectionLabel) => {
    const sectionPattern = new RegExp(
      `${sectionLabel}[\\s\\S]{0,1200}?<div class="bcb-row">[\\s\\S]{0,300}?<div class="bcb-lbl">Compra<\\/div>[\\s\\S]{0,300}?<div class="bcb-val">([\\d.,]+)<\\/div>[\\s\\S]{0,300}?<div class="bcb-row">[\\s\\S]{0,300}?<div class="bcb-lbl">Venta<\\/div>[\\s\\S]{0,300}?<div class="bcb-val">([\\d.,]+)<\\/div>`,
      'i'
    );

    const match = html.match(sectionPattern);
    if (!match) return null;

    return {
      buy: parseValue(match[1]),
      sell: parseValue(match[2]),
    };
  };

  const official = extractRate('TIPO DE CAMBIO Bs por 1 Dólar USA');
  const referential = extractRate('VALOR REFERENCIAL DEL DÓLAR ESTADOUNIDENSE');

  const officialBuy = official?.buy ?? null;
  const officialSell = official?.sell ?? null;
  const referentialBuy = referential?.buy ?? null;
  const referentialSell = referential?.sell ?? null;

  const preferred = env.BOLIVIA_RATE_SOURCE === 'official'
    ? { buy: officialBuy, sell: officialSell, source: 'bcb_official' }
    : { buy: referentialBuy, sell: referentialSell, source: 'bcb_referential' };

  const fallback = preferred.buy && preferred.sell
    ? preferred
    : officialBuy && officialSell
      ? { buy: officialBuy, sell: officialSell, source: 'bcb_official' }
      : referentialBuy && referentialSell
        ? { buy: referentialBuy, sell: referentialSell, source: 'bcb_referential' }
        : null;

  if (!fallback) {
    return null;
  }

  const midpoint = Number(((fallback.buy + fallback.sell) / 2).toFixed(4));

  return {
    buy: fallback.buy,
    sell: fallback.sell,
    midpoint,
    source: fallback.source,
  };
}

async function fetchBoliviaReferenceRate() {
  try {
    const response = await fetch(env.BCB_HOME_URL || 'https://www.bcb.gob.bo/', {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const parsed = parseReferenceRateFromText(html);

    if (!parsed) {
      return null;
    }

    return {
      baseCurrency: 'USD',
      targetCurrency: 'BOB',
      exchangeRate: parsed.midpoint,
      exchangeRateTimestamp: new Date().toISOString(),
      source: parsed.source,
      details: {
        buy: parsed.buy,
        sell: parsed.sell,
      },
    };
  } catch (error) {
    logger.warn(`[ExchangeRate] No se pudo leer el BCB: ${error.message}`);
    return null;
  }
}

async function getSupportedCurrencies() {
  try {
    const { rows } = await pool.query(
      `
        SELECT codigo, nombre
        FROM monedas
        WHERE habilitada = true
        ORDER BY codigo ASC;
      `
    );

    return rows.length > 0 ? rows : DEFAULT_SUPPORTED_CURRENCIES;
  } catch (_error) {
    return DEFAULT_SUPPORTED_CURRENCIES;
  }
}

async function readSnapshot(baseCurrency) {
  try {
    const raw = await connection.get(buildSnapshotKey(baseCurrency));
    if (!raw) return null;

    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

async function writeSnapshot(baseCurrency, payload) {
  try {
    const ttl = Math.max(Number(env.EXCHANGE_RATE_CACHE_TTL_SECONDS || 3600), 300);
    const snapshot = JSON.stringify(payload);
    await connection.set(buildSnapshotKey(baseCurrency), snapshot, 'EX', ttl);

    const entries = Object.entries(payload.rates || {});
    for (const [currency, rate] of entries) {
      await connection.set(buildCacheKey(baseCurrency, currency), JSON.stringify({
        baseCurrency,
        targetCurrency: currency,
        exchangeRate: rate,
        exchangeRateTimestamp: payload.exchangeRateTimestamp,
      }), 'EX', ttl);
    }
  } catch (error) {
    logger.warn(`[ExchangeRate] No se pudo escribir cache para ${baseCurrency}: ${error.message}`);
  }
}

async function fetchRatesFromApi(baseCurrency) {
  const apiUrl = env.EXCHANGE_RATE_API_URL || `https://open.er-api.com/v6/latest/${baseCurrency}`;

  const response = await fetch(apiUrl, {
    headers: { Accept: 'application/json' },
  });

  let data = null;
  try {
    data = await response.json();
  } catch (_error) {
    data = null;
  }

  if (!response.ok) {
    throw new TechnicalError('La API externa de tipos de cambio no respondió correctamente.', {
      code: 'EXCHANGE_API_HTTP_ERROR',
      statusCode: response.status || 502,
      details: { baseCurrency, status: response.status },
    });
  }

  if (!data || data.result !== 'success' || !data.rates) {
    throw new TechnicalError('La API externa de tipos de cambio devolvió una respuesta inválida.', {
      code: 'EXCHANGE_API_INVALID_RESPONSE',
      statusCode: 502,
      details: { baseCurrency },
    });
  }

  const timestampMs = data.time_last_update_unix
    ? Number(data.time_last_update_unix) * 1000
    : Date.now();

  return {
    baseCurrency: normalizeCurrencyCode(data.base_code || baseCurrency),
    exchangeRateTimestamp: new Date(timestampMs).toISOString(),
    rates: data.rates,
  };
}

async function getRatesForBaseCurrency(baseCurrency) {
  const normalizedBase = normalizeCurrencyCode(baseCurrency) || getBaseCurrency();
  const cached = await readSnapshot(normalizedBase);

  const mergeBoliviaReference = async (payload) => {
    if (normalizedBase !== 'USD' || !payload || !payload.rates) {
      return payload;
    }

    const boliviaReference = await fetchBoliviaReferenceRate();
    if (boliviaReference && Number.isFinite(boliviaReference.exchangeRate) && boliviaReference.exchangeRate > 0) {
      payload.rates = {
        ...payload.rates,
        BOB: boliviaReference.exchangeRate,
      };
      payload.meta = {
        ...(payload.meta || {}),
        BOB: boliviaReference.details,
        BCB_SOURCE: boliviaReference.source,
      };
      payload.sourceMap = {
        ...(payload.sourceMap || {}),
        BOB: boliviaReference.source,
      };
    }

    return payload;
  };

  try {
    let payload = await executeWithRetry(
      () => fetchRatesFromApi(normalizedBase),
      {
        maxRetries: 2,
        shouldRetry: (error) => isTechnicalError(error),
        onRetry: ({ attempt, error }) => {
          logger.warn(`[ExchangeRate] Reintento ${attempt} para ${normalizedBase}: ${error.message}`);
        },
      }
    );

    payload = await mergeBoliviaReference(payload);

    await writeSnapshot(normalizedBase, payload);
    return payload;
  } catch (error) {
    if (cached && cached.rates) {
      logger.warn(`[ExchangeRate] Usando cache para ${normalizedBase} por fallo externo: ${error.message}`);

      const cachedPayload = await mergeBoliviaReference({
        ...cached,
        rates: { ...(cached.rates || {}) },
        meta: { ...(cached.meta || {}) },
        sourceMap: { ...(cached.sourceMap || {}) },
      });

      return cachedPayload;
    }

    logger.error(`[ExchangeRate] Sin tasa disponible para ${normalizedBase}: ${error.message}`);
    throw new BusinessError('No fue posible obtener el tipo de cambio en este momento.', {
      code: 'EXCHANGE_RATE_UNAVAILABLE',
      statusCode: 422,
      details: { baseCurrency: normalizedBase },
    });
  }
}

async function getExchangeRate(targetCurrency, baseCurrency = getBaseCurrency()) {
  const normalizedTarget = normalizeCurrencyCode(targetCurrency);
  const normalizedBase = normalizeCurrencyCode(baseCurrency) || getBaseCurrency();

  if (!normalizedTarget) {
    throw new BusinessError('La moneda objetivo es obligatoria.', {
      code: 'EXCHANGE_RATE_TARGET_REQUIRED',
      statusCode: 400,
    });
  }

  if (normalizedTarget === normalizedBase) {
    return {
      baseCurrency: normalizedBase,
      targetCurrency: normalizedTarget,
      exchangeRate: 1,
      exchangeRateTimestamp: new Date().toISOString(),
      source: 'identity',
    };
  }

  const snapshot = await getRatesForBaseCurrency(normalizedBase);
  const exchangeRate = Number(snapshot.rates?.[normalizedTarget]);

  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new BusinessError(`No existe una tasa válida para ${normalizedTarget}.`, {
      code: 'EXCHANGE_RATE_NOT_FOUND',
      statusCode: 422,
      details: { baseCurrency: normalizedBase, targetCurrency: normalizedTarget },
    });
  }

  return {
    baseCurrency: normalizedBase,
    targetCurrency: normalizedTarget,
    exchangeRate,
    exchangeRateTimestamp: snapshot.exchangeRateTimestamp,
    source: 'external_api',
  };
}

async function convertAmount({ amount, fromCurrency, toCurrency = getBaseCurrency() }) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new BusinessError('El monto a convertir debe ser mayor a 0.', {
      code: 'INVALID_AMOUNT',
      statusCode: 400,
    });
  }

  const normalizedFrom = normalizeCurrencyCode(fromCurrency);
  const normalizedTo = normalizeCurrencyCode(toCurrency) || getBaseCurrency();

  const exchange = await getExchangeRate(normalizedFrom, normalizedTo);
  const convertedAmount = normalizedFrom === normalizedTo
    ? numericAmount
    : Number((numericAmount / exchange.exchangeRate).toFixed(2));

  return {
    originalAmount: numericAmount,
    originalCurrency: normalizedFrom,
    baseCurrency: normalizedTo,
    exchangeRate: exchange.exchangeRate,
    exchangeRateTimestamp: exchange.exchangeRateTimestamp,
    convertedAmount,
    source: exchange.source,
  };
}

async function getCurrencyConfig(empresaId) {
  const [supportedCurrencies, selectedCurrency] = await Promise.all([
    getSupportedCurrencies(),
    pool.query(`SELECT moneda_operativa FROM empresas WHERE id = $1 LIMIT 1;`, [empresaId]),
  ]);

  const baseCurrency = getBaseCurrency();
  const activeCurrency = normalizeCurrencyCode(selectedCurrency.rows[0]?.moneda_operativa || baseCurrency);
  const catalog = await getRatesForBaseCurrency(baseCurrency);

  return {
    baseCurrency,
    selectedCurrency: activeCurrency,
    exchangeRateTimestamp: catalog.exchangeRateTimestamp,
    supportedCurrencies: supportedCurrencies.map((item) => ({
      code: normalizeCurrencyCode(item.codigo),
      name: item.nombre,
      rate: normalizeCurrencyCode(item.codigo) === baseCurrency ? 1 : Number(catalog.rates?.[normalizeCurrencyCode(item.codigo)] || null),
      source: normalizeCurrencyCode(item.codigo) === 'BOB' ? (catalog.sourceMap?.BOB || 'bcb_referential') : 'open_er_api',
    })),
  };
}

module.exports = {
  normalizeCurrencyCode,
  getBaseCurrency,
  getSupportedCurrencies,
  getExchangeRate,
  convertAmount,
  getCurrencyConfig,
};