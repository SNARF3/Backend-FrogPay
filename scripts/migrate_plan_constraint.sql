-- ==========================================================
-- Migración: Normalización y constraint del campo `plan` en empresas
-- Descripción: Asegura que el campo plan solo acepte valores
--              FREEMIUM o PREMIUM (case-insensitive normalizado a mayúsculas).
-- Ejecutar en Supabase SQL Editor
-- ==========================================================

-- 1. Normalizar los valores actuales a MAYÚSCULAS
UPDATE public.empresas
SET plan = UPPER(plan)
WHERE plan IS NOT NULL;

-- 2. Establecer 'FREEMIUM' como valor por defecto para nuevas empresas
ALTER TABLE public.empresas
  ALTER COLUMN plan SET DEFAULT 'FREEMIUM';

-- 3. Agregar un CHECK constraint para validar valores permitidos
--    (Si ya existe un constraint con ese nombre, elimínalo primero)
ALTER TABLE public.empresas
  DROP CONSTRAINT IF EXISTS chk_empresas_plan;

ALTER TABLE public.empresas
  ADD CONSTRAINT chk_empresas_plan
  CHECK (plan IN ('FREEMIUM', 'PREMIUM'));

-- 4. Verificar el estado de la tabla después de la migración
-- SELECT id, nombre, plan FROM public.empresas LIMIT 10;
