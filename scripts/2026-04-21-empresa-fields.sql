-- Add missing fields to empresas table for client profile management
ALTER TABLE empresas
ADD COLUMN IF NOT EXISTS telefono VARCHAR(20),
ADD COLUMN IF NOT EXISTS direccion TEXT;

-- Ensure all required payment methods are enabled by default
UPDATE empresas 
SET metodos_pago_habilitados = ARRAY['card', 'paypal', 'qr']
WHERE metodos_pago_habilitados IS NULL 
   OR metodos_pago_habilitados @> ARRAY['mock'];
