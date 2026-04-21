# HU-19 - Panel de transacciones

Fecha: 2026-04-20

## Objetivo
Implementar endpoints para el dashboard de transacciones:
- `GET /api/payments`
- `GET /api/payments/:id`

## Archivos modificados
- `src/modules/finances/finance.model.js`
- `src/modules/finances/finance.service.js`
- `src/modules/finances/finance.controller.js`
- `src/routes/payment.routes.js`

## Endpoint 1: GET /api/payments
Listado de transacciones por empresa (tenant autenticado).

### Query params opcionales
- `payment_id`: busqueda parcial por identificador de pago
- `estado` (o `status`): filtro exacto por estado
- `proveedor` (o `provider`): filtro por proveedor
- `date_from` (o `from`): fecha inicial (`YYYY-MM-DD` o ISO)
- `date_to` (o `to`): fecha final (`YYYY-MM-DD` o ISO)
- `sort_by` (o `sortBy`): `fecha` (default), `monto`, `estado`, `proveedor`
- `order` (o `sort_order`/`sortOrder`): `desc` (default) o `asc`
- `page`: pagina (default `1`)
- `limit`: tamano de pagina (default `20`, max `100`)

### Respuesta
- Incluye `fecha` legible y `fecha_iso`
- Orden descendente por fecha por defecto
- Datos principales: `id`, `payment_id`, `monto`, `moneda`, `proveedor`, `estado`

## Endpoint 2: GET /api/payments/:id
Detalle completo de una transaccion por `payment_id`.

### Respuesta principal
- `payment_id`, `monto`, `moneda`, `estado`, `proveedor`
- Compatibilidad: `creado_en` y `actualizado_en` tambien se exponen en la raiz
- `historial_estados`:
  - `from_state`, `to_state`
  - `provider`
  - `provider_transaction_id`
  - `timestamp` y `timestamp_legible`
- `transacciones_proveedor`:
  - transacciones del proveedor relacionadas
- `timestamps`:
  - `creado_en`, `actualizado_en`
  - `creado_en_legible`, `actualizado_en_legible`

## Notas de implementacion
- Ambos endpoints respetan aislamiento por tenant usando `req.empresaId` del middleware de autenticacion.
- Si no existe el pago para la empresa autenticada, responde `404` con `PAYMENT_NOT_FOUND`.
- Si fecha de query no es valida, responde `400` con `INVALID_DATE_PARAM`.
