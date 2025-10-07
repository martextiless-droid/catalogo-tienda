// Obtener el parámetro ?id= de la URL
const params = new URLSearchParams(window.location.search);
const productId = parseInt(params.get("id"));

// Cargar los datos del JSON
fetch("productos.json")
  .then(response => response.json())
  .then(productos => {
    const producto = productos.find(p => p.id === productId);

    if (producto) {

      // ====== Dentro de if (producto) { ... } ======

// Utilidad: convierte "$11.500 c/u" => 11500 (número)
function parseCOP(str) {
  if (!str) return 0;
  const n = String(str).replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
  const val = parseFloat(n);
  return isNaN(val) ? 0 : Math.round(val);
}

// Elegimos un precio representativo para enviar a Meta:
// prioriza el menor "unidad"; si no hay, toma el primer "valor"
function pickPixelValue(p) {
  if (p && Array.isArray(p.precios) && p.precios.length) {
    const unidades = p.precios
      .map(x => x.unidad)
      .filter(Boolean)
      .map(parseCOP)
      .filter(v => v > 0);
    if (unidades.length) {
      return Math.min(...unidades);
    }
    const firstValor = parseCOP(p.precios[0].valor);
    if (firstValor > 0) return firstValor;
  }
  return 0;
}

const pixelValue = pickPixelValue(producto);

// 3.1 ViewContent en la página de detalle
if (typeof fbq === 'function') {
  fbq('track', 'ViewContent', {
    content_type: 'product',
    content_ids: [String(producto.id)],
    content_name: producto.nombre || `Ref ${producto.id}`,
    value: pixelValue,
    currency: 'COP'
  });
}

// 3.2 Al click del botón de WhatsApp: Contact (o InitiateCheckout)
const waBtn = document.getElementById('whatsapp-link');
if (waBtn && typeof fbq === 'function') {
  waBtn.addEventListener('click', () => {
    fbq('track', 'Contact', {
      content_type: 'product',
      content_ids: [String(producto.id)],
      content_name: producto.nombre || `Ref ${producto.id}`,
      value: pixelValue,
      currency: 'COP'
    });
  });
}


      // Imagen principal
      const mainImg = document.getElementById("product-img");
      mainImg.src = producto.imagenes[0]; // la primera imagen del array

// =====================
// Zoom de imagen principal
// =====================
  const modal = document.getElementById("myModal");
  const modalImg = document.getElementById("imgZoom");
  const span = document.getElementsByClassName("close")[0];

  mainImg.onclick = () => {
    modal.style.display = "block";
    modalImg.src = mainImg.src;
  };

  span.onclick = () => {
    modal.style.display = "none";
  };

  modal.onclick = (e) => {
    if (e.target === modal) modal.style.display = "none";
  };

  // Galería de miniaturas
  const gallery = document.getElementById("gallery");
  gallery.innerHTML = ""; // limpio la galería

  producto.imagenes.forEach(img => {
    const thumb = document.createElement("img");
    thumb.src = img;
    thumb.classList.add("thumb");
    thumb.onclick = () => {
      mainImg.src = img; // cambia la imagen principal al hacer clic
      modalImg.src = img;
    };
    gallery.appendChild(thumb);
  });



      // Resto de datos
      document.getElementById("product-name").textContent = producto.nombre;
      document.getElementById("product-description").textContent = producto.descripcion;

      // Tabla de precios
      const preciosContainer = document.getElementById("product-prices");
      if (producto.precios && producto.precios.length > 0) {
        let html = "<h3>(Puedes surtir en varias referencias)</h3><h3>Precios por cantidad</h3><table class='prices-table'>";
        html += "<tr><th>Cantidad</th><th>Valor</th><th>Unidad</th></tr>";

        producto.precios.forEach(p => {
          html += `
            <tr>
              <td>${p.cantidad}</td>
              <td>$${p.valor.toLocaleString("es-CO")}</td>
              <td>${p.Unidad ? p.Unidad : "-"}</td>
            </tr>
          `;
        });

        html += "</table>";
        preciosContainer.innerHTML = html;
      }

      // WhatsApp link dinámico (ahora solo nombre)
      const mensaje = `Hola, quiero comprar el producto: ${producto.nombre}`;
      document.getElementById("whatsapp-link").href =
        `https://wa.me/573015547616?text=${encodeURIComponent(mensaje)}`;
    }

    // --- Catálogo: si existe la grilla, marcamos ViewCategory
document.addEventListener('DOMContentLoaded', () => {
  const grid = document.querySelector('.products');
  if (!grid || typeof fbq !== 'function') return;

  // 2.1 Vista de categoría (catálogo)
  fbq('track', 'ViewCategory', {
    content_category: 'Catalogo',
  });

  // 2.2 Cuando hacen clic en "Ver producto"
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="producto.html?id="]');
    if (!link || typeof fbq !== 'function') return;

    try {
      const url = new URL(link.href, location.href);
      const id = url.searchParams.get('id');
      // Disparamos ViewContent (clic en una tarjeta)
      fbq('track', 'ViewContent', {
        content_type: 'product',
        content_ids: [String(id)],
        content_name: `Click catálogo: Ref ${id}`,
        currency: 'COP'
      });
    } catch (_) {}
  });
});


  });


