(() => {
  const SUPABASE_URL = "https://nsuxvytaogbnrlopzfgi.supabase.co";
  const SUPABASE_KEY = "sb_publishable_A61mORZLeNZ4hd4x4INGjQ_XS0U1Xap";
  const ADMIN_USER_ID = "c1fd6ad7-15be-42a6-b239-0564bb34cba5";
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
      .select("id, referencia, nombre, descripcion, categoria, subcategoria, imagen_url, imagenes_url, publicado")
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
    const urlsValidas = urls.filter(Boolean);
    const rutasParseadas = urlsValidas.map(rutaDesdeUrl);
    if (rutasParseadas.some(ruta => !ruta)) {
      return new Error("No se pudo obtener la ruta de una o más imágenes del bucket productos.");
    }
    const rutas = [...new Set(rutasParseadas)];
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
    const confirmar = window.confirm(`¿Eliminar definitivamente ${producto.referencia || `el producto ${producto.id}`} — ${producto.nombre}? Sus precios asociados también se eliminarán. Esta acción no se puede deshacer.`);
    if (!confirmar) return;

    mostrarEstado("Eliminando producto...");
    const urls = imagenesDe(producto);
    const { error } = await supabaseClient.from("productos").delete().eq("id", producto.id);
    if (error) {
      mostrarEstado(`No se pudo eliminar el producto: ${error.message || "error desconocido"}`, "error");
      return;
    }

    const errorImagenes = await retirarImagenes(urls);
    cancelarEdicion();
    await cargarProductos();
    selectorProducto.value = "";
    mostrarProductoSeleccionado();
    mostrarEstado(errorImagenes
      ? `Producto ${producto.referencia} eliminado con sus precios, pero Storage rechazó el borrado de alguna foto: ${errorImagenes.message || "revisa la política DELETE del bucket productos"}.`
      : `Producto ${producto.referencia}, sus precios e imágenes eliminados.`, errorImagenes ? "error" : "info");
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
