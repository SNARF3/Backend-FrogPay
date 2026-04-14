const { getKpisRango, getChartData } = require('./finance.model');

const calcularCrecimiento = (actual, anterior) => {
  if (anterior === 0) return actual > 0 ? 100 : 0;
  return ((actual - anterior) / anterior) * 100;
};

const getFinanceKpisService = async (empresaId, rango) => {

  let dias = 7;
  if (rango === '24h') dias = 1;
  if (rango === '30d') dias = 30;

  const [actualRaw, anteriorRaw] = await Promise.all([
    getKpisRango(empresaId, 0, dias),
    getKpisRango(empresaId, dias, dias * 2)
  ]);

  // 🔥 NORMALIZACIÓN (CLAVE)
  const actual = {
    volumen: Number(actualRaw.volumen_procesado) || 0,
    pagos: Number(actualRaw.pagos_exitosos) || 0,
    ticket: Number(actualRaw.ticket_promedio) || 0
  };

  const anterior = {
    volumen: Number(anteriorRaw.volumen_procesado) || 0,
    pagos: Number(anteriorRaw.pagos_exitosos) || 0,
    ticket: Number(anteriorRaw.ticket_promedio) || 0
  };

  return {
    volumenProcesado: {
      valor: actual.volumen,
      crecimientoPorcentaje: calcularCrecimiento(actual.volumen, anterior.volumen),
      crecimientoPositivo: actual.volumen >= anterior.volumen,
      valorAnterior: anterior.volumen
    },
    pagosExitosos: {
      valor: actual.pagos,
      crecimientoPorcentaje: calcularCrecimiento(actual.pagos, anterior.pagos),
      crecimientoPositivo: actual.pagos >= anterior.pagos
    },
    ticketPromedio: {
      valor: actual.ticket,
      crecimientoPorcentaje: calcularCrecimiento(actual.ticket, anterior.ticket),
      crecimientoPositivo: actual.ticket >= anterior.ticket
    }
  };
};


const getFinanceChartService = async (empresaId, rango) => {
  let dias = 7;
  if (rango === '24h') dias = 1;
  if (rango === '30d') dias = 30;

  const data = await getChartData(empresaId, dias);

  return data.map(row => ({
    fecha: new Date(row.fecha).toLocaleDateString('es-BO', {
      day: '2-digit',
      month: 'short'
    }),
    ingresos: Number(row.ingresos),
    transacciones: Number(row.transacciones)
  }));
};

module.exports = { getFinanceKpisService,getFinanceChartService  };