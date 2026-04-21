-- Migration: 2026-04-19-qr-payment-features.sql
-- Purpose: Add QR payment method support (HU-29, HU-30, HU-32)

-- HU-29: Tenant-level enabled payment methods
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS metodos_pago_habilitados TEXT[]
  NOT NULL DEFAULT ARRAY['card','paypal','qr'];

-- HU-30 / HU-32: Store QR artefacts on the payment row
ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS qr_code TEXT,
  ADD COLUMN IF NOT EXISTS qr_url  TEXT;
