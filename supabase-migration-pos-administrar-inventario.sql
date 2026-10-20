-- Actualización controlada de referencias, conteos físicos y retiro con historial.
BEGIN;

CREATE OR REPLACE FUNCTION public.pos_actualizar_referencia(
  p_producto_id bigint,
  p_nombre text,
  p_categoria text,
  p_codigo_barras text,
  p_costo numeric,
  p_precios jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_nivel text; v_precio numeric;
BEGIN
  IF auth.uid() IS DISTINCT FROM 'c1fd6ad7-15be-42a6-b239-0564bb34cba5'::uuid THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF NULLIF(btrim(p_nombre),'') IS NULL THEN RAISE EXCEPTION 'El nombre es obligatorio'; END IF;
  IF p_categoria IS NULL OR p_categoria NOT IN ('pijamas','Niños','Niñas','Joggers','Basicas') THEN RAISE EXCEPTION 'Selecciona una categoría válida'; END IF;
  IF p_costo IS NULL OR p_costo<0 OR jsonb_typeof(p_precios)<>'object' THEN RAISE EXCEPTION 'Revisa el costo y los precios A–E'; END IF;
  PERFORM 1 FROM public.productos WHERE id=p_producto_id AND coalesce(eliminado,false)=false FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La referencia ya no existe o fue retirada'; END IF;
  IF NULLIF(btrim(p_codigo_barras),'') IS NOT NULL AND EXISTS(SELECT 1 FROM public.pos_producto_config WHERE btrim(codigo_barras)=btrim(p_codigo_barras) AND producto_id<>p_producto_id) THEN RAISE EXCEPTION 'Ese código de barras ya está asignado'; END IF;
  UPDATE public.productos SET nombre=btrim(p_nombre),categoria=p_categoria WHERE id=p_producto_id;
  INSERT INTO public.pos_producto_config(producto_id,codigo_barras,costo_unitario,actualizado_en)
  VALUES(p_producto_id,NULLIF(btrim(p_codigo_barras),''),p_costo,now())
  ON CONFLICT(producto_id) DO UPDATE SET codigo_barras=EXCLUDED.codigo_barras,costo_unitario=EXCLUDED.costo_unitario,actualizado_en=now();
  FOREACH v_nivel IN ARRAY ARRAY['A','B','C','D','E'] LOOP
    v_precio:=NULLIF(p_precios->>v_nivel,'')::numeric;
    IF v_precio IS NULL OR v_precio<0 THEN RAISE EXCEPTION 'El precio de categoría % no es válido',v_nivel; END IF;
    INSERT INTO public.pos_producto_precios_clase(producto_id,nivel,precio_unitario,actualizado_en)
    VALUES(p_producto_id,v_nivel,v_precio,now())
    ON CONFLICT(producto_id,nivel) DO UPDATE SET precio_unitario=EXCLUDED.precio_unitario,actualizado_en=now();
  END LOOP;
  RETURN jsonb_build_object('producto_id',p_producto_id,'actualizado',true);
END $$;

CREATE OR REPLACE FUNCTION public.pos_ajustar_inventario(p_producto_id bigint,p_existencia_contada integer,p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_referencia text; v_actual integer; v_diferencia integer; v_motivo text;
BEGIN
  IF auth.uid() IS DISTINCT FROM 'c1fd6ad7-15be-42a6-b239-0564bb34cba5'::uuid THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_existencia_contada IS NULL OR p_existencia_contada<0 THEN RAISE EXCEPTION 'La existencia contada no puede ser negativa'; END IF;
  v_motivo:=NULLIF(btrim(p_motivo),''); IF v_motivo IS NULL THEN RAISE EXCEPTION 'Escribe el motivo del ajuste'; END IF;
  SELECT referencia INTO v_referencia FROM public.productos WHERE id=p_producto_id AND coalesce(eliminado,false)=false FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La referencia ya no existe o fue retirada'; END IF;
  SELECT coalesce(sum(cantidad),0)::integer INTO v_actual FROM public.pos_movimientos_inventario WHERE producto_id=p_producto_id;
  v_diferencia:=p_existencia_contada-v_actual;
  IF v_diferencia<>0 THEN
    INSERT INTO public.pos_movimientos_inventario(producto_id,tipo,cantidad,nota)
    VALUES(p_producto_id,'ajuste',v_diferencia,v_motivo);
  END IF;
  RETURN jsonb_build_object('referencia',v_referencia,'existencia_anterior',v_actual,'existencia',p_existencia_contada,'diferencia',v_diferencia,'motivo',v_motivo);
END $$;

CREATE OR REPLACE FUNCTION public.pos_retirar_referencia(p_producto_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_referencia text; v_existencia integer;
BEGIN
  IF auth.uid() IS DISTINCT FROM 'c1fd6ad7-15be-42a6-b239-0564bb34cba5'::uuid THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT referencia INTO v_referencia FROM public.productos WHERE id=p_producto_id AND coalesce(eliminado,false)=false FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La referencia ya fue retirada o no existe'; END IF;
  SELECT coalesce(sum(cantidad),0)::integer INTO v_existencia FROM public.pos_movimientos_inventario WHERE producto_id=p_producto_id;
  IF v_existencia<>0 THEN RAISE EXCEPTION 'La referencia aún tiene % unidades. Ajusta el inventario a cero antes de retirarla.',v_existencia; END IF;
  UPDATE public.productos SET eliminado=true WHERE id=p_producto_id;
  RETURN jsonb_build_object('producto_id',p_producto_id,'referencia',v_referencia,'retirada',true);
END $$;

REVOKE ALL ON FUNCTION public.pos_actualizar_referencia(bigint,text,text,text,numeric,jsonb), public.pos_ajustar_inventario(bigint,integer,text), public.pos_retirar_referencia(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_actualizar_referencia(bigint,text,text,text,numeric,jsonb), public.pos_ajustar_inventario(bigint,integer,text), public.pos_retirar_referencia(bigint) TO authenticated;
COMMIT;
