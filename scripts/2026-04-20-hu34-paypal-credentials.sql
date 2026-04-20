-- Migration: 2026-04-20-hu34-paypal-credentials.sql
-- Purpose: HU-34 — Ensure empresa_proveedores can store long PayPal credentials.
--          PayPal Client IDs and Secrets are ~80+ characters.
--          If api_key/secret_key were created as VARCHAR(N<80), they would truncate.
--          Converting to TEXT removes any length restriction.
-- Run once in Supabase Dashboard → SQL Editor.

ALTER TABLE empresa_proveedores
    ALTER COLUMN api_key TYPE TEXT,
    ALTER COLUMN secret_key TYPE TEXT;
