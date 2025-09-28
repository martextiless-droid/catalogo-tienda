// Obtener el parámetro ?id= de la URL
const params = new URLSearchParams(window.location.search);
const productId = parseInt(params.get("id"));

// Cargar los datos del JSON
fetch("productos.json")
  .then(response => response.json())
  .then(productos => {
    const producto = productos.find(p => p.id === productId);

    if (producto) {
      document.getElementById("product-img").src = producto.imagen;
      document.getElementById("product-name").textContent = producto.nombre;
      document.getElementById("product-price").textContent = "$" + producto.precio.toLocaleString("es-CO");
      document.getElementById("product-description").textContent = producto.descripcion;

      // Link de WhatsApp dinámico
      const mensaje = `Hola, quiero comprar el producto: ${producto.nombre} por $${producto.precio.toLocaleString("es-CO")}`;
      document.getElementById("whatsapp-link").href = `https://wa.me/573001112233?text=${encodeURIComponent(mensaje)}`;
    } else {
      document.querySelector(".product-detail").innerHTML = "<p>Producto no encontrado</p>";
    }
  });
