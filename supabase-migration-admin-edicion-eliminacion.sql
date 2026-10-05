-- Habilita cambios y eliminación solo al usuario administrador autorizado.
-- Los precios se eliminan en cascada al borrar su producto relacionado.
BEGIN;

REVOKE UPDATE, DELETE ON TABLE public.productos
  FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE ON TABLE public.precios
  FROM PUBLIC, anon, authenticated;

GRANT UPDATE, DELETE ON TABLE public.productos TO authenticated;
GRANT UPDATE ON TABLE public.precios TO authenticated;

DROP POLICY IF EXISTS "Admin autorizado puede actualizar productos" ON public.productos;
CREATE POLICY "Admin autorizado puede actualizar productos"
  ON public.productos
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = 'c1fd6ad7-15be-42a6-b239-0564bb34cba5'::uuid)
  WITH CHECK ((SELECT auth.uid()) = 'c1fd6ad7-15be-42a6-b239-0564bb34cba5'::uuid);

DROP POLICY IF EXISTS "Admin autorizado puede eliminar productos" ON public.productos;
CREATE POLICY "Admin autorizado puede eliminar productos"
  ON public.productos
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = 'c1fd6ad7-15be-42a6-b239-0564bb34cba5'::uuid);

DROP POLICY IF EXISTS "Admin autorizado puede actualizar precios" ON public.precios;
CREATE POLICY "Admin autorizado puede actualizar precios"
  ON public.precios
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = 'c1fd6ad7-15be-42a6-b239-0564bb34cba5'::uuid)
  WITH CHECK ((SELECT auth.uid()) = 'c1fd6ad7-15be-42a6-b239-0564bb34cba5'::uuid);

REVOKE DELETE ON TABLE storage.objects FROM PUBLIC, anon, authenticated;
GRANT DELETE ON TABLE storage.objects TO authenticated;

DROP POLICY IF EXISTS "Admin autorizado puede consultar imágenes de productos" ON storage.objects;
CREATE POLICY "Admin autorizado puede consultar imágenes de productos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'productos'
    AND (
      (storage.foldername(name))[1] IS NULL
      OR (storage.foldername(name))[1] = 'productos'
    )
    AND (SELECT auth.uid()) = 'c1fd6ad7-15be-42a6-b239-0564bb34cba5'::uuid
  );

DROP POLICY IF EXISTS "Admin autorizado puede eliminar imágenes de productos" ON storage.objects;
CREATE POLICY "Admin autorizado puede eliminar imágenes de productos"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'productos'
    AND (
      (storage.foldername(name))[1] IS NULL
      OR (storage.foldername(name))[1] = 'productos'
    )
    AND (SELECT auth.uid()) = 'c1fd6ad7-15be-42a6-b239-0564bb34cba5'::uuid
  );

COMMIT;
