-- Archivo de migración opcional.
-- Nota: La tabla empresa_proveedores ya cuenta con la columna 'configuracion JSONB', 
-- la cual es la mejor práctica para almacenar todos estos campos extra sin necesidad de alterar el esquema.
-- Sin embargo, si deseas persistir estos campos en columnas estrictas y separadas, puedes ejecutar esta migración.

ALTER TABLE public.empresa_proveedores
ADD COLUMN IF NOT EXISTS paypal_merchant_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS paypal_merchant_account_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS paypal_webhook_secret VARCHAR(255),
ADD COLUMN IF NOT EXISTS paypal_callback_url TEXT,
ADD COLUMN IF NOT EXISTS card_account_holder_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS card_settlement_account_alias VARCHAR(100),
ADD COLUMN IF NOT EXISTS card_support_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS card_chargeback_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS card_accepted_brands VARCHAR(50)[] DEFAULT ARRAY['visa', 'mastercard']::VARCHAR[],
ADD COLUMN IF NOT EXISTS card_settlement_delay_days INTEGER DEFAULT 2;
