-- Migration for currency conversion support and tenant currency preference.
-- Run once on PostgreSQL.

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS moneda_operativa character varying NOT NULL DEFAULT 'BOB';

INSERT INTO public.monedas (codigo, nombre, habilitada)
VALUES
  ('USD', 'Dólar estadounidense', true),
  ('BOB', 'Boliviano', true),
  ('ARS', 'Peso argentino', true),
  ('CLP', 'Peso chileno', true),
  ('COP', 'Peso colombiano', true),
  ('PEN', 'Sol peruano', true),
  ('MXN', 'Peso mexicano', true),
  ('EUR', 'Euro', true),
  ('BRL', 'Real brasileño', true),
  ('UYU', 'Peso uruguayo', true),
  ('PYG', 'Guaraní paraguayo', true),
  ('CAD', 'Dólar canadiense', true),
  ('AUD', 'Dólar australiano', true),
  ('GBP', 'Libra esterlina', true),
  ('CHF', 'Franco suizo', true),
  ('JPY', 'Yen japonés', true),
  ('CNY', 'Yuan chino', true),
  ('INR', 'Rupia india', true),
  ('KRW', 'Won surcoreano', true),
  ('NZD', 'Dólar neozelandés', true),
  ('TRY', 'Lira turca', true),
  ('SEK', 'Corona sueca', true),
  ('NOK', 'Corona noruega', true),
  ('DKK', 'Corona danesa', true),
  ('PLN', 'Zloty polaco', true),
  ('CZK', 'Corona checa', true),
  ('HUF', 'Forinto húngaro', true),
  ('AED', 'Dírham emiratí', true),
  ('SAR', 'Riyal saudí', true),
  ('MXV', 'Unidad de inversión mexicana', true)
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE public.pagos
  ADD COLUMN IF NOT EXISTS original_amount numeric,
  ADD COLUMN IF NOT EXISTS original_currency character varying,
  ADD COLUMN IF NOT EXISTS exchange_rate numeric,
  ADD COLUMN IF NOT EXISTS converted_amount numeric,
  ADD COLUMN IF NOT EXISTS base_currency character varying NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS exchange_rate_timestamp timestamp without time zone;

CREATE INDEX IF NOT EXISTS idx_pagos_empresa_moneda_operativa
  ON public.pagos (empresa_id, base_currency, original_currency);
