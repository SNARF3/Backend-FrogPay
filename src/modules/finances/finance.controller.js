const {
  getFinanceKpisService,
  getFinanceChartService,
  getPaymentsListService,
  getPaymentDetailService,
} = require('./finance.service');

const getFinanceKpisController = async (req, res) => {
  try {
    const { rango = '7d' } = req.query;
    const data = await getFinanceKpisService(req.empresaId, rango);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: 'Error obteniendo KPIs',
    });
  }
};

const getChart = async (req, res) => {
  try {
    const empresaId = req.empresaId;
    const { rango } = req.query;

    const data = await getFinanceChartService(empresaId, rango);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false });
  }
};

const getPaymentsController = async (req, res) => {
  try {
    const empresaId = req.empresaId;
    const payload = await getPaymentsListService(empresaId, req.query || {});

    return res.status(200).json({
      success: true,
      ...payload,
    });
  } catch (error) {
    if (error.code === 'INVALID_DATE_PARAM') {
      return res.status(400).json({
        success: false,
        error: 'Parametros de fecha invalidos. Usa formato ISO o YYYY-MM-DD.',
        code: 'INVALID_DATE_PARAM',
      });
    }

    console.error(error);
    return res.status(500).json({
      success: false,
      error: 'Error obteniendo transacciones',
      code: 'PAYMENTS_LIST_FAILED',
    });
  }
};

const getPaymentDetailController = async (req, res) => {
  try {
    const empresaId = req.empresaId;
    const paymentId = String(req.params.id || '').trim();

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        error: 'ID de pago invalido',
        code: 'INVALID_PAYMENT_ID',
      });
    }

    const paymentDetail = await getPaymentDetailService(empresaId, paymentId);

    if (!paymentDetail) {
      return res.status(404).json({
        success: false,
        error: 'Pago no encontrado',
        code: 'PAYMENT_NOT_FOUND',
      });
    }

    return res.status(200).json({
      success: true,
      ...paymentDetail,
      data: paymentDetail,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: 'Error obteniendo detalle del pago',
      code: 'PAYMENT_DETAIL_FAILED',
    });
  }
};

module.exports = {
  getFinanceKpisController,
  getChart,
  getPaymentsController,
  getPaymentDetailController,
};
