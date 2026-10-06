(() => {
  const anterior = document.getElementById("previous-product");
  const siguiente = document.getElementById("next-product");
  if (!anterior || !siguiente) return;

  const SUPABASE_URL = "https://nsuxvytaogbnrlopzfgi.supabase.co";
  const SUPABASE_KEY = "sb_publishable_A61mORZLeNZ4hd4x4INGjQ_XS0U1Xap";

  function claveReferencia(producto) {
    const valor = producto.referencia || producto.nombre || producto.id;
    return String(valor).replace(/^ref\s*:?\s*/i, "").trim().toLocaleUpperCase("es");
  }

  async function cargarNavegacion() {
    const lista = new Map();
    try {
      const respuesta = await fetch("productos.json");
      if (respuesta.ok) {
        const productos = await respuesta.json();
        for (const producto of productos) {
          const referencia = claveReferencia(producto);
          lista.set(referencia, {
            referencia,
            id: producto.id,
            url: `producto.html?id=${encodeURIComponent(producto.id)}`
          });
        }
      }
    } catch (error) {
      console.warn("No se cargaron las referencias del catálogo anterior:", error);
    }

    try {
      const cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      const { data, error } = await cliente
        .from("productos")
        .select("id, referencia, nombre")
        .eq("publicado", true)
        .order("id", { ascending: true });
      if (error) throw error;
      for (const producto of data || []) {
        const referencia = claveReferencia(producto);
        lista.set(referencia, {
          referencia,
          id: producto.id,
          url: `producto.html?id=${encodeURIComponent(producto.id)}&origen=supabase`
        });
      }
    } catch (error) {
      console.warn("No se cargaron las referencias nuevas:", error);
    }

    const productos = [...lista.values()];
    if (productos.length < 2) {
      anterior.hidden = true;
      siguiente.hidden = true;
      return;
    }

    const parametros = new URLSearchParams(window.location.search);
    const idActual = parametros.get("id");
    const esSupabase = parametros.get("origen") === "supabase";
    let indiceActual = productos.findIndex(producto =>
      String(producto.id) === idActual && producto.url.includes("origen=supabase") === esSupabase
    );
    if (indiceActual < 0) {
      const nombreActual = document.querySelector("header h1")?.textContent ||
        document.getElementById("product-name")?.textContent || "";
      const referenciaActual = claveReferencia({ nombre: nombreActual });
      indiceActual = productos.findIndex(producto => producto.referencia === referenciaActual);
    }
    if (indiceActual < 0) {
      anterior.hidden = true;
      siguiente.hidden = true;
      return;
    }

    anterior.addEventListener("click", () => {
      const indice = (indiceActual - 1 + productos.length) % productos.length;
      window.location.href = productos[indice].url;
    });
    siguiente.addEventListener("click", () => {
      const indice = (indiceActual + 1) % productos.length;
      window.location.href = productos[indice].url;
    });
  }

  cargarNavegacion();
})();
