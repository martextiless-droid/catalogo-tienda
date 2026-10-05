-- Añade una galería de imágenes sin modificar los productos existentes.
-- imagen_url se conserva como imagen principal para compatibilidad.
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS imagenes_url text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.productos.imagenes_url IS
  'URLs públicas de las imágenes del producto, en el orden de presentación.';
