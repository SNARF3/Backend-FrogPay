const service = require('./dashboards.service');

function getEmpresaId(req) {
  return req.empresaId || req.user?.empresa_id || req.user?.empresaId || null;
}

function handleDashboardError(res, error) {
  if (error.code === 'INVALID_DATE_PARAM') {
    return res.status(400).json({
      success: false,
      message: 'Parametros de fecha invalidos. Usa formato ISO o YYYY-MM-DD.',
      code: 'INVALID_DATE_PARAM',
    });
  }

  console.error('DASHBOARD ERROR:', error);

  return res.status(500).json({
    success: false,
    message: 'No se pudieron cargar los KPIs financieros',
    code: 'DASHBOARD_KPIS_FAILED',
  });
}

const getKpis = async (req, res) => {
  try {
    const empresaId = getEmpresaId(req);

    if (!empresaId) {
      return res.status(401).json({
        success: false,
        message: 'No autorizado: empresa no identificada.',
        code: 'UNAUTHORIZED',
      });
    }

    const data = await service.getDashboard(empresaId, req.query || {});

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return handleDashboardError(res, error);
  }
};

const exportKpisExcel = async (req, res) => {
  try {
    const empresaId = getEmpresaId(req);

    if (!empresaId) {
      return res.status(401).json({
        success: false,
        message: 'No autorizado: empresa no identificada.',
        code: 'UNAUTHORIZED',
      });
    }

    const dashboard = await service.getDashboard(empresaId, req.query || {});
    const generatedAt = new Date().toISOString();
    const csv = service.buildDashboardCsv({
      empresaId,
      generatedAt,
      dashboard,
    });

    const filename = `finances-kpis-${Date.now()}.csv`;

    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    return res.status(200).send(csv);
  } catch (error) {
    return handleDashboardError(res, error);
  }
};

const exportKpisPdf = async (req, res) => {
  try {
    const empresaId = getEmpresaId(req);

    if (!empresaId) {
      return res.status(401).json({
        success: false,
        message: 'No autorizado: empresa no identificada.',
        code: 'UNAUTHORIZED',
      });
    }

    const dashboard = await service.getDashboard(empresaId, req.query || {});
    const generatedAt = new Date().toISOString();
    const pdfBuffer = service.buildDashboardPdf({
      empresaId,
      generatedAt,
      dashboard,
    });

    const filename = `finances-kpis-${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    return res.status(200).send(pdfBuffer);
  } catch (error) {
    return handleDashboardError(res, error);
  }
};

module.exports = {
  getKpis,
  exportKpisExcel,
  exportKpisPdf,
};
