const { getFinanceKpisService,getFinanceChartService  } = require('./finance.service');

const getFinanceKpisController = async (req, res) => {
  try {
    const { rango = '7d' } = req.query;

    console.log("EMPRESA ID:", req.empresaId);

    const data = await getFinanceKpisService(req.empresaId, rango);

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: "Error obteniendo KPIs"
    });
  }
};

const getChart = async (req, res) => {
  try {
    const empresaId = req.user.empresa_id;
    const { rango } = req.query;

    const data = await getFinanceChartService(empresaId, rango);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
};


module.exports = { getFinanceKpisController, getChart };