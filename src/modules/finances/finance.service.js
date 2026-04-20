const {
  getKpisRango,
  getChartData,
  getPaymentsListByEmpresa,
  getPaymentDetailById,
  getPaymentEventsHistory,
  getPaymentProviderTransactions,
} = require('./finance.model');

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;
const DEFAULT_TIMEZONE = process.env.APP_TIMEZONE || 'America/La_Paz';

const calcularCrecimiento = (actual, anterior) => {
  if (anterior === 0) return actual > 0 ? 100 : 0;
  return ((actual - anterior) / anterior) * 100;
};

function formatDateReadable(dateValue) {
  if (!dateValue) return null;

  return new Date(dateValue).toLocaleString('es-BO', {
    timeZone: DEFAULT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

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

function normalizePaymentsQuery(rawQuery = {}) {
  const paymentId = String(rawQuery.payment_id || rawQuery.paymentId || '').trim() || null;
  const estado = String(rawQuery.estado || rawQuery.status || '').trim() || null;
  const proveedor = String(rawQuery.proveedor || rawQuery.provider || '').trim() || null;
  const sortBy = String(rawQuery.sort_by || rawQuery.sortBy || 'fecha').trim().toLowerCase();
  const sortOrder = String(rawQuery.order || rawQuery.sort_order || rawQuery.sortOrder || 'desc')
    .trim()
    .toLowerCase();

  const page = parsePositiveInt(rawQuery.page, 1);
  const requestedLimit = parsePositiveInt(rawQuery.limit, DEFAULT_LIST_LIMIT);
  const limit = Math.min(requestedLimit, MAX_LIST_LIMIT);
  const offset = (page - 1) * limit;

  const dateFrom = parseDateParam(rawQuery.date_from || rawQuery.from || null, false);
  const dateTo = parseDateParam(rawQuery.date_to || rawQuery.to || null, true);

  return {
    paymentId,
    estado,
    proveedor,
    sortBy,
    sortOrder,
    page,
    limit,
    offset,
    dateFrom,
    dateTo,
  };
}

function mapPaymentListItem(row) {
  return {
    id: row.payment_id,
    payment_id: row.payment_id,
    fecha: formatDateReadable(row.creado_en),
    fecha_iso: row.creado_en ? new Date(row.creado_en).toISOString() : null,
    monto: Number(row.monto || 0),
    moneda: row.moneda || null,
    proveedor: row.proveedor || null,
    estado: row.estado || null,
    provider_transaction_id: row.provider_transaction_id || null,
    actualizado_en: row.actualizado_en ? new Date(row.actualizado_en).toISOString() : null,
  };
}

function mapStatusEvents({ payment, events, providerTransactions }) {
  if (events.length > 0) {
    return events.map((event) => ({
      from_state: event.from_state || null,
      to_state: event.to_state || null,
      estado: event.to_state || event.from_state || null,
      provider: event.provider || payment.proveedor || null,
      provider_transaction_id: event.provider_transaction_id || null,
      error_code: event.error_code || null,
      error_message: event.error_message || null,
      metadata: event.metadata || {},
      timestamp: event.creado_en ? new Date(event.creado_en).toISOString() : null,
      timestamp_legible: formatDateReadable(event.creado_en),
    }));
  }

  if (providerTransactions.length > 0) {
    return providerTransactions.map((tx) => ({
      from_state: null,
      to_state: tx.estado || null,
      estado: tx.estado || null,
      provider: payment.proveedor || null,
      provider_transaction_id: tx.id_transaccion_proveedor || null,
      error_code: null,
      error_message: null,
      metadata: {},
      timestamp: tx.creado_en ? new Date(tx.creado_en).toISOString() : null,
      timestamp_legible: formatDateReadable(tx.creado_en),
    }));
  }

  return [
    {
      from_state: null,
      to_state: payment.estado || null,
      estado: payment.estado || null,
      provider: payment.proveedor || null,
      provider_transaction_id: null,
      error_code: null,
      error_message: null,
      metadata: {},
      timestamp: payment.actualizado_en ? new Date(payment.actualizado_en).toISOString() : null,
      timestamp_legible: formatDateReadable(payment.actualizado_en),
    },
  ];
}

const getFinanceKpisService = async (empresaId, rango) => {
  let dias = 7;
  if (rango === '24h') dias = 1;
  if (rango === '30d') dias = 30;

  const [actualRaw, anteriorRaw] = await Promise.all([
    getKpisRango(empresaId, 0, dias),
    getKpisRango(empresaId, dias, dias * 2),
  ]);

  const actual = {
    volumen: Number(actualRaw.volumen_procesado) || 0,
    pagos: Number(actualRaw.pagos_exitosos) || 0,
    ticket: Number(actualRaw.ticket_promedio) || 0,
  };

  const anterior = {
    volumen: Number(anteriorRaw.volumen_procesado) || 0,
    pagos: Number(anteriorRaw.pagos_exitosos) || 0,
    ticket: Number(anteriorRaw.ticket_promedio) || 0,
  };

  return {
    volumenProcesado: {
      valor: actual.volumen,
      crecimientoPorcentaje: calcularCrecimiento(actual.volumen, anterior.volumen),
      crecimientoPositivo: actual.volumen >= anterior.volumen,
      valorAnterior: anterior.volumen,
    },
    pagosExitosos: {
      valor: actual.pagos,
      crecimientoPorcentaje: calcularCrecimiento(actual.pagos, anterior.pagos),
      crecimientoPositivo: actual.pagos >= anterior.pagos,
    },
    ticketPromedio: {
      valor: actual.ticket,
      crecimientoPorcentaje: calcularCrecimiento(actual.ticket, anterior.ticket),
      crecimientoPositivo: actual.ticket >= anterior.ticket,
    },
  };
};

const getFinanceChartService = async (empresaId, rango) => {
  let dias = 7;
  if (rango === '24h') dias = 1;
  if (rango === '30d') dias = 30;

  const data = await getChartData(empresaId, dias);
  const map = {};

  data.forEach((row) => {
    const fecha = new Date(row.fecha).toISOString().split('T')[0];
    map[fecha] = {
      ingresos: Number(row.ingresos),
      transacciones: Number(row.transacciones),
    };
  });

  const result = [];

  for (let i = dias - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];

    result.push({
      fecha: d.toLocaleDateString('es-BO', {
        day: '2-digit',
        month: 'short',
      }),
      ingresos: map[key]?.ingresos || 0,
      transacciones: map[key]?.transacciones || 0,
    });
  }

  return result;
};

async function getPaymentsListService(empresaId, rawQuery = {}) {
  const query = normalizePaymentsQuery(rawQuery);
  const { rows, total } = await getPaymentsListByEmpresa({
    empresaId,
    paymentId: query.paymentId,
    estado: query.estado,
    proveedor: query.proveedor,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    limit: query.limit,
    offset: query.offset,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });

  const items = rows.map(mapPaymentListItem);
  const totalPages = query.limit > 0 ? Math.ceil(total / query.limit) : 1;

  return {
    data: items,
    count: items.length,
    pagination: {
      total,
      page: query.page,
      limit: query.limit,
      total_pages: totalPages,
    },
    filters: {
      payment_id: query.paymentId,
      estado: query.estado,
      proveedor: query.proveedor,
      date_from: query.dateFrom,
      date_to: query.dateTo,
    },
    sort: {
      by: query.sortBy || 'fecha',
      order: query.sortOrder || 'desc',
    },
  };
}

async function getPaymentDetailService(empresaId, paymentId) {
  const payment = await getPaymentDetailById({ empresaId, paymentId });
  if (!payment) return null;

  const [events, providerTransactions] = await Promise.all([
    getPaymentEventsHistory(paymentId),
    getPaymentProviderTransactions(paymentId),
  ]);

  const historialEstados = mapStatusEvents({
    payment,
    events,
    providerTransactions,
  });

  const providerTransactionsMapped = providerTransactions.map((tx) => ({
    id: tx.id,
    id_transaccion_proveedor: tx.id_transaccion_proveedor || null,
    estado: tx.estado || null,
    codigo_respuesta: tx.codigo_respuesta || null,
    mensaje_respuesta: tx.mensaje_respuesta || null,
    timestamp: tx.creado_en ? new Date(tx.creado_en).toISOString() : null,
    timestamp_legible: formatDateReadable(tx.creado_en),
  }));

  return {
    payment_id: payment.id,
    id: payment.id,
    monto: Number(payment.monto || 0),
    moneda: payment.moneda || null,
    estado: payment.estado || null,
    proveedor: payment.proveedor || null,
    proveedor_utilizado: payment.proveedor || null,
    descripcion: payment.descripcion || null,
    qr_code: payment.qr_code || null,
    qr_url: payment.qr_url || null,
    clave_idempotencia: payment.clave_idempotencia || null,
    provider_transaction_id:
      payment.provider_transaction_id
      || (providerTransactionsMapped.length
        ? providerTransactionsMapped[providerTransactionsMapped.length - 1].id_transaccion_proveedor
        : null)
      || null,
    provider_response_code: payment.provider_response_code || null,
    provider_response_message: payment.provider_response_message || null,
    creado_en: payment.creado_en ? new Date(payment.creado_en).toISOString() : null,
    actualizado_en: payment.actualizado_en ? new Date(payment.actualizado_en).toISOString() : null,
    historial_estados: historialEstados,
    transacciones_proveedor: providerTransactionsMapped,
    timestamps: {
      creado_en: payment.creado_en ? new Date(payment.creado_en).toISOString() : null,
      actualizado_en: payment.actualizado_en ? new Date(payment.actualizado_en).toISOString() : null,
      creado_en_legible: formatDateReadable(payment.creado_en),
      actualizado_en_legible: formatDateReadable(payment.actualizado_en),
      exchange_rate_timestamp: payment.exchange_rate_timestamp
        ? new Date(payment.exchange_rate_timestamp).toISOString()
        : null,
    },
    conversion: {
      original_amount: payment.original_amount ? Number(payment.original_amount) : null,
      original_currency: payment.original_currency || null,
      exchange_rate: payment.exchange_rate ? Number(payment.exchange_rate) : null,
      converted_amount: payment.converted_amount ? Number(payment.converted_amount) : null,
      base_currency: payment.base_currency || null,
    },
  };
}

module.exports = {
  getFinanceKpisService,
  getFinanceChartService,
  getPaymentsListService,
  getPaymentDetailService,
};
