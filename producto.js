// Obtener el parámetro ?id= de la URL
const params = new URLSearchParams(window.location.search);
const productId = parseInt(params.get("id"));

// Cargar los datos del JSON
fetch("productos.json")
  .then(response => response.json())
  .then(productos => {
    const producto = productos.find(p => p.id === productId);

    if (producto) {
      // Imagen principal
      const mainImg = document.getElementById("product-img");
      mainImg.src = producto.imagenes[0]; // la primera imagen del array

      // Galería de miniaturas
      const gallery = document.getElementById("gallery");
      gallery.innerHTML = ""; // limpio la galería

      producto.imagenes.forEach(img => {
        const thumb = document.createElement("img");
        thumb.src = img;
        thumb.classList.add("thumb");
        thumb.onclick = () => {
          mainImg.src = img; // cambia la imagen principal al hacer clic
        };
        gallery.appendChild(thumb);
      });

      // Resto de datos
      document.getElementById("product-name").textContent = producto.nombre;
      document.getElementById("product-description").textContent = producto.descripcion;

      // Tabla de precios
      const preciosContainer = document.getElementById("product-prices");
      if (producto.precios && producto.precios.length > 0) {
        let html = "<h3>Precios por cantidad:</h3><table class='prices-table'>";
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
  });

// =====================
// Zoom de imagen principal
// =====================
const modal = document.getElementById("myModal");
const img = document.getElementById("mainImg");
const modalImg = document.getElementById("imgZoom");
const span = document.getElementsByClassName("close")[0];

// Abrir modal al hacer clic en la imagen grande
if (img) {
  img.onclick = function() {
    modal.style.display = "block";
    modalImg.src = this.src;
  }
}

// Cerrar modal al hacer clic en la X
if (span) {
  span.onclick = function() {
    modal.style.display = "none";
  }
}

// Cerrar modal al hacer clic fuera de la imagen
modal.onclick = function(e) {
  if (e.target === modal) {
    modal.style.display = "none";
  }
}
