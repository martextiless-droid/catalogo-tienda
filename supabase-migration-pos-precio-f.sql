-- Agrega la categoría de precios F al POS.
-- Ejecutar una vez en Supabase SQL Editor después de la migración base del POS.
BEGIN;

ALTER TABLE public.pos_producto_precios_clase
  DROP CONSTRAINT IF EXISTS pos_producto_precios_clase_nivel_check;
ALTER TABLE public.pos_producto_precios_clase
  ADD CONSTRAINT pos_producto_precios_clase_nivel_check
  CHECK (nivel IN ('A','B','C','D','E','F'));

ALTER TABLE public.pos_clientes
  DROP CONSTRAINT IF EXISTS pos_clientes_nivel_precio_check;
ALTER TABLE public.pos_clientes
  ADD CONSTRAINT pos_clientes_nivel_precio_check
  CHECK (nivel_precio IS NULL OR nivel_precio IN ('A','B','C','D','E','F'));

ALTER TABLE public.pos_cotizaciones
  DROP CONSTRAINT IF EXISTS pos_cotizaciones_nivel_precio_check;
ALTER TABLE public.pos_cotizaciones
  ADD CONSTRAINT pos_cotizaciones_nivel_precio_check
  CHECK (nivel_precio IS NULL OR nivel_precio IN ('A','B','C','D','E','F'));

ALTER TABLE public.pos_ventas
  DROP CONSTRAINT IF EXISTS pos_ventas_nivel_precio_check;
ALTER TABLE public.pos_ventas
  ADD CONSTRAINT pos_ventas_nivel_precio_check
  CHECK (nivel_precio IS NULL OR nivel_precio IN ('A','B','C','D','E','F'));

-- Extiende las validaciones y los recorridos de niveles existentes en las RPC del POS.
DO $$
DECLARE
  v_function record;
  v_definition text;
  v_updated text;
  v_updated_names text[] := ARRAY[]::text[];
  v_required_name text;
  v_required text[] := ARRAY[
    'pos_crear_referencia_con_variantes',
    'pos_actualizar_referencia',
    'pos_registrar_venta',
    'pos_importar_precios_clase',
    'pos_actualizar_cliente'
  ];
BEGIN
  FOR v_function IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(ARRAY[
        'pos_crear_referencia',
        'pos_crear_referencia_con_variantes',
        'pos_actualizar_referencia',
        'pos_registrar_venta',
        'pos_importar_precios_clase',
        'pos_registrar_venta_detallada',
        'pos_actualizar_cliente'
      ])
  LOOP
    v_definition := pg_get_functiondef(v_function.oid);
    v_updated := replace(
      v_definition,
      '''A'',''B'',''C'',''D'',''E''',
      '''A'',''B'',''C'',''D'',''E'',''F'''
    );
    v_updated := replace(v_updated, 'A, B, C, D o E', 'A, B, C, D, E o F');
    v_updated := replace(v_updated, 'precios A–E', 'precios A–F');

    IF v_updated <> v_definition THEN
      EXECUTE v_updated;
      v_updated_names := array_append(v_updated_names, v_function.proname);
    END IF;
  END LOOP;

  FOREACH v_required_name IN ARRAY v_required LOOP
    IF NOT (v_required_name = ANY(v_updated_names)) THEN
      RAISE EXCEPTION 'No se encontró una función POS compatible para actualizar: %', v_required_name;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
