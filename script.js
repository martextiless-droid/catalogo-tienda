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


// ====== Búsqueda y filtros del catálogo ======
const params = new URLSearchParams(location.search);
const catalogGrid = document.querySelector(".products");
const searchInput = document.getElementById("catalog-search");
const categorySelect = document.getElementById("catalog-category");
const subcategorySelect = document.getElementById("catalog-subcategory");
const resultsMessage = document.getElementById("catalog-results");

function normalizeCatalogText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function catalogCards() {
  return Array.from(catalogGrid?.querySelectorAll(".product") || []);
}

function enhanceProductCards() {
  for (const card of catalogCards()) {
    const price = card.querySelector("p");
    const priceMatch = price?.textContent.match(/mayorista\s+desde\s+(.+?)(?:\s*\((\d+)\s*u\))?\s*$/i);
    if (price && priceMatch && price.dataset.priceEnhanced !== "true") {
      price.classList.add("product-price");
      price.replaceChildren();

      const unitPrice = document.createElement("span");
      unitPrice.className = "product-price-unit";
      unitPrice.textContent = priceMatch[1].trim();
      price.appendChild(unitPrice);

      const caption = document.createElement("span");
      caption.className = "product-price-caption";
      caption.textContent = "precio mayorista";
      price.appendChild(caption);
      price.dataset.priceEnhanced = "true";
    }

    const image = card.querySelector("img");
    if (!image) continue;
    let imageArea = image.closest("a");
    if (imageArea) {
      imageArea.classList.add("product-image-link");
    } else {
      imageArea = image.parentElement.closest(".product-image-wrap");
      if (!imageArea) {
        imageArea = document.createElement("span");
        imageArea.className = "product-image-wrap";
        image.parentNode.insertBefore(imageArea, image);
        imageArea.appendChild(image);
      }
    }

    const quantity = priceMatch?.[2];
    if (quantity && !imageArea.querySelector(".product-volume-badge")) {
      const badge = document.createElement("span");
      badge.className = "product-volume-badge";
      badge.setAttribute("aria-hidden", "true");
      badge.textContent = `${quantity}+ unids`;
      imageArea.appendChild(badge);
    }
  }
}

function syncCatalogOptions() {
  const knownCategories = new Set(Array.from(categorySelect.options, option => option.value));
  for (const card of catalogCards()) {
    const category = card.dataset.cat || "";
    const normalizedCategory = normalizeCatalogText(category);
    if (category && !knownCategories.has(normalizedCategory)) {
      categorySelect.add(new Option(category, normalizedCategory));
      knownCategories.add(normalizedCategory);
    }
  }

  const selectedCategory = normalizeCatalogText(categorySelect.value);
  const knownSubcategories = new Set(Array.from(subcategorySelect.options, option => option.value));
  for (const card of catalogCards()) {
    if (selectedCategory !== "all" && normalizeCatalogText(card.dataset.cat) !== selectedCategory) continue;
    const subcategory = card.dataset.subcat || "";
    const normalizedSubcategory = normalizeCatalogText(subcategory);
    if (subcategory && !knownSubcategories.has(normalizedSubcategory)) {
      subcategorySelect.add(new Option(subcategory, normalizedSubcategory));
      knownSubcategories.add(normalizedSubcategory);
    }
  }
}

function updateCatalogUrl() {
  const url = new URL(location.href);
  const category = normalizeCatalogText(categorySelect.value);
  const subcategory = normalizeCatalogText(subcategorySelect.value);
  const query = searchInput.value.trim();

  if (category === "all") url.searchParams.delete("cat");
  else url.searchParams.set("cat", category);
  if (category === "pijamas" && subcategory !== "all") url.searchParams.set("subcat", subcategory);
  else url.searchParams.delete("subcat");
  if (query) url.searchParams.set("q", query);
  else url.searchParams.delete("q");
  history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function applyCatalogFilters(updateUrl = true) {
  if (!catalogGrid || !searchInput || !categorySelect || !subcategorySelect) return;
  enhanceProductCards();
  syncCatalogOptions();

  const category = normalizeCatalogText(categorySelect.value);
  const subcategory = normalizeCatalogText(subcategorySelect.value);
  const query = normalizeCatalogText(searchInput.value);
  subcategorySelect.disabled = category !== "pijamas";

  let visibleCount = 0;
  for (const card of catalogCards()) {
    const productCategory = normalizeCatalogText(card.dataset.cat || "pijamas");
    const productSubcategory = normalizeCatalogText(card.dataset.subcat);
    const searchableText = normalizeCatalogText([
      card.querySelector("h3")?.textContent,
      card.querySelector("p")?.textContent,
      card.querySelector("img")?.alt,
    ].join(" "));
    const matchesCategory = category === "all" || productCategory === category;
    const matchesSubcategory = category !== "pijamas" || subcategory === "all" || productSubcategory === subcategory;
    const matchesQuery = !query || searchableText.includes(query);
    const visible = matchesCategory && matchesSubcategory && matchesQuery;
    card.style.display = visible ? "" : "none";
    if (visible) visibleCount += 1;
  }

  document.querySelectorAll(".cat-link").forEach(link => {
    const url = new URL(link.href, location.href);
    const linkCategory = normalizeCatalogText(url.searchParams.get("cat") || "all");
    link.classList.toggle("active", linkCategory === category);
  });

  if (resultsMessage) {
    resultsMessage.textContent = visibleCount
      ? ` ${visibleCount} producto${visibleCount === 1 ? "" : "s"} encontrado${visibleCount === 1 ? "" : "s"}.`
      : "No encontramos productos con esos criterios. Prueba otra referencia o filtro.";
    resultsMessage.classList.toggle("is-empty", visibleCount === 0);
  }

  if (updateUrl) updateCatalogUrl();
}

if (catalogGrid && categorySelect && subcategorySelect && searchInput) {
  const initialCategory = normalizeCatalogText(params.get("cat") || "all");
  const initialSubcategory = normalizeCatalogText(params.get("subcat") || "all");
  const initialQuery = params.get("q") || "";
  syncCatalogOptions();
  if (Array.from(categorySelect.options).some(option => option.value === initialCategory)) {
    categorySelect.value = initialCategory;
  }
  searchInput.value = initialQuery;
  syncCatalogOptions();
  if (Array.from(subcategorySelect.options).some(option => option.value === initialSubcategory)) {
    subcategorySelect.value = initialSubcategory;
  }

  searchInput.addEventListener("input", () => applyCatalogFilters());
  categorySelect.addEventListener("change", () => {
    if (categorySelect.value !== "pijamas") subcategorySelect.value = "all";
    syncCatalogOptions();
    applyCatalogFilters();
  });
  subcategorySelect.addEventListener("change", () => applyCatalogFilters());
  applyCatalogFilters(false);

  const catalogObserver = new MutationObserver(() => applyCatalogFilters(false));
  catalogObserver.observe(catalogGrid, { childList: true });
}

// Meta Pixel
if (typeof fbq === "function") {
  fbq("track", "ViewCategory", {
    content_category:
      normalizeCatalogText(params.get("subcat")) === "all"
        ? normalizeCatalogText(params.get("cat") || "all")
        : `${normalizeCatalogText(params.get("cat"))}-${normalizeCatalogText(params.get("subcat"))}`
  });
}

})();
