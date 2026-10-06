-- Facilita que las referencias antiguas se administren desde Supabase y permite
-- retirar una referencia sin que la copia estática del catálogo vuelva a mostrarla.
BEGIN;

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS eliminado boolean NOT NULL DEFAULT false;

GRANT SELECT ON TABLE public.productos TO anon, authenticated;

DROP POLICY IF EXISTS "Lectura pública de productos retirados" ON public.productos;
CREATE POLICY "Lectura pública de productos retirados"
  ON public.productos
  FOR SELECT
  TO anon, authenticated
  USING (eliminado = true);

COMMIT;
