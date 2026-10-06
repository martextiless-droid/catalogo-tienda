(() => {
  const SUPABASE_URL = "https://nsuxvytaogbnrlopzfgi.supabase.co";
  const SUPABASE_KEY = "sb_publishable_A61mORZLeNZ4hd4x4INGjQ_XS0U1Xap";
  const ADMIN_USER_ID = "c1fd6ad7-15be-42a6-b239-0564bb34cba5";
  const CATALOGO_PUBLICO_URL = "https://martextiles.com/";
  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const loginPanel = document.getElementById("login-panel");
  const gestionPanel = document.getElementById("gestion-panel");
  const productoPanel = document.getElementById("producto-panel");
  const loginForm = document.getElementById("login-form");
  const formulario = document.getElementById("producto-form");
  const selectorProducto = document.getElementById("producto-existente");
  const productoSeleccionado = document.getElementById("producto-seleccionado");
  const selectorImagenes = document.getElementById("imagenes");
  const previsualizacion = document.getElementById("imagenes-preview");
  const resultado = document.getElementById("resultado");
  const cacheProductos = new Map();
  let productoEditandoId = null;
  let urlsTemporales = [];

  function mostrarEstado(mensaje, tipo = "info") {
    resultado.textContent = mensaje;
    resultado.dataset.tipo = tipo;
  }

  function imagenesDe(producto) {
    const urls = Array.isArray(producto.imagenes_url) ? producto.imagenes_url.filter(Boolean) : [];
    return urls.length ? urls : (producto.imagen_url ? [producto.imagen_url] : []);
  }

  function mostrarProductoSeleccionado() {
    const producto = cacheProductos.get(String(selectorProducto.value));
    productoSeleccionado.replaceChildren();
    productoSeleccionado.hidden = !producto;
    if (!producto) return;

    const imagenes = imagenesDe(producto);
    if (imagenes.length) {
      const imagen = document.createElement("img");
      imagen.src = imagenes[0];
      imagen.alt = `Imagen principal de ${producto.nombre || producto.referencia}`;
      productoSeleccionado.appendChild(imagen);
    } else {
      const sinImagen = document.createElement("div");
      sinImagen.className = "selection-placeholder";
      sinImagen.textContent = "Sin imagen";
      productoSeleccionado.appendChild(sinImagen);
    }
    const info = document.createElement("div");
    info.className = "selection-info";
    const nombre = document.createElement("strong");
    nombre.textContent = producto.nombre || "Producto sin nombre";
    const referencia = document.createElement("span");
    referencia.textContent = `Referencia: ${producto.referencia || `ID ${producto.id}`}`;
    const estado = document.createElement("span");
    estado.className = `product-status${producto.publicado ? "" : " draft"}`;
    estado.textContent = producto.publicado ? "Publicado" : "Oculto del catálogo";
    const botonPublicacion = document.createElement("button");
    botonPublicacion.type = "button";
    botonPublicacion.className = "secondary";
    botonPublicacion.textContent = producto.publicado ? "Ocultar del catálogo" : "Publicar en el catálogo";
    botonPublicacion.addEventListener("click", alternarPublicacion);
    info.append(nombre, referencia, estado, botonPublicacion);
    productoSeleccionado.appendChild(info);
  }

  async function alternarPublicacion() {
    const id = selectorProducto.value;
    const producto = cacheProductos.get(String(id));
    if (!producto) {
      mostrarEstado("Selecciona una referencia para cambiar su publicación.", "error");
      return;
    }
    const { data, error: errorSesion } = await supabaseClient.auth.getUser();
    if (errorSesion || !data.user || data.user.id !== ADMIN_USER_ID) {
      mostrarEstado("Inicia sesión con la cuenta administradora autorizada.", "error");
      return;
    }

    const publicado = !producto.publicado;
    mostrarEstado(publicado ? "Publicando producto..." : "Ocultando producto...");
    const { error } = await supabaseClient
      .from("productos")
      .update({ publicado })
      .eq("id", producto.id);
    if (error) {
      mostrarEstado(`No se pudo cambiar la publicación: ${error.message || "error desconocido"}`, "error");
      return;
    }

    await cargarProductos(producto.id);
    mostrarProductoSeleccionado();
    mostrarEstado(publicado
      ? `Producto ${producto.referencia} publicado en el catálogo.`
      : `Producto ${producto.referencia} ocultado del catálogo.`);
  }

  function limpiarPrevisualizacion() {
    previsualizacion.replaceChildren();
    for (const url of urlsTemporales) URL.revokeObjectURL(url);
    urlsTemporales = [];
  }

  function mostrarImagenes(urls, archivos = []) {
    limpiarPrevisualizacion();
    for (const url of urls) {
      const imagen = document.createElement("img");
      imagen.src = url;
      imagen.alt = "Imagen guardada del producto";
      previsualizacion.appendChild(imagen);
    }
    for (const archivo of archivos) {
      const url = URL.createObjectURL(archivo);
      urlsTemporales.push(url);
      const imagen = document.createElement("img");
      imagen.src = url;
      imagen.alt = archivo.name;
      imagen.title = archivo.name;
      previsualizacion.appendChild(imagen);
    }
  }

  function nivelesPreciosDelFormulario() {
    return [
      { cantidad_minima: 6, precio_unitario: Number(document.getElementById("precio6").value) },
      { cantidad_minima: 12, precio_unitario: Number(document.getElementById("precio12").value) },
      { cantidad_minima: 120, precio_unitario: Number(document.getElementById("precio120").value) }
    ];
  }

  async function validarSesion() {
    const { data, error } = await supabaseClient.auth.getUser();
    const autorizado = !error && data.user && data.user.id === ADMIN_USER_ID;
    loginPanel.hidden = Boolean(autorizado);
    gestionPanel.hidden = !autorizado;
    productoPanel.hidden = !autorizado;
    if (autorizado) await cargarProductos();
    return Boolean(autorizado);
  }

  async function cargarProductos(seleccionarId = "") {
    mostrarEstado("Cargando productos...");
    const { data: productos, error } = await supabaseClient
      .from("productos")
      .select("id, referencia, nombre, descripcion, categoria, subcategoria, imagen_url, imagenes_url, publicado, eliminado")
      .eq("eliminado", false)
      .order("id", { ascending: true });
    if (error) throw error;

    cacheProductos.clear();
    selectorProducto.replaceChildren(new Option("Seleccionar referencia", ""));
    for (const producto of productos || []) {
      cacheProductos.set(String(producto.id), producto);
      const estadoPublicacion = producto.publicado ? "Publicado" : "Borrador";
      selectorProducto.add(new Option(`${producto.referencia || `ID ${producto.id}`} — ${producto.nombre} (${estadoPublicacion})`, producto.id));
    }
    if (seleccionarId) selectorProducto.value = String(seleccionarId);
    mostrarProductoSeleccionado();
    mostrarEstado(`${cacheProductos.size} producto(s) cargado(s).`);
  }

  function normalizarReferencia(valor) {
    return String(valor || "").replace(/^ref(?:erencia)?\s*[:#]?\s*/i, "").trim().toLocaleLowerCase("es");
  }

  function extraerReferencia(nombre) {
    return String(nombre || "").replace(/^ref(?:erencia)?\s*[:#]?\s*/i, "").trim();
  }

  function precioUnitario(precio) {
    const textoUnidad = precio.Unidad || precio.unidad || "";
    const digitos = String(textoUnidad).replace(/[^\d]/g, "");
    if (digitos) return Number(digitos);
    const cantidad = Number(precio.cantidad);
    const total = Number(precio.valor);
    return cantidad > 0 && total > 0 ? Math.round(total / cantidad) : 0;
  }

  async function importarReferenciasAntiguas() {
    const boton = document.getElementById("importar-referencias-antiguas");
    if (!(await validarSesion())) {
      mostrarEstado("Inicia sesión como administrador para importar referencias.", "error");
      return;
    }
    boton.disabled = true;
    mostrarEstado("Leyendo el catálogo anterior...");
    try {
      const [respuestaProductos, respuestaCatalogo] = await Promise.all([
        fetch("productos.json", { cache: "no-store" }),
        fetch("index.html", { cache: "no-store" })
      ]);
      if (!respuestaProductos.ok || !respuestaCatalogo.ok) throw new Error("No se pudo leer el catálogo publicado.");
      const productosAntiguos = await respuestaProductos.json();
      const documentoCatalogo = new DOMParser().parseFromString(await respuestaCatalogo.text(), "text/html");
      const categoriasPorReferencia = new Map();
      for (const tarjeta of documentoCatalogo.querySelectorAll(".products .product")) {
        const referencia = normalizarReferencia(tarjeta.querySelector("h3")?.textContent);
        if (referencia) categoriasPorReferencia.set(referencia, {
          categoria: tarjeta.dataset.cat || "pijamas",
          subcategoria: tarjeta.dataset.subcat || null
        });
      }

      const { data: existentes, error: errorExistentes } = await supabaseClient
        .from("productos")
        .select("id, referencia");
      if (errorExistentes) throw errorExistentes;
      const referenciasExistentes = new Set((existentes || []).map(item => normalizarReferencia(item.referencia)));
      let importados = 0;
      let omitidos = 0;
      let preciosImportados = 0;

      for (const antiguo of productosAntiguos) {
        const referencia = extraerReferencia(antiguo.nombre);
        const clave = normalizarReferencia(referencia);
        if (!clave || referenciasExistentes.has(clave)) {
          omitidos++;
          continue;
        }
        const imagenes = (Array.isArray(antiguo.imagenes) ? antiguo.imagenes : [])
          .filter(Boolean)
          .map(ruta => new URL(ruta, CATALOGO_PUBLICO_URL).href);
        const categoria = categoriasPorReferencia.get(clave) || { categoria: "pijamas", subcategoria: null };
        const payload = {
          referencia,
          nombre: String(antiguo.nombre || `Ref ${referencia}`),
          descripcion: antiguo.descripcion || "",
          categoria: categoria.categoria,
          subcategoria: categoria.subcategoria,
          imagen_url: imagenes[0] || null,
          imagenes_url: imagenes,
          publicado: true
        };
        const { data: producto, error } = await supabaseClient
          .from("productos")
          .insert(payload)
          .select("id, referencia")
          .single();
        if (error) throw new Error(`No se pudo importar ${referencia}: ${error.message || "error desconocido"}`);

        const niveles = (antiguo.precios || [])
          .map(precio => ({
            producto_id: producto.id,
            cantidad_minima: Number(precio.cantidad),
            precio_unitario: precioUnitario(precio)
          }))
          .filter(precio => precio.cantidad_minima > 0 && precio.precio_unitario > 0);
        if (niveles.length) {
          const { error: errorPrecios } = await supabaseClient.from("precios").insert(niveles);
          if (errorPrecios) {
            await supabaseClient.from("productos").delete().eq("id", producto.id);
            throw new Error(`No se pudieron importar los precios de ${referencia}: ${errorPrecios.message || "error desconocido"}`);
          }
          preciosImportados += niveles.length;
        }
        referenciasExistentes.add(clave);
        importados++;
        mostrarEstado(`Importando catálogo anterior: ${importados} referencia(s)...`);
      }

      await cargarProductos();
      mostrarEstado(`Listo: ${importados} referencia(s) incorporada(s), ${omitidos} omitida(s) porque ya existían y ${preciosImportados} precios registrados.`);
    } catch (error) {
      console.error("Error al importar referencias antiguas:", error);
      mostrarEstado(`No se completó la importación: ${error.message || "error desconocido"}. Puedes volver a intentarlo; se omiten las referencias ya incorporadas.`, "error");
      await cargarProductos().catch(() => {});
    } finally {
      boton.disabled = false;
    }
  }

  async function cargarPrecios(productoId) {
    const { data, error } = await supabaseClient
      .from("precios")
      .select("id, cantidad_minima, precio_unitario")
      .eq("producto_id", productoId)
      .order("cantidad_minima", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  function establecerValor(id, valor) {
    document.getElementById(id).value = valor ?? "";
  }

  async function iniciarEdicion() {
    const id = selectorProducto.value;
    const producto = cacheProductos.get(id);
    if (!producto) {
      mostrarEstado("Selecciona un producto para editar.", "error");
      return;
    }

    mostrarEstado("Cargando datos del producto...");
    try {
      const precios = await cargarPrecios(producto.id);
      productoEditandoId = producto.id;
      establecerValor("referencia", producto.referencia);
      establecerValor("nombre", producto.nombre);
      establecerValor("categoria", producto.categoria);
      establecerValor("subcategoria", producto.subcategoria);
      establecerValor("descripcion", producto.descripcion);
      establecerValor("precio6", precios.find(item => Number(item.cantidad_minima) === 6)?.precio_unitario);
      establecerValor("precio12", precios.find(item => Number(item.cantidad_minima) === 12)?.precio_unitario);
      establecerValor("precio120", precios.find(item => Number(item.cantidad_minima) === 120)?.precio_unitario);
      selectorImagenes.required = false;
      document.getElementById("form-title").textContent = `Editar ${producto.referencia || `producto ${producto.id}`}`;
      document.getElementById("guardar-producto").textContent = "Guardar cambios";
      document.getElementById("cancelar-edicion").hidden = false;
      mostrarImagenes(imagenesDe(producto));
      mostrarEstado("Editando producto. Si no seleccionas imágenes nuevas, se conservan las actuales.");
      productoPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      mostrarEstado(`No se pudo cargar el producto: ${error.message || "error desconocido"}`, "error");
    }
  }

  function cancelarEdicion() {
    productoEditandoId = null;
    formulario.reset();
    selectorImagenes.required = true;
    document.getElementById("form-title").textContent = "Nuevo producto";
    document.getElementById("guardar-producto").textContent = "Guardar producto";
    document.getElementById("cancelar-edicion").hidden = true;
    limpiarPrevisualizacion();
  }

  function rutaDesdeUrl(url) {
    const marca = "/storage/v1/object/public/productos/";
    try {
      const ruta = new URL(String(url)).pathname;
      const indice = ruta.indexOf(marca);
      if (indice < 0) return null;
      return ruta.slice(indice + marca.length).split("/").filter(Boolean).map(segmento => decodeURIComponent(segmento)).join("/");
    } catch {
      return null;
    }
  }

  async function retirarImagenes(urls) {
    const rutas = [...new Set(urls.filter(Boolean).map(rutaDesdeUrl).filter(Boolean))];
    if (!rutas.length) return null;
    const { error } = await supabaseClient.storage.from("productos").remove(rutas);
    return error || null;
  }

  async function subirImagenes(archivos) {
    const urls = [];
    const rutas = [];
    const momento = Date.now();
    for (const [indice, archivo] of archivos.entries()) {
      const nombreSeguro = archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const ruta = `productos/${momento}-${indice + 1}-${nombreSeguro}`;
      const { error } = await supabaseClient.storage.from("productos").upload(ruta, archivo);
      if (error) {
        if (rutas.length) await supabaseClient.storage.from("productos").remove(rutas);
        throw error;
      }
      rutas.push(ruta);
      urls.push(supabaseClient.storage.from("productos").getPublicUrl(ruta).data.publicUrl);
    }
    return urls;
  }

  async function guardarPrecios(productoId, niveles) {
    const existentes = await cargarPrecios(productoId);
    for (const nivel of niveles) {
      const existente = existentes.find(item => Number(item.cantidad_minima) === nivel.cantidad_minima);
      const consulta = existente
        ? supabaseClient.from("precios").update({ precio_unitario: nivel.precio_unitario }).eq("id", existente.id)
        : supabaseClient.from("precios").insert({ ...nivel, producto_id: productoId });
      const { error } = await consulta;
      if (error) throw error;
    }
  }

  async function mostrarGuardado(producto, imagenesUrl, reemplazoFallido = false) {
    const imagenes = document.createElement("div");
    imagenes.style.display = "flex";
    imagenes.style.flexWrap = "wrap";
    imagenes.style.gap = ".75rem";
    for (const [indice, url] of imagenesUrl.entries()) {
      const imagen = document.createElement("img");
      imagen.src = url;
      imagen.alt = `Imagen ${indice + 1} de ${producto.referencia}`;
      imagen.style.width = "140px";
      imagen.style.maxHeight = "180px";
      imagen.style.objectFit = "contain";
      imagenes.appendChild(imagen);
    }
    const mensaje = document.createElement("p");
    mensaje.textContent = reemplazoFallido
      ? `Producto ${producto.referencia} actualizado, pero algunas imágenes anteriores no se pudieron retirar del almacenamiento.`
      : `✅ Producto ${producto.referencia} guardado correctamente.`;
    resultado.replaceChildren(mensaje, imagenes);
  }

  async function guardarProducto(event) {
    event.preventDefault();
    if (!(await validarSesion())) {
      mostrarEstado("Inicia sesión como administrador para guardar cambios.", "error");
      return;
    }

    const archivos = Array.from(selectorImagenes.files);
    if (!productoEditandoId && !archivos.length) {
      mostrarEstado("Selecciona al menos una imagen.", "error");
      return;
    }

    const payload = {
      referencia: document.getElementById("referencia").value.trim(),
      nombre: document.getElementById("nombre").value.trim(),
      categoria: document.getElementById("categoria").value,
      subcategoria: document.getElementById("subcategoria").value || null,
      descripcion: document.getElementById("descripcion").value.trim()
    };
    const niveles = nivelesPreciosDelFormulario();
    const anterior = productoEditandoId ? cacheProductos.get(String(productoEditandoId)) : null;
    let imagenesNuevas = [];
    let productoCreado = false;
    let productoActualizado = false;
    mostrarEstado(productoEditandoId ? "Guardando cambios..." : "Guardando producto...");

    try {
      if (archivos.length) imagenesNuevas = await subirImagenes(archivos);
      if (productoEditandoId) {
        if (imagenesNuevas.length) {
          payload.imagen_url = imagenesNuevas[0];
          payload.imagenes_url = imagenesNuevas;
        }
        const { data: producto, error } = await supabaseClient
          .from("productos")
          .update(payload)
          .eq("id", productoEditandoId)
          .select("id, referencia")
          .single();
        if (error) throw error;
        productoActualizado = true;
        await guardarPrecios(producto.id, niveles);
        let errorRetiro = null;
        if (imagenesNuevas.length) errorRetiro = await retirarImagenes(imagenesDe(anterior));
        const idGuardado = producto.id;
        cancelarEdicion();
        await cargarProductos(idGuardado);
        await mostrarGuardado(producto, imagenesNuevas.length ? imagenesNuevas : imagenesDe(anterior), Boolean(errorRetiro));
      } else {
        payload.imagen_url = imagenesNuevas[0];
        payload.imagenes_url = imagenesNuevas;
        payload.publicado = false;
        const { data: producto, error } = await supabaseClient
          .from("productos")
          .insert(payload)
          .select("id, referencia")
          .single();
        if (error) throw error;
        productoCreado = true;
        await guardarPrecios(producto.id, niveles);
        cancelarEdicion();
        await cargarProductos(producto.id);
        await mostrarGuardado(producto, imagenesNuevas);
      }
    } catch (error) {
      if (imagenesNuevas.length && !productoCreado && !productoActualizado) await retirarImagenes(imagenesNuevas);
      console.error("Error al guardar el producto:", error);
      mostrarEstado(`No se pudieron guardar todos los cambios: ${error.message || "error desconocido"}. Revisa el producto antes de volver a guardar.`, "error");
    }
  }

  async function eliminarSeleccionado() {
    const id = selectorProducto.value;
    const producto = cacheProductos.get(id);
    if (!producto) {
      mostrarEstado("Selecciona un producto para eliminar.", "error");
      return;
    }
    const confirmar = window.confirm(`¿Retirar ${producto.referencia || `el producto ${producto.id}`} — ${producto.nombre} del catálogo? Se guardará una marca interna para que la referencia antigua no vuelva a aparecer. Esta acción no se puede deshacer desde el administrador.`);
    if (!confirmar) return;

    mostrarEstado("Eliminando producto...");
    const { error } = await supabaseClient
      .from("productos")
      .update({ eliminado: true, publicado: false, nombre: "", descripcion: "", imagen_url: null, imagenes_url: [] })
      .eq("id", producto.id);
    if (error) {
      mostrarEstado(`No se pudo eliminar el producto: ${error.message || "error desconocido"}`, "error");
      return;
    }

    cancelarEdicion();
    await cargarProductos();
    selectorProducto.value = "";
    mostrarProductoSeleccionado();
    mostrarEstado(`Referencia ${producto.referencia} retirada del catálogo y de la lista de administración.`);
  }

  selectorImagenes.addEventListener("change", () => {
    const archivos = Array.from(selectorImagenes.files);
    if (productoEditandoId) {
      mostrarImagenes([], archivos);
      mostrarEstado(archivos.length
        ? `${archivos.length} imagen(es) seleccionada(s); al guardar se reemplazará la galería actual.`
        : "Sin imágenes nuevas; se conservará la galería actual.");
    } else {
      mostrarImagenes([], archivos);
      if (archivos.length) mostrarEstado(`${archivos.length} imagen(es) seleccionada(s).`);
    }
  });

  document.getElementById("editar-producto").addEventListener("click", iniciarEdicion);
  document.getElementById("eliminar-producto").addEventListener("click", eliminarSeleccionado);
  document.getElementById("importar-referencias-antiguas").addEventListener("click", importarReferenciasAntiguas);
  selectorProducto.addEventListener("change", () => {
    if (productoEditandoId && selectorProducto.value !== String(productoEditandoId)) cancelarEdicion();
    mostrarProductoSeleccionado();
  });
  document.getElementById("cancelar-edicion").addEventListener("click", cancelarEdicion);
  formulario.addEventListener("submit", guardarProducto);

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    mostrarEstado("Verificando acceso...");
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: document.getElementById("login-email").value.trim(),
      password: document.getElementById("login-password").value
    });
    if (error) {
      mostrarEstado(`No se pudo iniciar sesión: ${error.message}`, "error");
      return;
    }
    document.getElementById("login-password").value = "";
    if (!(await validarSesion())) {
      await supabaseClient.auth.signOut();
      mostrarEstado("Esta cuenta no está autorizada para administrar productos.", "error");
    }
  });

  document.getElementById("cerrar-sesion").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    loginPanel.hidden = false;
    gestionPanel.hidden = true;
    productoPanel.hidden = true;
    mostrarEstado("Sesión cerrada.");
  });

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (!session) {
      loginPanel.hidden = false;
      gestionPanel.hidden = true;
      productoPanel.hidden = true;
      return;
    }
    window.setTimeout(() => validarSesion().catch(error => mostrarEstado(`No se pudieron cargar los productos: ${error.message}`, "error")), 0);
  });

  validarSesion().catch(error => mostrarEstado(`No se pudieron cargar los productos: ${error.message}`, "error"));
})();
