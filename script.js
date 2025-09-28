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