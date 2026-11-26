-- Permite corregir datos de un gasto sin perder el movimiento de caja asociado.
BEGIN;

CREATE OR REPLACE FUNCTION public.pos_actualizar_gasto(
  p_id bigint,
  p_fecha date,
  p_categoria text,
  p_concepto text,
  p_monto numeric,
  p_tercero text DEFAULT NULL,
  p_documento_tercero text DEFAULT NULL,
  p_numero_soporte text DEFAULT NULL,
  p_banco text DEFAULT NULL,
  p_referencia_pago text DEFAULT NULL,
  p_nota text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_gasto public.pos_gastos%ROWTYPE;
BEGIN
  IF auth.uid() IS DISTINCT FROM 'c1fd6ad7-15be-42a6-b239-0564bb34cba5'::uuid THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF p_fecha IS NULL OR p_categoria NOT IN ('arriendo','nomina','servicios','transporte','empaques','comisiones','impuestos','mantenimiento','compras_menores','otro') THEN
    RAISE EXCEPTION 'Revisa la fecha y la categoría del gasto';
  END IF;
  IF NULLIF(btrim(p_concepto),'') IS NULL OR p_monto IS NULL OR p_monto<=0 THEN
    RAISE EXCEPTION 'Escribe el concepto y un valor mayor que cero';
  END IF;

  SELECT * INTO v_gasto FROM public.pos_gastos WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró el gasto que quieres modificar'; END IF;
  IF v_gasto.medio='transferencia' AND (NULLIF(btrim(p_banco),'') IS NULL OR NULLIF(btrim(p_referencia_pago),'') IS NULL) THEN
    RAISE EXCEPTION 'La transferencia necesita banco y comprobante';
  END IF;

  UPDATE public.pos_gastos SET
    fecha=p_fecha,
    categoria=p_categoria,
    concepto=btrim(p_concepto),
    monto=p_monto,
    tercero=NULLIF(btrim(p_tercero),''),
    documento_tercero=NULLIF(btrim(p_documento_tercero),''),
    numero_soporte=NULLIF(btrim(p_numero_soporte),''),
    banco=CASE WHEN v_gasto.medio='transferencia' THEN NULLIF(btrim(p_banco),'') ELSE NULL END,
    referencia_pago=CASE WHEN v_gasto.medio='transferencia' THEN NULLIF(btrim(p_referencia_pago),'') ELSE NULL END,
    nota=NULLIF(btrim(p_nota),'')
  WHERE id=p_id;

  IF v_gasto.caja_movimiento_id IS NOT NULL THEN
    UPDATE public.pos_movimientos_caja SET monto=p_monto,
      nota='Gasto '||p_id||' · '||btrim(p_concepto)
    WHERE id=v_gasto.caja_movimiento_id AND gasto_id=p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo actualizar el movimiento de caja vinculado al gasto'; END IF;
  END IF;

  RETURN jsonb_build_object('id',p_id,'fecha',p_fecha,'monto',p_monto,'medio',v_gasto.medio);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_actualizar_gasto(bigint,date,text,text,numeric,text,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_actualizar_gasto(bigint,date,text,text,numeric,text,text,text,text,text,text) TO authenticated;

COMMIT;
