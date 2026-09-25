/* ===== Carrito Martex ===== */
(() => {
  const STORAGE_KEY = "martex_cart";
  const WA_NUMBER = "573015547616";
  let cart = loadCart();

  function loadCart() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(data) ? data : [];
    } catch (_) { return []; }
  }
  function saveCart(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); }
  function getCardName(btn){
    const card=btn.closest(".product"), title=card&&card.querySelector("h3");
    return title ? title.textContent.trim() : `Ref ${btn.dataset.id||""}`.trim();
  }
  function addToCart(item){
    const id=String(item.id), qty=Math.max(1,parseInt(item.quantity,10)||1);
    const existing=cart.find(x=>String(x.id)===id);
    if(existing) existing.quantity+=qty;
    else cart.push({id,name:item.name,quantity:qty});
    saveCart(); renderCart(); openCart();
  }
  function changeQty(id,delta){
    const item=cart.find(x=>String(x.id)===String(id)); if(!item)return;
    item.quantity+=delta;
    if(item.quantity<=0) cart=cart.filter(x=>String(x.id)!==String(id));
    saveCart(); renderCart();
  }
  function removeItem(id){ cart=cart.filter(x=>String(x.id)!==String(id)); saveCart(); renderCart(); }
  function totalUnits(){ return cart.reduce((s,x)=>s+(parseInt(x.quantity,10)||0),0); }
  function whatsappMessage(){
    let text="Hola, quiero hacer el siguiente pedido:\n\n";
    cart.forEach(item=>{ text+=`Ref ${item.name.replace(/^Ref[: ]*/i,"")} - ${item.quantity} unidades\n`; });
    text+=`\nTotal de unidades: ${totalUnits()}\n\n¿Me confirman disponibilidad y precio mayorista?`;
    return text;
  }
  function renderCart(){
    const container=document.getElementById("cart-items"), count=document.getElementById("cart-count");
    const total=document.getElementById("cart-total"), wa=document.getElementById("whatsapp-cart-link");
    const units=totalUnits();
    if(count) count.textContent=units;
    if(total) total.textContent=units;
    if(!container)return;
    if(!cart.length){
      container.innerHTML='<div class="cart-empty">Tu carrito está vacío.<br>Agrega las referencias que te interesan.</div>';
    } else {
      container.innerHTML=cart.map(item=>`
        <div class="cart-item">
          <div><div class="cart-item-name">${escapeHtml(item.name)}</div>
          <div class="cart-item-sub">Referencia seleccionada</div>
          <div class="cart-controls">
            <button type="button" data-cart-minus="${escapeAttr(item.id)}">−</button>
            <span class="cart-qty">${item.quantity}</span>
            <button type="button" data-cart-plus="${escapeAttr(item.id)}">+</button>
            <button type="button" class="cart-remove" data-cart-remove="${escapeAttr(item.id)}">Eliminar</button>
          </div></div>
        </div>`).join("");
    }
    if(wa){
      if(cart.length){ wa.classList.remove("disabled"); wa.href=`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(whatsappMessage())}`; }
      else { wa.classList.add("disabled"); wa.removeAttribute("href"); }
    }
  }
  function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
  function escapeAttr(v){return escapeHtml(v);}
  function openCart(){document.getElementById("cart-panel")?.classList.add("open");document.getElementById("cart-overlay")?.classList.add("open");}
  function closeCart(){document.getElementById("cart-panel")?.classList.remove("open");document.getElementById("cart-overlay")?.classList.remove("open");}

  document.addEventListener("click",event=>{
    const add=event.target.closest(".add-to-cart, #add-product-to-cart");
    if(add){
      const id=add.dataset.id||"", name=add.dataset.name||getCardName(add);
      let quantity=1;
      const qtyInput=document.getElementById("product-qty");
      if(add.id==="add-product-to-cart" && qtyInput) quantity=Math.max(1,parseInt(qtyInput.value,10)||1);
      if(id)addToCart({id,name,quantity});
      return;
    }
    if(event.target.closest("#open-cart")){event.preventDefault();openCart();return;}
    if(event.target.closest("#cart-close")||event.target.closest("#cart-overlay")){closeCart();return;}
    const plus=event.target.closest("[data-cart-plus]"); if(plus){changeQty(plus.dataset.cartPlus,1);return;}
    const minus=event.target.closest("[data-cart-minus]"); if(minus){changeQty(minus.dataset.cartMinus,-1);return;}
    const remove=event.target.closest("[data-cart-remove]"); if(remove)removeItem(remove.dataset.cartRemove);
  });

  renderCart();


// ====== Filtro de categorías y subcategorías ======
const params = new URLSearchParams(location.search);

const cat = (params.get("cat") || "all").toLowerCase();
const subcat = (params.get("subcat") || "all").toLowerCase();

// Activar categoría principal
document.querySelectorAll(".cat-link").forEach(a => {
  const url = new URL(a.href, location.href);
  const linkCat = (url.searchParams.get("cat") || "all").toLowerCase();

  if (linkCat === cat) {
    a.classList.add("active");
  }
});

// Filtrar productos
document.querySelectorAll(".product").forEach(card => {

  const productCat = (card.dataset.cat || "pijamas").toLowerCase();
  const productSubcat = (card.dataset.subcat || "").toLowerCase();

  // Primero comprobamos la categoría principal
  const matchesCategory =
    cat === "all" || productCat === cat;

  // La subcategoría SOLO se aplica a Pijamas
  const matchesSubcategory =
    cat !== "pijamas" ||
    subcat === "all" ||
    productSubcat === subcat;

  card.style.display =
    matchesCategory && matchesSubcategory ? "" : "none";
});

// Meta Pixel
if (typeof fbq === "function") {
  fbq("track", "ViewCategory", {
    content_category:
      subcat === "all" ? cat : `${cat}-${subcat}`
  });
}

})();