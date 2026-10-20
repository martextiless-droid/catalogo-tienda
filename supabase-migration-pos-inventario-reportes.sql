-- Alta de referencias desde Inventario y datos agregados para reportes gerenciales.
BEGIN;

CREATE OR REPLACE FUNCTION public.pos_crear_referencia(
  p_referencia text,
  p_nombre text,
  p_categoria text,
  p_costo numeric,
  p_cantidad_inicial integer,
  p_codigo_barras text,
  p_precios jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_producto_id bigint; v_nivel text; v_precio numeric;
BEGIN
  IF auth.uid() IS DISTINCT FROM 'c1fd6ad7-15be-42a6-b239-0564bb34cba5'::uuid THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF NULLIF(btrim(p_referencia),'') IS NULL OR NULLIF(btrim(p_nombre),'') IS NULL THEN RAISE EXCEPTION 'La referencia y el nombre son obligatorios'; END IF;
  IF p_categoria IS NULL OR p_categoria NOT IN ('pijamas','Niños','Niñas','Joggers','Basicas') THEN RAISE EXCEPTION 'Selecciona una categoría válida'; END IF;
  IF p_costo IS NULL OR p_costo<0 OR p_cantidad_inicial IS NULL OR p_cantidad_inicial<0 THEN RAISE EXCEPTION 'Revisa el costo y la cantidad inicial'; END IF;
  IF jsonb_typeof(p_precios)<>'object' THEN RAISE EXCEPTION 'Ingresa los precios de A a E'; END IF;
  IF EXISTS(SELECT 1 FROM public.productos WHERE lower(btrim(referencia::text))=lower(btrim(p_referencia))) THEN RAISE EXCEPTION 'Ya existe una referencia con ese código'; END IF;
  IF NULLIF(btrim(p_codigo_barras),'') IS NOT NULL AND EXISTS(SELECT 1 FROM public.pos_producto_config WHERE btrim(codigo_barras)=btrim(p_codigo_barras)) THEN RAISE EXCEPTION 'Ese código de barras ya está asignado'; END IF;
  INSERT INTO public.productos(referencia,nombre,categoria,subcategoria,descripcion,imagen_url,imagenes_url,publicado,eliminado)
  VALUES(btrim(p_referencia),btrim(p_nombre),p_categoria,NULL,NULL,NULL,'{}'::text[],false,false) RETURNING id INTO v_producto_id;
  INSERT INTO public.pos_producto_config(producto_id,codigo_barras,costo_unitario)
  VALUES(v_producto_id,NULLIF(btrim(p_codigo_barras),''),p_costo);
  FOREACH v_nivel IN ARRAY ARRAY['A','B','C','D','E'] LOOP
    v_precio:=NULLIF(p_precios->>v_nivel,'')::numeric;
    IF v_precio IS NULL OR v_precio<0 THEN RAISE EXCEPTION 'El precio de categoría % no es válido',v_nivel; END IF;
    INSERT INTO public.pos_producto_precios_clase(producto_id,nivel,precio_unitario) VALUES(v_producto_id,v_nivel,v_precio);
  END LOOP;
  IF p_cantidad_inicial>0 THEN
    INSERT INTO public.pos_movimientos_inventario(producto_id,tipo,cantidad,nota)
    VALUES(v_producto_id,'entrada',p_cantidad_inicial,'Inventario inicial al crear la referencia');
  END IF;
  RETURN jsonb_build_object('producto_id',v_producto_id,'referencia',btrim(p_referencia),'existencia',p_cantidad_inicial);
END $$;

CREATE OR REPLACE FUNCTION public.pos_reporte_ventas(p_desde date,p_hasta date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS DISTINCT FROM 'c1fd6ad7-15be-42a6-b239-0564bb34cba5'::uuid THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta<p_desde OR p_hasta-p_desde>730 THEN RAISE EXCEPTION 'Selecciona un periodo válido de hasta dos años'; END IF;
  WITH ventas AS (
    SELECT v.* FROM public.pos_ventas v
    WHERE v.creada_en>=(p_desde::timestamp AT TIME ZONE 'America/Bogota') AND v.creada_en<((p_hasta+1)::timestamp AT TIME ZONE 'America/Bogota')
  ), devoluciones AS (
    SELECT d.venta_id,sum(d.valor)::numeric(14,2) valor
    FROM public.pos_devoluciones d JOIN ventas v ON v.id=d.venta_id
    GROUP BY d.venta_id
  ), dev_items AS (
    SELECT di.venta_item_id,sum(di.cantidad)::integer cantidad,
      sum(di.cantidad) FILTER(WHERE di.reintegrar_inventario)::integer cantidad_reintegrada,
      sum(di.valor_linea)::numeric(14,2) valor
    FROM public.pos_devolucion_items di JOIN public.pos_devoluciones d ON d.id=di.devolucion_id JOIN ventas v ON v.id=d.venta_id
    GROUP BY di.venta_item_id
  ), lineas AS (
    SELECT vi.id,vi.producto_id,vi.referencia,vi.nombre,vi.cantidad,vi.precio_unitario,vi.costo_unitario,
      CASE WHEN v.estado='anulada' THEN 0 ELSE greatest(vi.cantidad-coalesce(di.cantidad,0),0) END::integer unidades_net,
      CASE WHEN v.estado='anulada' THEN 0 ELSE vi.cantidad*vi.precio_unitario-coalesce(di.valor,0) END::numeric(14,2) venta_neta,
      CASE WHEN v.estado='anulada' THEN 0 ELSE greatest(vi.cantidad-coalesce(di.cantidad_reintegrada,0),0)*vi.costo_unitario END::numeric(14,2) costo_neto,
      v.id venta_id,v.estado,v.cliente_nombre,v.creada_en
    FROM public.pos_venta_items vi JOIN ventas v ON v.id=vi.venta_id LEFT JOIN dev_items di ON di.venta_item_id=vi.id
  ), refs AS (
    SELECT l.producto_id,l.referencia,l.nombre,max(p.categoria) categoria,
      sum(CASE WHEN l.estado='anulada' THEN 0 ELSE l.cantidad END)::integer unidades_vendidas,
      sum(l.unidades_net)::integer unidades_net,
      sum(CASE WHEN l.estado='anulada' THEN 0 ELSE l.cantidad*l.precio_unitario END)::numeric(14,2) venta_bruta,
      sum(CASE WHEN l.estado='anulada' THEN 0 ELSE l.cantidad*l.precio_unitario-l.venta_neta END)::numeric(14,2) devoluciones,
      sum(l.venta_neta)::numeric(14,2) venta_neta,sum(l.costo_neto)::numeric(14,2) costo,
      (sum(l.venta_neta)-sum(l.costo_neto))::numeric(14,2) utilidad_bruta
    FROM lineas l LEFT JOIN public.productos p ON p.id=l.producto_id
    GROUP BY l.producto_id,l.referencia,l.nombre
  ), totals AS (
    SELECT count(*) FILTER(WHERE estado<>'anulada')::integer ventas,
      count(*) FILTER(WHERE estado='anulada')::integer anuladas,
      count(*) FILTER(WHERE estado='devuelta_parcial')::integer ventas_con_devolucion_parcial,
      coalesce(sum(total) FILTER(WHERE estado<>'anulada'),0)::numeric(14,2) venta_bruta,
      coalesce(sum(coalesce(d.valor,0)) FILTER(WHERE estado<>'anulada'),0)::numeric(14,2) devoluciones,
      coalesce(sum(total-coalesce(d.valor,0)) FILTER(WHERE estado<>'anulada'),0)::numeric(14,2) venta_neta
    FROM ventas v LEFT JOIN devoluciones d ON d.venta_id=v.id
  ), product_totals AS (
    SELECT coalesce(sum(unidades_vendidas),0)::integer unidades_vendidas,
      coalesce(sum(unidades_net),0)::integer unidades_net,
      coalesce(sum(costo),0)::numeric(14,2) costo,
      coalesce(sum(utilidad_bruta),0)::numeric(14,2) utilidad
    FROM refs
  ), pagos AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('medio',medio,'total',total,'transacciones',transacciones) ORDER BY total DESC),'[]'::jsonb) detalle
    FROM (SELECT coalesce(p.medio,'sin registro') medio,sum(p.valor)::numeric(14,2) total,count(*)::integer transacciones
      FROM public.pos_pagos p JOIN ventas v ON v.id=p.venta_id WHERE v.estado<>'anulada' GROUP BY p.medio) q
  ), top_clientes AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('cliente',cliente,'documento',documento,'ventas',ventas,'total',total) ORDER BY total DESC),'[]'::jsonb) detalle
    FROM (SELECT coalesce(v.cliente_nombre,'Sin nombre') cliente,v.cliente_documento documento,count(*)::integer ventas,sum(v.total-coalesce(d.valor,0))::numeric(14,2) total
      FROM ventas v LEFT JOIN devoluciones d ON d.venta_id=v.id WHERE v.estado<>'anulada' GROUP BY v.cliente_nombre,v.cliente_documento ORDER BY total DESC LIMIT 20) q
  ), por_dia AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('fecha',g.dia,'ventas',coalesce(x.ventas,0),'venta_neta',coalesce(x.total,0),'unidades',coalesce(x.unidades,0)) ORDER BY g.dia),'[]'::jsonb) detalle
    FROM generate_series(p_desde::timestamp,p_hasta::timestamp,interval '1 day') g(dia)
    LEFT JOIN (SELECT (v.creada_en AT TIME ZONE 'America/Bogota')::date dia,count(*)::integer ventas,sum(v.total-coalesce(d.valor,0))::numeric(14,2) total,
      coalesce(sum(l.unidades_net),0)::integer unidades FROM ventas v LEFT JOIN devoluciones d ON d.venta_id=v.id
      LEFT JOIN (SELECT venta_id,sum(unidades_net)::integer unidades_net FROM lineas GROUP BY venta_id) l ON l.venta_id=v.id
      WHERE v.estado<>'anulada' GROUP BY (v.creada_en AT TIME ZONE 'America/Bogota')::date) x ON x.dia=g.dia::date
  ), inventario AS (
    SELECT coalesce(sum(s.cantidad),0)::integer unidades,coalesce(sum(s.cantidad*coalesce(c.costo_unitario,0)),0)::numeric(14,2) valor
    FROM (SELECT m.producto_id,sum(m.cantidad)::integer cantidad FROM public.pos_movimientos_inventario m GROUP BY m.producto_id) s
    JOIN public.productos p ON p.id=s.producto_id AND coalesce(p.eliminado,false)=false
    LEFT JOIN public.pos_producto_config c ON c.producto_id=p.id
  ), no_vendidos AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('referencia',p.referencia,'nombre',p.nombre,'categoria',p.categoria,'existencia',coalesce(s.unidades,0)) ORDER BY p.referencia),'[]'::jsonb) detalle
    FROM public.productos p LEFT JOIN refs r ON r.producto_id=p.id
    LEFT JOIN (SELECT producto_id,sum(cantidad)::integer unidades FROM public.pos_movimientos_inventario GROUP BY producto_id) s ON s.producto_id=p.id
    WHERE coalesce(p.eliminado,false)=false AND coalesce(r.unidades_net,0)=0
  )
  SELECT jsonb_build_object(
    'desde',p_desde,'hasta',p_hasta,'ventas',t.ventas,'anuladas',t.anuladas,'ventas_con_devolucion_parcial',t.ventas_con_devolucion_parcial,
    'venta_bruta',t.venta_bruta,'devoluciones',t.devoluciones,'venta_neta',t.venta_neta,
    'unidades_vendidas',pt.unidades_vendidas,'unidades_net',pt.unidades_net,'costo_mercancia',pt.costo,'utilidad_bruta',pt.utilidad,
    'margen_porcentaje',CASE WHEN t.venta_neta>0 THEN round(pt.utilidad/t.venta_neta*100,2) ELSE 0 END,
    'ticket_promedio',CASE WHEN t.ventas>0 THEN round(t.venta_neta/t.ventas,2) ELSE 0 END,
    'referencias',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.unidades_net DESC,r.utilidad_bruta DESC) FROM refs r),'[]'::jsonb),
    'clientes',tc.detalle,'medios_pago',pa.detalle,'por_dia',pd.detalle,'sin_ventas',nv.detalle,
    'inventario_actual',jsonb_build_object('unidades',i.unidades,'valor_costo',i.valor)
  ) INTO v_result FROM totals t CROSS JOIN product_totals pt CROSS JOIN top_clientes tc CROSS JOIN pagos pa CROSS JOIN por_dia pd CROSS JOIN no_vendidos nv CROSS JOIN inventario i;
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.pos_crear_referencia(text,text,text,numeric,integer,text,jsonb), public.pos_reporte_ventas(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_crear_referencia(text,text,text,numeric,integer,text,jsonb), public.pos_reporte_ventas(date,date) TO authenticated;
COMMIT;
