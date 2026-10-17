-- Protege los créditos restaurados al anular ventas y recupera los que se anularon como si fueran abonos nuevos.
BEGIN;

CREATE OR REPLACE FUNCTION public.pos_anular_abono(p_movimiento_id bigint,p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_abono public.pos_movimientos_cuenta_cliente%ROWTYPE; v_saldo numeric(14,2); v_caja_id bigint; v_esperado numeric(14,2);
BEGIN
  IF auth.uid() IS DISTINCT FROM 'c1fd6ad7-15be-42a6-b239-0564bb34cba5'::uuid THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT * INTO v_abono FROM public.pos_movimientos_cuenta_cliente WHERE id=p_movimiento_id AND tipo='abono' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró el abono que intentas anular'; END IF;
  IF COALESCE(v_abono.nota,'') LIKE 'Saldo a favor restaurado por anulación de %' THEN
    RAISE EXCEPTION 'Este saldo fue restaurado al anular una venta; no lo anules como si fuera un abono nuevo';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pos_movimientos_cuenta_cliente WHERE movimiento_reversado_id=v_abono.id) THEN RAISE EXCEPTION 'Este abono ya fue anulado'; END IF;
  SELECT COALESCE(sum(CASE WHEN tipo='abono' THEN monto WHEN tipo IN ('uso_abono','anulacion_abono') THEN -monto ELSE 0 END),0)
  INTO v_saldo FROM public.pos_movimientos_cuenta_cliente WHERE cliente_id=v_abono.cliente_id;
  IF v_saldo<v_abono.monto THEN RAISE EXCEPTION 'No se puede anular: el cliente ya aplicó parte de este saldo. Registra una devolución o reverso de la aplicación primero'; END IF;
  IF v_abono.medio='efectivo' THEN
    SELECT id,saldo_inicial INTO v_caja_id,v_esperado FROM public.pos_cajas WHERE estado='abierta' ORDER BY id DESC LIMIT 1 FOR UPDATE;
    IF v_caja_id IS NULL THEN RAISE EXCEPTION 'Abre una caja para registrar la devolución del abono en efectivo'; END IF;
    SELECT v_esperado+COALESCE(sum(CASE WHEN direccion='ingreso' THEN monto ELSE -monto END),0)
    INTO v_esperado FROM public.pos_movimientos_caja WHERE caja_id=v_caja_id AND tipo<>'apertura';
    IF v_esperado<v_abono.monto THEN RAISE EXCEPTION 'No hay efectivo suficiente en caja para devolver este abono'; END IF;
    INSERT INTO public.pos_movimientos_caja(caja_id,tipo,direccion,monto,nota)
    VALUES(v_caja_id,'anulacion_abono','egreso',v_abono.monto,'Anulación abono #'||v_abono.id||COALESCE(': '||NULLIF(btrim(p_motivo),''),''));
  END IF;
  INSERT INTO public.pos_movimientos_cuenta_cliente(cliente_id,tipo,monto,medio,banco,referencia_pago,venta_id,nota,movimiento_reversado_id)
  VALUES(v_abono.cliente_id,'anulacion_abono',v_abono.monto,v_abono.medio,v_abono.banco,v_abono.referencia_pago,v_abono.venta_id,
         COALESCE(NULLIF(btrim(p_motivo),''),'Abono anulado')||' (abono #'||v_abono.id||')',v_abono.id);
  RETURN public.pos_obtener_cuenta_cliente((SELECT documento FROM public.pos_clientes WHERE id=v_abono.cliente_id),(SELECT telefono FROM public.pos_clientes WHERE id=v_abono.cliente_id));
END $$;

REVOKE ALL ON FUNCTION public.pos_anular_abono(bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_anular_abono(bigint,text) TO authenticated;

-- Repone únicamente el crédito que se restauró al anular una venta y luego fue anulado por error.
WITH restauraciones AS (
  SELECT m.id,m.venta_id,m.cliente_id,m.monto
  FROM public.pos_movimientos_cuenta_cliente m
  WHERE m.tipo='abono' AND m.venta_id IS NOT NULL
    AND m.nota LIKE 'Saldo a favor restaurado por anulación de %'
), pagos AS (
  SELECT venta_id,COALESCE(sum(valor) FILTER(WHERE medio='saldo_favor'),0)::numeric(14,2) AS aplicado
  FROM public.pos_pagos GROUP BY venta_id
), restaurado AS (
  SELECT venta_id,cliente_id,sum(monto)::numeric(14,2) AS monto
  FROM restauraciones GROUP BY venta_id,cliente_id
), restaurado_anulado AS (
  SELECT r.venta_id,r.cliente_id,sum(a.monto)::numeric(14,2) AS monto
  FROM restauraciones r
  JOIN public.pos_movimientos_cuenta_cliente a ON a.tipo='anulacion_abono' AND a.movimiento_reversado_id=r.id
  GROUP BY r.venta_id,r.cliente_id
), conciliado AS (
  SELECT v.id AS venta_id,v.cliente_id,p.aplicado,COALESCE(r.monto,0)::numeric(14,2) AS restaurado,
         COALESCE(a.monto,0)::numeric(14,2) AS restaurado_anulado
  FROM public.pos_ventas v
  JOIN pagos p ON p.venta_id=v.id
  LEFT JOIN restaurado r ON r.venta_id=v.id AND r.cliente_id=v.cliente_id
  LEFT JOIN restaurado_anulado a ON a.venta_id=v.id AND a.cliente_id=v.cliente_id
  WHERE v.estado='anulada' AND v.cliente_id IS NOT NULL
)
INSERT INTO public.pos_movimientos_cuenta_cliente(cliente_id,tipo,monto,medio,venta_id,nota,registrado_por)
SELECT cliente_id,'abono',aplicado-restaurado+restaurado_anulado,'otro',venta_id,
       'Saldo a favor restaurado por anulación de venta '||venta_id||' (conciliación de reverso)',
       'c1fd6ad7-15be-42a6-b239-0564bb34cba5'::uuid
FROM conciliado
WHERE aplicado>restaurado-restaurado_anulado;

COMMIT;
