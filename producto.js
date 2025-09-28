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
  document.getElementById("product-price").textContent = "$" + producto.precio.toLocaleString("es-CO");
  document.getElementById("product-description").textContent = producto.descripcion;

  // WhatsApp link dinámico
  const mensaje = `Hola, quiero comprar el producto: ${producto.nombre} por $${producto.precio.toLocaleString("es-CO")}`;
  document.getElementById("whatsapp-link").href = `https://wa.me/573001112233?text=${encodeURIComponent(mensaje)}`;
}

  });
