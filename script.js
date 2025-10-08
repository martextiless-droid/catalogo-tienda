let cart = [];

document.querySelectorAll('.add-to-cart').forEach(btn => {
  btn.addEventListener('click', () => {
    let name = btn.dataset.name;
    let price = parseInt(btn.dataset.price);
    cart.push({ name, price });
    renderCart();
  });
});

function renderCart() {
  let cartItems = document.getElementById("cart-items");
  let cartTotal = document.getElementById("cart-total");
  cartItems.innerHTML = "";
  let total = 0;

  cart.forEach(item => {
    let li = document.createElement("li");
    li.textContent = `${item.name} - $${item.price}`;
    cartItems.appendChild(li);
    total += item.price;
  });

  cartTotal.textContent = total;

  // Generar link de WhatsApp con el pedido
  let text = "Hola, quiero comprar:\n" + cart.map(i => `${i.name} - $${i.price}`).join("\n") + `\nTotal: $${total}`;
  document.getElementById("whatsapp-link").href = `https://wa.me/573001112233?text=${encodeURIComponent(text)}`;
}


// ====== Filtro de categorías por URL ======
(function () {
  const params = new URLSearchParams(location.search);
  const cat = (params.get('cat') || 'all').toLowerCase();

  // marcar link activo en la barra
  document.querySelectorAll('.cat-link').forEach(a => {
    const linkCat = (new URL(a.href, location.href).searchParams.get('cat') || 'all').toLowerCase();
    if (linkCat === cat) a.classList.add('active');
  });

  // filtrar tarjetas .product por data-cat
  const cards = Array.from(document.querySelectorAll('.product'));
  cards.forEach(card => {
    // por defecto, si no tiene data-cat lo tratamos como 'pijamas'
    const c = (card.dataset.cat || 'pijamas').toLowerCase();
    const show = (cat === 'all' || c === cat);
    card.style.display = show ? '' : 'none';
  });

  // Pixel: ViewCategory con el nombre de la categoría
  if (typeof fbq === 'function') {
    fbq('track', 'ViewCategory', { content_category: cat });
  }
})();

