(() => {
  const SUPABASE_URL = "https://nsuxvytaogbnrlopzfgi.supabase.co";
  const SUPABASE_KEY = "sb_publishable_A61mORZLeNZ4hd4x4INGjQ_XS0U1Xap";
  const cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const galeria = document.querySelector(".products");
  if (!galeria) return;

  function normalizarReferencia(valor) {
    return String(valor || "").replace(/^ref(?:erencia)?\s*[:#]?\s*/i, "").trim().toLowerCase();
  }

  function referenciasLocales() {
    return new Map(Array.from(galeria.querySelectorAll(".product"), tarjeta => {
      const titulo = tarjeta.querySelector("h3");
      return [normalizarReferencia(titulo?.textContent), tarjeta];
    }).filter(([referencia]) => referencia));
  }

  function elemento(tag, texto) {
    const nodo = document.createElement(tag);
    nodo.textContent = texto ?? "";
    return nodo;
  }

  function imagenesDe(producto) {
    const adicionales = Array.isArray(producto.imagenes_url)
      ? producto.imagenes_url.filter(Boolean)
      : [];
    return adicionales.length ? adicionales : (producto.imagen_url ? [producto.imagen_url] : []);
  }

  function precioDestacado(lista) {
    const mayorCantidad = lista.reduce((actual, precio) =>
      !actual || Number(precio.cantidad_minima) > Number(actual.cantidad_minima) ? precio : actual, null);
    if (!mayorCantidad) return "Precios por consultar";
    const valor = Number(mayorCantidad.precio_unitario).toLocaleString("es-CO");
    return `Mayorista desde $${valor} c/u (${mayorCantidad.cantidad_minima}u)`;
  }

  function crearTarjeta(producto, precios) {
    const tarjeta = document.createElement("article");
    tarjeta.className = "product";
    tarjeta.dataset.cat = producto.categoria || "";
    tarjeta.dataset.subcat = producto.subcategoria || "";

    const enlace = document.createElement("a");
    enlace.href = `producto.html?id=${encodeURIComponent(producto.id)}&origen=supabase`;
    const imagenPrincipal = imagenesDe(producto)[0];
    if (imagenPrincipal) {
      const imagen = document.createElement("img");
      imagen.src = imagenPrincipal;
      imagen.alt = producto.referencia ? `Ref ${producto.referencia}` : (producto.nombre || "Producto");
      imagen.loading = "lazy";
      enlace.appendChild(imagen);
    }
    tarjeta.appendChild(enlace);

    tarjeta.appendChild(elemento("h3", producto.referencia ? `Ref ${producto.referencia}` : producto.nombre));
    tarjeta.appendChild(elemento("p", precioDestacado(precios)));

    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "btn-cart-add add-to-cart";
    boton.dataset.id = `supabase-${producto.id}`;
    boton.dataset.name = producto.referencia || producto.nombre || `ID ${producto.id}`;
    boton.textContent = "Agregar al carrito 🛒";
    tarjeta.appendChild(boton);
    return tarjeta;
  }

  function aplicarFiltroActual() {
    const parametros = new URLSearchParams(window.location.search);
    const categoria = (parametros.get("cat") || "all").toLowerCase();
    const subcategoria = (parametros.get("subcat") || "all").toLowerCase();

    galeria.querySelectorAll(".product").forEach(tarjeta => {
      if (!tarjeta.dataset.supabaseProduct) return;
      const categoriaProducto = (tarjeta.dataset.cat || "").toLowerCase();
      const subcategoriaProducto = (tarjeta.dataset.subcat || "").toLowerCase();
      const coincideCategoria = categoria === "all" || categoriaProducto === categoria;
      const coincideSubcategoria = categoria !== "pijamas" || subcategoria === "all" || subcategoriaProducto === subcategoria;
      tarjeta.style.display = coincideCategoria && coincideSubcategoria ? "" : "none";
    });
  }

  async function cargarProductosPublicados() {
    const { data: productos, error: errorProductos } = await cliente
      .from("productos")
      .select("id, referencia, nombre, categoria, subcategoria, imagen_url, imagenes_url, publicado, eliminado")
      .order("id", { ascending: true });

    if (errorProductos) throw errorProductos;
    if (!productos.length) return;

    const ids = productos.filter(producto => producto.publicado && !producto.eliminado).map(producto => producto.id);
    if (!ids.length) {
      for (const producto of productos) {
        const referencia = normalizarReferencia(producto.referencia);
        existentes.get(referencia)?.remove();
        existentes.delete(referencia);
      }
      aplicarFiltroActual();
      return;
    }
    const { data: precios, error: errorPrecios } = await cliente
      .from("precios")
      .select("producto_id, cantidad_minima, precio_unitario")
      .in("producto_id", ids)
      .order("cantidad_minima", { ascending: true });

    if (errorPrecios) throw errorPrecios;

    const preciosPorProducto = new Map();
    for (const precio of precios) {
      const lista = preciosPorProducto.get(precio.producto_id) || [];
      lista.push(precio);
      preciosPorProducto.set(precio.producto_id, lista);
    }

    const existentes = referenciasLocales();
    for (const producto of productos) {
      const referencia = normalizarReferencia(producto.referencia);
      const tarjetaAnterior = existentes.get(referencia);
      if (producto.eliminado || !producto.publicado) {
        tarjetaAnterior?.remove();
        existentes.delete(referencia);
        continue;
      }
      const tarjeta = crearTarjeta(producto, preciosPorProducto.get(producto.id) || []);
      tarjeta.dataset.supabaseProduct = "true";
      if (tarjetaAnterior) tarjetaAnterior.replaceWith(tarjeta);
      else galeria.appendChild(tarjeta);
      if (referencia) existentes.set(referencia, tarjeta);
    }

    aplicarFiltroActual();
  }

  cargarProductosPublicados().catch(error => {
    console.error("No se pudieron cargar los productos publicados desde Supabase:", error);
  });
})();
