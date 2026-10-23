-- Permite al administrador corregir la ficha guardada de clientes.
-- Ejecutar una vez en Supabase SQL Editor después de las migraciones de clientes del POS.
BEGIN;

CREATE OR REPLACE FUNCTION public.pos_actualizar_cliente(
  p_cliente_id bigint,
  p_nombre text,
  p_documento text DEFAULT NULL,
  p_telefono text DEFAULT NULL,
  p_ciudad text DEFAULT NULL,
  p_barrio text DEFAULT NULL,
  p_direccion text DEFAULT NULL,
  p_nivel_precio text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_documento text;
BEGIN
  IF auth.uid() IS DISTINCT FROM 'c1fd6ad7-15be-42a6-b239-0564bb34cba5'::uuid THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF p_cliente_id IS NULL OR NULLIF(btrim(p_nombre),'') IS NULL THEN
    RAISE EXCEPTION 'Selecciona el cliente y escribe su nombre';
  END IF;
  IF p_nivel_precio IS NOT NULL AND p_nivel_precio NOT IN ('A','B','C','D','E') THEN
    RAISE EXCEPTION 'La categoría de precio debe ser A, B, C, D o E';
  END IF;

  v_documento:=NULLIF(regexp_replace(COALESCE(p_documento,''),'[^0-9]','','g'),'');
  IF v_documento IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pos_clientes c
    WHERE c.id<>p_cliente_id
      AND regexp_replace(COALESCE(c.documento,''),'[^0-9]','','g')=v_documento
  ) THEN
    RAISE EXCEPTION 'Ese documento ya está registrado en otro cliente';
  END IF;

  UPDATE public.pos_clientes
  SET nombre=btrim(p_nombre),
      documento=v_documento,
      telefono=NULLIF(btrim(p_telefono),''),
      ciudad=NULLIF(btrim(p_ciudad),''),
      barrio=NULLIF(btrim(p_barrio),''),
      direccion=NULLIF(btrim(p_direccion),''),
      nivel_precio=p_nivel_precio,
      actualizado_en=now()
  WHERE id=p_cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró el cliente'; END IF;

  RETURN jsonb_build_object('cliente_id',p_cliente_id,'actualizado',true);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_actualizar_cliente(bigint,text,text,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_actualizar_cliente(bigint,text,text,text,text,text,text,text) TO authenticated;

COMMIT;
