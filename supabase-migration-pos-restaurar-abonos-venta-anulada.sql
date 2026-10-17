-- Al anular una venta, devuelve al saldo del cliente el saldo a favor aplicado.
-- También concilia anulaciones anteriores que no alcanzaron a restaurarlo.
BEGIN;

CREATE OR REPLACE FUNCTION public.pos_anular_venta(
  p_venta_id bigint,
  p_motivo text,
  p_nota text DEFAULT NULL,
  p_reintegrar_inventario boolean DEFAULT true,
  p_reembolsar_efectivo boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_estado text;
  v_numero text;
  v_cliente_id bigint;
  v_efectivo numeric(14,2):=0;
  v_saldo_favor numeric(14,2):=0;
  v_caja_id bigint;
BEGIN
  IF auth.uid() IS DISTINCT FROM 'c1fd6ad7-15be-42a6-b239-0564bb34cba5'::uuid THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF NULLIF(btrim(p_motivo),'') IS NULL THEN
    RAISE EXCEPTION 'Selecciona el motivo de anulación';
  END IF;

  SELECT estado,numero,cliente_id INTO v_estado,v_numero,v_cliente_id
  FROM public.pos_ventas WHERE id=p_venta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada'; END IF;
  IF v_estado<>'completada' THEN
    RAISE EXCEPTION 'Solo se pueden anular ventas completadas sin devoluciones parciales';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pos_devoluciones WHERE venta_id=p_venta_id) THEN
    RAISE EXCEPTION 'Esta venta ya tiene devoluciones; no se puede anular completa';
  END IF;

  SELECT COALESCE(sum(valor) FILTER(WHERE medio='efectivo'),0),
         COALESCE(sum(valor) FILTER(WHERE medio='saldo_favor'),0)
  INTO v_efectivo,v_saldo_favor FROM public.pos_pagos WHERE venta_id=p_venta_id;

  IF p_reembolsar_efectivo THEN
    IF v_efectivo<=0 THEN RAISE EXCEPTION 'Esta venta no tiene pagos en efectivo para reembolsar'; END IF;
    SELECT id INTO v_caja_id FROM public.pos_cajas WHERE estado='abierta' ORDER BY id DESC LIMIT 1 FOR UPDATE;
    IF v_caja_id IS NULL THEN RAISE EXCEPTION 'Abre la caja para registrar el reembolso en efectivo'; END IF;
    IF v_efectivo>(SELECT saldo_inicial+COALESCE(sum(CASE WHEN direccion='ingreso' THEN monto ELSE -monto END),0) FROM public.pos_movimientos_caja WHERE caja_id=v_caja_id AND tipo<>'apertura') THEN
      RAISE EXCEPTION 'No hay efectivo suficiente en caja para registrar el reembolso';
    END IF;
    INSERT INTO public.pos_movimientos_caja(caja_id,tipo,direccion,monto,venta_id,nota)
    VALUES(v_caja_id,'retiro','egreso',v_efectivo,p_venta_id,'Reembolso por anulación de '||COALESCE(v_numero,p_venta_id::text));
  END IF;

  IF p_reintegrar_inventario THEN
    PERFORM 1 FROM public.productos p
    JOIN public.pos_venta_items vi ON vi.producto_id=p.id
    WHERE vi.venta_id=p_venta_id ORDER BY p.id FOR UPDATE OF p;
    INSERT INTO public.pos_movimientos_inventario(producto_id,tipo,cantidad,venta_id,nota)
    SELECT producto_id,'ajuste',cantidad,p_venta_id,'Reintegro por anulación de '||COALESCE(v_numero,p_venta_id::text)
    FROM public.pos_venta_items WHERE venta_id=p_venta_id;
  END IF;

  IF v_saldo_favor>0 AND v_cliente_id IS NOT NULL THEN
    INSERT INTO public.pos_movimientos_cuenta_cliente(cliente_id,tipo,monto,medio,venta_id,nota)
    VALUES(v_cliente_id,'abono',v_saldo_favor,'otro',p_venta_id,'Saldo a favor restaurado por anulación de '||COALESCE(v_numero,p_venta_id::text));
  END IF;

  UPDATE public.pos_ventas SET
    estado='anulada',anulada_en=now(),motivo_anulacion=btrim(p_motivo),nota_anulacion=NULLIF(btrim(p_nota),''),
    inventario_reintegrado=COALESCE(p_reintegrar_inventario,true),efectivo_reembolsado=CASE WHEN p_reembolsar_efectivo THEN v_efectivo ELSE 0 END
  WHERE id=p_venta_id;

  RETURN jsonb_build_object('id',p_venta_id,'numero',v_numero,'estado','anulada','inventario_reintegrado',COALESCE(p_reintegrar_inventario,true),'efectivo_reembolsado',CASE WHEN p_reembolsar_efectivo THEN v_efectivo ELSE 0 END,'saldo_favor_restaurado',v_saldo_favor);
END $$;

REVOKE ALL ON FUNCTION public.pos_anular_venta(bigint,text,text,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_anular_venta(bigint,text,text,boolean,boolean) TO authenticated;

-- Reparación idempotente: inserta solo la diferencia aún no restaurada.
WITH pagos AS (
  SELECT venta_id,COALESCE(sum(valor) FILTER(WHERE medio='saldo_favor'),0)::numeric(14,2) AS aplicado
  FROM public.pos_pagos GROUP BY venta_id
), restaurado AS (
  SELECT venta_id,COALESCE(sum(monto),0)::numeric(14,2) AS monto
  FROM public.pos_movimientos_cuenta_cliente
  WHERE tipo='abono' AND venta_id IS NOT NULL
    AND nota LIKE 'Saldo a favor restaurado por anulación de %'
  GROUP BY venta_id
)
INSERT INTO public.pos_movimientos_cuenta_cliente(cliente_id,tipo,monto,medio,venta_id,nota)
SELECT v.cliente_id,'abono',p.aplicado-COALESCE(r.monto,0),'otro',v.id,
       'Saldo a favor restaurado por anulación de '||COALESCE(v.numero,v.id::text)||' (conciliación)'
FROM public.pos_ventas v
JOIN pagos p ON p.venta_id=v.id
LEFT JOIN restaurado r ON r.venta_id=v.id
WHERE v.estado='anulada' AND v.cliente_id IS NOT NULL
  AND p.aplicado>COALESCE(r.monto,0);

COMMIT;
