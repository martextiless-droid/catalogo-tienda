-- Permite anular abonos sin borrar el historial contable.
BEGIN;

ALTER TABLE public.pos_movimientos_cuenta_cliente
  ADD COLUMN IF NOT EXISTS movimiento_reversado_id bigint
  REFERENCES public.pos_movimientos_cuenta_cliente(id);

ALTER TABLE public.pos_movimientos_cuenta_cliente
  DROP CONSTRAINT IF EXISTS pos_movimientos_cuenta_cliente_tipo_check;
ALTER TABLE public.pos_movimientos_cuenta_cliente
  ADD CONSTRAINT pos_movimientos_cuenta_cliente_tipo_check
  CHECK (tipo IN ('abono','uso_abono','anulacion_abono','deuda','pago_deuda'));
CREATE UNIQUE INDEX IF NOT EXISTS pos_movimientos_cuenta_cliente_reversion_unica
  ON public.pos_movimientos_cuenta_cliente(movimiento_reversado_id)
  WHERE movimiento_reversado_id IS NOT NULL;

ALTER TABLE public.pos_movimientos_caja
  DROP CONSTRAINT IF EXISTS pos_movimientos_caja_tipo_check;
ALTER TABLE public.pos_movimientos_caja
  ADD CONSTRAINT pos_movimientos_caja_tipo_check
  CHECK (tipo IN ('apertura','venta','abono_cliente','anulacion_abono','ingreso','retiro'));

CREATE OR REPLACE FUNCTION public.pos_obtener_cuenta_cliente(p_documento text DEFAULT NULL,p_telefono text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_cliente public.pos_clientes%ROWTYPE; v_credito numeric(14,2); v_deuda numeric(14,2); v_doc text; v_tel text; v_movimientos jsonb;
BEGIN
  IF auth.uid() IS DISTINCT FROM 'c1fd6ad7-15be-42a6-b239-0564bb34cba5'::uuid THEN RAISE EXCEPTION 'No autorizado'; END IF;
  v_doc:=regexp_replace(COALESCE(p_documento,''),'[^0-9]','','g');v_tel:=regexp_replace(COALESCE(p_telefono,''),'[^0-9]','','g');IF length(v_tel)=12 AND left(v_tel,2)='57' THEN v_tel:=substr(v_tel,3);END IF;
  SELECT * INTO v_cliente FROM public.pos_clientes c
  WHERE (v_doc<>'' AND regexp_replace(COALESCE(c.documento,''),'[^0-9]','','g')=v_doc)
     OR (v_tel<>'' AND regexp_replace(COALESCE(c.telefono,''),'[^0-9]','','g') IN (v_tel,'57'||v_tel))
  ORDER BY CASE WHEN v_doc<>'' AND regexp_replace(COALESCE(c.documento,''),'[^0-9]','','g')=v_doc THEN 0 ELSE 1 END,c.actualizado_en DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('encontrado',false,'saldo_favor',0,'saldo_pendiente',0,'movimientos','[]'::jsonb); END IF;
  SELECT COALESCE(sum(CASE WHEN tipo='abono' THEN monto WHEN tipo IN ('uso_abono','anulacion_abono') THEN -monto ELSE 0 END),0),
         COALESCE(sum(CASE WHEN tipo='deuda' THEN monto WHEN tipo='pago_deuda' THEN -monto ELSE 0 END),0)
  INTO v_credito,v_deuda FROM public.pos_movimientos_cuenta_cliente WHERE cliente_id=v_cliente.id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'tipo',tipo,'monto',monto,'medio',medio,'banco',banco,'referencia_pago',referencia_pago,'venta_id',venta_id,'nota',nota,'movimiento_reversado_id',movimiento_reversado_id,'creado_en',creado_en) ORDER BY creado_en DESC),'[]'::jsonb)
  INTO v_movimientos FROM (SELECT * FROM public.pos_movimientos_cuenta_cliente WHERE cliente_id=v_cliente.id ORDER BY creado_en DESC LIMIT 50) recent;
  RETURN jsonb_build_object('encontrado',true,'cliente_id',v_cliente.id,'nombre',v_cliente.nombre,'documento',v_cliente.documento,'telefono',v_cliente.telefono,'saldo_favor',v_credito,'saldo_pendiente',v_deuda,'movimientos',v_movimientos);
END $$;

CREATE OR REPLACE FUNCTION public.pos_anular_abono(p_movimiento_id bigint,p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_abono public.pos_movimientos_cuenta_cliente%ROWTYPE; v_saldo numeric(14,2); v_caja_id bigint; v_esperado numeric(14,2);
BEGIN
  IF auth.uid() IS DISTINCT FROM 'c1fd6ad7-15be-42a6-b239-0564bb34cba5'::uuid THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT * INTO v_abono FROM public.pos_movimientos_cuenta_cliente WHERE id=p_movimiento_id AND tipo='abono' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró el abono que intentas anular'; END IF;
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

COMMIT;
