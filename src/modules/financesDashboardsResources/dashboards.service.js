const model = require('./dashboards.model');

const DEFAULT_RANGE = '7d';
const RANGE_TO_HOURS = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
};

function parseDateParam(value, isEndOfDay = false) {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error('Fecha invalida');
    error.code = 'INVALID_DATE_PARAM';
    throw error;
  }

  if (!raw.includes('T') && isEndOfDay) {
    parsed.setHours(23, 59, 59, 999);
  }

  return parsed.toISOString();
}

function getRangeStartIso(range) {
  const hours = RANGE_TO_HOURS[range] || RANGE_TO_HOURS[DEFAULT_RANGE];
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date.toISOString();
}

function normalizeDashboardFilters(rawQuery = {}) {
  const rangeInput = String(rawQuery.range || rawQuery.rango || DEFAULT_RANGE)
    .trim()
    .toLowerCase();

  const range = RANGE_TO_HOURS[rangeInput] ? rangeInput : DEFAULT_RANGE;

  const proveedor = String(rawQuery.proveedor || rawQuery.provider || '')
    .trim()
    .toLowerCase() || null;

  const estado = String(rawQuery.estado || rawQuery.status || '')
    .trim()
    .toUpperCase() || null;

  let dateFrom = parseDateParam(rawQuery.date_from || rawQuery.from || null, false);
  const dateTo = parseDateParam(rawQuery.date_to || rawQuery.to || null, true);

  if (!dateFrom && !dateTo) {
    dateFrom = getRangeStartIso(range);
  }

  return {
    range,
    proveedor,
    estado,
    dateFrom,
    dateTo,
  };
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toInt(value, fallback = 0) {
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeProviderList(items = []) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const normalized = String(item || '').trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function pickProviderUniverse({ configuredProviders, providerFilter, providerRows }) {
  if (providerFilter) {
    return [providerFilter];
  }

  const normalizedConfigured = normalizeProviderList(configuredProviders);
  if (normalizedConfigured.length > 0) {
    return normalizedConfigured;
  }

  return normalizeProviderList(providerRows.map((row) => row.proveedor));
}

const getDashboard = async (empresaId, rawQuery = {}) => {
  const filters = normalizeDashboardFilters(rawQuery);

  const [data, configuredProviders] = await Promise.all([
    model.getFinanceSnapshot(empresaId, filters),
    model.getConfiguredProviders(empresaId),
  ]);

  if (!data || !data.kpis) {
    throw new Error('EMPTY_DATA');
  }

  const kpis = {
    ingresos: toNumber(data.kpis.ingresos),
    transacciones: toInt(data.kpis.transacciones),
    successRate: toNumber(data.kpis.success_rate),
    ticketPromedio: toNumber(data.kpis.ticket_promedio),
  };

  const chartRows = Array.isArray(data.chart) ? data.chart : [];
  const chart = chartRows.map((row) => ({
    fecha: row.fecha,
    ingresos: toNumber(row.ingresos),
    transacciones: toInt(row.transacciones),
  }));

  const providerRows = (Array.isArray(data.providers) ? data.providers : []).map((row) => ({
    proveedor: String(row.proveedor || '').trim().toLowerCase() || 'desconocido',
    monto: toNumber(row.monto),
  }));

  const providerUniverse = pickProviderUniverse({
    configuredProviders,
    providerFilter: filters.proveedor,
    providerRows,
  });

  const amountByProvider = new Map();
  for (const row of providerRows) {
    amountByProvider.set(row.proveedor, toNumber(row.monto));
  }

  const providerTotal = providerUniverse.reduce((acc, providerName) => {
    return acc + toNumber(amountByProvider.get(providerName), 0);
  }, 0);

  const providers = providerUniverse.map((providerName) => {
    const amount = toNumber(amountByProvider.get(providerName), 0);

    return {
      proveedor: providerName,
      monto: amount,
      porcentaje: providerTotal > 0 ? Number(((amount / providerTotal) * 100).toFixed(2)) : 0,
    };
  });

  return {
    kpis,
    chart,
    providers,
    filters: {
      range: filters.range,
      date_from: filters.dateFrom,
      date_to: filters.dateTo,
      estado: filters.estado,
      proveedor: filters.proveedor,
    },
  };
};

function escapeCsvValue(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
}

function buildDashboardCsv({ empresaId, generatedAt, dashboard }) {
  const rows = [];

  rows.push(['seccion', 'campo', 'valor']);
  rows.push(['meta', 'empresa_id', empresaId]);
  rows.push(['meta', 'generado_en', generatedAt]);
  rows.push(['meta', 'range', dashboard.filters?.range || '']);
  rows.push(['meta', 'date_from', dashboard.filters?.date_from || '']);
  rows.push(['meta', 'date_to', dashboard.filters?.date_to || '']);
  rows.push(['meta', 'estado', dashboard.filters?.estado || '']);
  rows.push(['meta', 'proveedor', dashboard.filters?.proveedor || '']);

  rows.push(['kpi', 'ingresos', dashboard.kpis.ingresos]);
  rows.push(['kpi', 'transacciones', dashboard.kpis.transacciones]);
  rows.push(['kpi', 'success_rate', dashboard.kpis.successRate]);
  rows.push(['kpi', 'ticket_promedio', dashboard.kpis.ticketPromedio]);

  for (const provider of dashboard.providers || []) {
    rows.push(['provider', provider.proveedor, provider.monto]);
    rows.push(['provider', `${provider.proveedor}_porcentaje`, provider.porcentaje]);
  }

  for (const row of dashboard.chart || []) {
    rows.push(['chart', row.fecha, `${row.ingresos}|${row.transacciones}`]);
  }

  return `\uFEFF${rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')}\n`;
}

function escapePdfText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function buildSimplePdf(lines) {
  const contentLines = ['BT', '/F1 11 Tf', '48 780 Td'];

  lines.forEach((line, index) => {
    const safeLine = escapePdfText(String(line || '').slice(0, 100));
    if (index === 0) {
      contentLines.push(`(${safeLine}) Tj`);
    } else {
      contentLines.push(`0 -15 Td (${safeLine}) Tj`);
    }
  });

  contentLines.push('ET');

  const streamContent = contentLines.join('\n');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'utf8')} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += object;
  }

  const xrefStart = Buffer.byteLength(pdf, 'utf8');

  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';

  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}

function formatMoney(value) {
  return toNumber(value).toFixed(2);
}

function formatRate(value) {
  return `${toNumber(value).toFixed(2)}%`;
}

function buildDashboardPdf({ empresaId, generatedAt, dashboard }) {
  const lines = [
    'FrogPay - KPIs Financieros',
    `Empresa: ${empresaId}`,
    `Generado: ${generatedAt}`,
    `Rango: ${dashboard.filters?.range || ''}`,
    `Fecha desde: ${dashboard.filters?.date_from || ''}`,
    `Fecha hasta: ${dashboard.filters?.date_to || ''}`,
    `Estado filtro: ${dashboard.filters?.estado || ''}`,
    `Proveedor filtro: ${dashboard.filters?.proveedor || ''}`,
    '',
    `Ingresos: ${formatMoney(dashboard.kpis.ingresos)}`,
    `Transacciones: ${dashboard.kpis.transacciones}`,
    `Success rate: ${formatRate(dashboard.kpis.successRate)}`,
    `Ticket promedio: ${formatMoney(dashboard.kpis.ticketPromedio)}`,
    '',
    'Proveedores:',
  ];

  (dashboard.providers || []).forEach((provider) => {
    lines.push(
      `- ${provider.proveedor}: ${formatRate(provider.porcentaje)} (monto ${formatMoney(provider.monto)})`
    );
  });

  lines.push('');
  lines.push('Chart (fecha, ingresos, transacciones):');

  (dashboard.chart || []).slice(0, 20).forEach((row) => {
    lines.push(`- ${row.fecha}: ${formatMoney(row.ingresos)}, ${row.transacciones}`);
  });

  return buildSimplePdf(lines.slice(0, 44));
}

module.exports = {
  getDashboard,
  buildDashboardCsv,
  buildDashboardPdf,
};
