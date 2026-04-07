# 🚀 Sistema de Webhooks Asíncronos - Guía de Pruebas y Funcionamiento

He implementado un sistema robusto para notificaciones automáticas (Webhooks) que cumple con la **HU-2.05**. Dado la falta de HTTPS, el sistema utiliza una técnica de **Polling inteligente** en el backend para detectar cambios en la base de datos y disparar los eventos de forma segura.

---

## 🏗️ Arquitectura del Sistema

El flujo funciona de la siguiente manera:

1.  **Polling (`webhook.polling.js`)**: Corre cada 3 segundos. Busca en la tabla `pagos` aquellos cuyo estado actual aún no haya sido notificado exitosamente (revisando la tabla `logs_webhooks` mediante JSONB).
2.  **Dispatcher (`webhook.dispatcher.js`)**: Cuando el Polling detecta un cambio, este servicio toma el pago y lo "despacha" (encola) en **BullMQ**.
3.  **Queue (`webhook.queue.js`)**: La cola gestionada por **Redis** que almacena las tareas pendientes de envío.
4.  **Worker (`webhook.worker.js`)**: El "trabajador" que extrae los jobs de la cola, busca la URL del webhook de la empresa en la DB, realiza el `POST` HTTP y registra el resultado (éxito o fallo) en `logs_webhooks`.

---

## 🧪 Casos de Prueba (Back-End)

Para probar que todo funciona correctamente en el servidor:

### 1. Preparación previa
Asegúrate de tener **Redis** corriendo en tu sistema:
```bash
redis-server
```

### 2. Ejecutar Prueba de Integración
He creado un script para verificar que la cola BullMQ y el despachador estén conectados:
```bash
node tests/webhook.test.js
```
*Si ves el mensaje "PRUEBA EXITOSA", significa que el despachador logró meter un mensaje en la cola de Redis.*

### 3. Simulación de Flujo Completo (Polling + Worker)
Sigue estos pasos manuales para ver la "magia" en acción:

1.  **Inicia el servidor**: `npm run dev`. Verás en consola que el Worker y el Polling arrancan.
2.  **Registra un Webhook de prueba**: Inserta en la tabla `webhooks` una URL que puedas monitorear (puedes usar un webhook.site o una URL local como `http://localhost:4000/callback`).
    ```sql
    INSERT INTO webhooks (empresa_id, url, evento, activo)
    VALUES ('ID_DE_TU_EMPRESA', 'https://webhook.site/tu-id-unico', 'pago.completado', true);
    ```
3.  **Simula un pago**: Crea un pago en estado `PENDIENTE`.
4.  **Dispara el Polling**: Cambia el estado del pago a `COMPLETADO`.
    ```sql
    UPDATE pagos SET estado = 'COMPLETADO', actualizado_en = CURRENT_TIMESTAMP WHERE id = 'ID_DEL_PAGO';
    ```
5.  **Observa la consola**: En máximo 3 segundos, verás que el Polling detecta el cambio, el Worker toma el trabajo y envía el POST.
6.  **Verifica Logs**: Revisa la tabla `logs_webhooks` para ver el payload enviado y si el estado fue `success` o `failed`.

---

## 💻 Cómo probarlo desde el Front-End

Desde el frontend, no necesitas llamar a los webhooks directamente (eso lo hace el servidor de forma asíncrona). Sin embargo, puedes validar el funcionamiento así:

1.  **Panel de Configuración**: Crea una sección en tu frontend donde la Empresa pueda guardar su `URL de Webhook`. Esto insertará registros en la tabla `webhooks`.
2.  **Confirmación de Pago**: Cuando realices una acción en el frontend que actualice el estado de un pago (como pulsar un botón de "Confirmar Pago" que llame a tu API de Backend), el sistema de Polling detectará ese cambio en segundos y disparará la notificación al servidor del cliente automáticamente.
3.  **Historial de Notificaciones**: Puedes crear una vista de "Logs de Webhooks" consultando la tabla `logs_webhooks` para que el usuario sepa si su servidor recibió la notificación correctamente o si falló (y cuántos intentos lleva).
