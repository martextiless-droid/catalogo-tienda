(() => {
  const parametros = new URLSearchParams(window.location.search);
  if (parametros.get("origen") !== "supabase") return;

  const SUPABASE_URL = "https://nsuxvytaogbnrlopzfgi.supabase.co";
  const SUPABASE_KEY = "sb_publishable_A61mORZLeNZ4hd4x4INGjQ_XS0U1Xap";
  const cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const id = parametros.get("id");

  function crear(tag, texto) {
    const nodo = document.createElement(tag);
    nodo.textContent = texto ?? "";
    return nodo;
  }

  function nombreDe(producto) {
    return producto.referencia ? `Ref ${producto.referencia}` : (producto.nombre || `ID ${producto.id}`);
  }

  function imagenesDe(producto) {
    const adicionales = Array.isArray(producto.imagenes_url)
      ? producto.imagenes_url.filter(Boolean)
      : [];
    return adicionales.length ? adicionales : (producto.imagen_url ? [producto.imagen_url] : []);
  }

  function prepararZoom(imagen) {
    const modal = document.getElementById("myModal");
    const imagenZoom = document.getElementById("imgZoom");
    const cerrar = document.querySelector("#myModal .close");
    if (!imagen || !modal || !imagenZoom || !cerrar) return;

    imagen.onclick = () => {
      modal.style.display = "block";
      imagenZoom.src = imagen.src;
      imagenZoom.alt = imagen.alt;
    };
    cerrar.onclick = () => { modal.style.display = "none"; };
    modal.onclick = evento => {
      if (evento.target === modal) modal.style.display = "none";
    };
  }

  function mostrarPrecios(precios) {
    const contenedor = document.getElementById("product-prices");
    const titulo = crear("h3", "Precios por cantidad");
    const tabla = document.createElement("table");
    tabla.className = "prices-table";
    const cabecera = document.createElement("tr");
    for (const nombreColumna of ["Cantidad mínima", "Precio unitario"]) {
      const celda = crear("th", nombreColumna);
      cabecera.appendChild(celda);
    }
    tabla.appendChild(cabecera);

    for (const precio of precios) {
      const fila = document.createElement("tr");
      fila.appendChild(crear("td", `${precio.cantidad_minima} unidades`));
      fila.appendChild(crear("td", `$${Number(precio.precio_unitario).toLocaleString("es-CO")}`));
      tabla.appendChild(fila);
    }

    contenedor.replaceChildren(titulo);
    if (precios.length) contenedor.appendChild(tabla);
    else contenedor.appendChild(crear("p", "Este producto aún no tiene precios registrados."));
  }

  function precioResumen(precios) {
    if (!precios.length) return "Precios por consultar";
    const ultimo = precios.reduce((mayor, precio) =>
      Number(precio.cantidad_minima) > Number(mayor.cantidad_minima) ? precio : mayor, precios[0]);
    return `Mayorista desde $${Number(ultimo.precio_unitario).toLocaleString("es-CO")} c/u (${ultimo.cantidad_minima}u)`;
  }

  function claveReferencia(producto) {
    const valor = producto.referencia || producto.nombre || producto.id;
    return String(valor).replace(/^ref\s*:?\s*/i, "").trim().toLocaleUpperCase("es");
  }

  async function cargarRecomendados(productoActual) {
    const grid = document.getElementById("recommended-grid");
    if (!grid) return;
    const consultaSupabase = await cliente
      .from("productos")
      .select("id, referencia, nombre, imagen_url, imagenes_url")
      .eq("publicado", true)
      .neq("id", productoActual.id)
      .order("id", { ascending: true });
    if (consultaSupabase.error) throw consultaSupabase.error;

    let productosJson = [];
    try {
      const respuesta = await fetch("productos.json");
      if (respuesta.ok) productosJson = await respuesta.json();
    } catch (error) {
      console.warn("No se cargó el catálogo anterior para las sugerencias:", error);
    }

    const porReferencia = new Map();
    for (const item of productosJson) {
      const referencia = claveReferencia(item);
      porReferencia.set(referencia, {
        origen: "json",
        id: item.id,
        referencia,
        nombre: item.nombre || `Ref ${referencia}`,
        imagen: Array.isArray(item.imagenes) ? item.imagenes[0] : "",
        preciosJson: item.precios || []
      });
    }
    for (const item of consultaSupabase.data || []) {
      const referencia = claveReferencia(item);
      porReferencia.set(referencia, {
        origen: "supabase",
        id: item.id,
        referencia,
        nombre: nombreDe(item),
        imagen: imagenesDe(item)[0] || "",
        producto: item
      });
    }

    const candidatos = [...porReferencia.values()]
      .filter(item => item.referencia !== claveReferencia(productoActual));
    for (let indice = candidatos.length - 1; indice > 0; indice--) {
      const aleatorio = Math.floor(Math.random() * (indice + 1));
      [candidatos[indice], candidatos[aleatorio]] = [candidatos[aleatorio], candidatos[indice]];
    }
    const productos = candidatos.slice(0, 4);
    if (!productos.length) return;

    const ids = productos.filter(item => item.origen === "supabase").map(item => item.id);
    let precios = [];
    if (ids.length) {
      const consultaPrecios = await cliente
        .from("precios")
        .select("producto_id, cantidad_minima, precio_unitario")
        .in("producto_id", ids)
        .order("cantidad_minima", { ascending: true });
      if (consultaPrecios.error) throw consultaPrecios.error;
      precios = consultaPrecios.data || [];
    }
    const porProducto = new Map();
    for (const precio of precios) {
      const lista = porProducto.get(precio.producto_id) || [];
      lista.push(precio);
      porProducto.set(precio.producto_id, lista);
    }

    grid.replaceChildren();
    for (const recomendado of productos) {
      const tarjeta = document.createElement("article");
      tarjeta.className = "product";
      const enlace = document.createElement("a");
      enlace.href = recomendado.origen === "supabase"
        ? `producto.html?id=${encodeURIComponent(recomendado.id)}&origen=supabase`
        : `producto.html?id=${encodeURIComponent(recomendado.id)}`;
      if (recomendado.imagen) {
        const imagen = document.createElement("img");
        imagen.src = recomendado.imagen;
        imagen.alt = recomendado.nombre;
        imagen.loading = "lazy";
        enlace.appendChild(imagen);
      }
      tarjeta.appendChild(enlace);
      tarjeta.appendChild(crear("h3", recomendado.nombre));
      const resumen = recomendado.origen === "supabase"
        ? precioResumen(porProducto.get(recomendado.id) || [])
        : (recomendado.preciosJson.at(-1)?.Unidad || recomendado.preciosJson.at(-1)?.unidad || "Precios por consultar");
      tarjeta.appendChild(crear("p", recomendado.origen === "supabase" ? resumen : `Mayorista desde ${resumen}`));
      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "btn-cart-add add-to-cart";
      boton.dataset.id = recomendado.origen === "supabase" ? `supabase-${recomendado.id}` : String(recomendado.id);
      boton.dataset.name = recomendado.nombre;
      boton.textContent = "Agregar al carrito 🛒";
      tarjeta.appendChild(boton);
      grid.appendChild(tarjeta);
    }
  }

  async function cargarFicha() {
    if (!id) throw new Error("Falta el ID del producto en la dirección.");

    const { data: producto, error: errorProducto } = await cliente
      .from("productos")
      .select("id, referencia, nombre, descripcion, categoria, subcategoria, imagen_url, imagenes_url")
      .eq("id", id)
      .eq("publicado", true)
      .maybeSingle();
    if (errorProducto) throw errorProducto;
    if (!producto) throw new Error("No se encontró un producto publicado con ese ID.");

    const { data: precios, error: errorPrecios } = await cliente
      .from("precios")
      .select("cantidad_minima, precio_unitario")
      .eq("producto_id", producto.id)
      .order("cantidad_minima", { ascending: true });
    if (errorPrecios) throw errorPrecios;

    const nombre = nombreDe(producto);
    document.title = `${nombre} - MarTextiles`;
    document.getElementById("product-name").textContent = producto.nombre || nombre;
    const referencia = document.getElementById("product-reference");
    if (producto.referencia) {
      referencia.textContent = `Referencia ${producto.referencia}`;
      referencia.hidden = false;
    }
    document.getElementById("product-description").textContent = producto.descripcion || "";
    const imagenPrincipal = document.getElementById("product-img");
    const galeria = document.getElementById("gallery");
    galeria.replaceChildren();
    const imagenes = imagenesDe(producto);
    if (imagenes.length) {
      imagenPrincipal.src = imagenes[0];
      imagenPrincipal.alt = nombre;
      imagenes.forEach((url, indice) => {
        const miniatura = document.createElement("img");
        miniatura.src = url;
        miniatura.alt = `${nombre}, imagen ${indice + 1}`;
        miniatura.className = "thumb";
        miniatura.onclick = () => { imagenPrincipal.src = miniatura.src; };
        galeria.appendChild(miniatura);
      });
      prepararZoom(imagenPrincipal);
    } else {
      imagenPrincipal.hidden = true;
    }

    mostrarPrecios(precios || []);
    const botonCarrito = document.getElementById("add-product-to-cart");
    botonCarrito.dataset.id = `supabase-${producto.id}`;
    botonCarrito.dataset.name = nombre;
    botonCarrito.disabled = false;

    const mensaje = `Hola, quiero comprar el producto: ${nombre}`;
    const enlaceWhatsApp = document.getElementById("whatsapp-link");
    enlaceWhatsApp.href = `https://wa.me/573015547616?text=${encodeURIComponent(mensaje)}`;

    if (typeof window.fbq === "function") {
      const menorPrecio = (precios || []).reduce((menor, item) =>
        !menor || Number(item.precio_unitario) < Number(menor.precio_unitario) ? item : menor, null);
      window.fbq("track", "ViewContent", {
        content_type: "product",
        content_ids: [String(producto.id)],
        content_name: producto.nombre || nombre,
        value: menorPrecio ? Number(menorPrecio.precio_unitario) : 0,
        currency: "COP"
      });
      enlaceWhatsApp.addEventListener("click", () => {
        window.fbq("track", "Contact", {
          content_type: "product",
          content_ids: [String(producto.id)],
          content_name: producto.nombre || nombre,
          currency: "COP"
        });
      });
    }

    cargarRecomendados(producto).catch(error => console.error("No se cargaron productos recomendados:", error));
  }

  cargarFicha().catch(error => {
    console.error("No se pudo cargar el producto de Supabase:", error);
    document.getElementById("product-name").textContent = "No se pudo cargar el producto";
    document.getElementById("product-description").textContent = error.message || "Error desconocido.";
  });
})();
