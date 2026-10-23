-- Permite borrar clientes sin perder ventas ni movimientos históricos.
-- Ejecutar una vez en Supabase SQL Editor después de las migraciones de clientes del POS.
BEGIN;

ALTER TABLE public.pos_clientes
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.pos_eliminar_cliente(p_cliente_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_cliente public.pos_clientes%ROWTYPE;
  v_saldo_favor numeric(14,2);
  v_saldo_pendiente numeric(14,2);
  v_tiene_historial boolean;
BEGIN
  IF auth.uid() IS DISTINCT FROM 'c1fd6ad7-15be-42a6-b239-0564bb34cba5'::uuid THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_cliente
  FROM public.pos_clientes
  WHERE id=p_cliente_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró el cliente'; END IF;

  SELECT
    COALESCE(sum(CASE WHEN tipo='abono' THEN monto WHEN tipo IN ('uso_abono','anulacion_abono') THEN -monto ELSE 0 END),0),
    COALESCE(sum(CASE WHEN tipo='deuda' THEN monto WHEN tipo='pago_deuda' THEN -monto ELSE 0 END),0)
  INTO v_saldo_favor,v_saldo_pendiente
  FROM public.pos_movimientos_cuenta_cliente
  WHERE cliente_id=p_cliente_id;

  IF v_saldo_favor<>0 OR v_saldo_pendiente<>0 THEN
    RAISE EXCEPTION 'No se puede eliminar: el cliente tiene un saldo a favor o una deuda pendiente';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.pos_ventas WHERE cliente_id=p_cliente_id)
      OR EXISTS(SELECT 1 FROM public.pos_movimientos_cuenta_cliente WHERE cliente_id=p_cliente_id)
  INTO v_tiene_historial;

  IF v_tiene_historial THEN
    UPDATE public.pos_clientes
    SET activo=false,actualizado_en=now()
    WHERE id=p_cliente_id;
    RETURN jsonb_build_object('cliente_id',p_cliente_id,'archivado',true,'eliminado',false);
  END IF;

  DELETE FROM public.pos_clientes WHERE id=p_cliente_id;
  RETURN jsonb_build_object('cliente_id',p_cliente_id,'archivado',false,'eliminado',true);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_eliminar_cliente(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_eliminar_cliente(bigint) TO authenticated;

-- Si un cliente archivado vuelve a comprar, se reactiva con la nueva venta.
CREATE OR REPLACE FUNCTION public.pos_vincular_cliente_venta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_cliente_id bigint;
  v_nivel text;
  v_documento text;
BEGIN
  IF auth.uid() IS DISTINCT FROM 'c1fd6ad7-15be-42a6-b239-0564bb34cba5'::uuid THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  v_documento:=NULLIF(regexp_replace(COALESCE(NEW.cliente_documento,''),'[^0-9]','','g'),'');
  NEW.cliente_documento:=v_documento;

  IF v_documento IS NOT NULL THEN
    INSERT INTO public.pos_clientes(nombre,documento,telefono,ciudad,nivel_precio,actualizado_en)
    VALUES(NULLIF(btrim(NEW.cliente_nombre),''),v_documento,NULLIF(btrim(NEW.cliente_telefono),''),NULLIF(btrim(NEW.cliente_ciudad),''),NEW.nivel_precio,now())
    ON CONFLICT(documento) DO UPDATE SET
      nombre=COALESCE(EXCLUDED.nombre,pos_clientes.nombre),
      telefono=COALESCE(EXCLUDED.telefono,pos_clientes.telefono),
      ciudad=COALESCE(EXCLUDED.ciudad,pos_clientes.ciudad),
      nivel_precio=COALESCE(EXCLUDED.nivel_precio,pos_clientes.nivel_precio),
      activo=true,
      actualizado_en=now()
    RETURNING id,nivel_precio INTO v_cliente_id,v_nivel;
  ELSIF NULLIF(btrim(NEW.cliente_telefono),'') IS NOT NULL THEN
    SELECT id,nivel_precio INTO v_cliente_id,v_nivel
    FROM public.pos_clientes
    WHERE telefono=btrim(NEW.cliente_telefono)
    ORDER BY actualizado_en DESC
    LIMIT 1
    FOR UPDATE;

    IF v_cliente_id IS NULL THEN
      INSERT INTO public.pos_clientes(nombre,telefono,ciudad,nivel_precio)
      VALUES(NULLIF(btrim(NEW.cliente_nombre),''),NULLIF(btrim(NEW.cliente_telefono),''),NULLIF(btrim(NEW.cliente_ciudad),''),NEW.nivel_precio)
      RETURNING id,nivel_precio INTO v_cliente_id,v_nivel;
    ELSE
      UPDATE public.pos_clientes
      SET nombre=COALESCE(NULLIF(btrim(NEW.cliente_nombre),''),nombre),
          ciudad=COALESCE(NULLIF(btrim(NEW.cliente_ciudad),''),ciudad),
          nivel_precio=COALESCE(NEW.nivel_precio,nivel_precio),
          activo=true,
          actualizado_en=now()
      WHERE id=v_cliente_id
      RETURNING nivel_precio INTO v_nivel;
    END IF;
  END IF;

  NEW.cliente_id:=v_cliente_id;
  NEW.nivel_precio:=COALESCE(NEW.nivel_precio,v_nivel);
  RETURN NEW;
END;
$$;

COMMIT;
