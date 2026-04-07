const pool = require('../src/config/database');
const webhookDispatcher = require('../src/modules/webhooks/webhook.dispatcher');
const { webhookQueue } = require('../src/modules/webhooks/webhook.queue');

/**
 * Script de prueba de integración para el sistema de Webhooks.
 * Verifica la capacidad de encolar un evento y la conectividad con BullMQ.
 */
async function runTest() {
  console.log('--- Iniciando Prueba de Integración de Webhooks ---');

  try {
    // 1. Limpiar cola previa (opcional para test limpio)
    await webhookQueue.drain();
    console.log('✅ Cola BullMQ limpiada.');

    // 2. Simular un pago de prueba
    const mockPayment = {
      id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      empresa_id: '550e8400-e29b-41d4-a716-446655440000',
      monto: 100.50,
      moneda: 'USD',
      estado: 'COMPLETADO'
    };

    console.log('📡 Despachando evento: pago.completado...');
    const result = await webhookDispatcher.dispatch(mockPayment, 'pago.completado');

    if (result) {
      console.log('✅ Evento encolado exitosamente en BullMQ.');
    } else {
      console.log('❌ Error al encolar el evento.');
    }

    // 3. Verificar conteo de jobs
    const jobCount = await webhookQueue.getWaitingCount();
    console.log(`📊 Trabajos esperando en cola: ${jobCount}`);

    if (jobCount > 0) {
      console.log('🚀 PRUEBA EXITOSA: El despachador funciona correctamente.');
    }

  } catch (error) {
    console.error('❌ Error durante la prueba:', error.message);
  } finally {
    // No cerramos el pool aquí si el worker está corriendo en otro proceso, 
    // pero para este script corto salimos.
    console.log('--- Fin de la Prueba ---');
    process.exit(0);
  }
}

runTest();
