-- Add uniqueness for one provider account config per tenant+provider.
-- Run once in your PostgreSQL database.

CREATE UNIQUE INDEX IF NOT EXISTS ux_empresa_proveedores_empresa_proveedor
ON public.empresa_proveedores (empresa_id, proveedor_id);
