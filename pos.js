(() => {
  const SUPABASE_URL = "https://nsuxvytaogbnrlopzfgi.supabase.co";
  const SUPABASE_KEY = "sb_publishable_A61mORZLeNZ4hd4x4INGjQ_XS0U1Xap";
  const ADMIN_USER_ID = "c1fd6ad7-15be-42a6-b239-0564bb34cba5";
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const $ = id => document.getElementById(id);
  const money = value => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value) || 0);
  const safeText = value => String(value ?? "");
  const state = { products: [], prices: new Map(), classPrices: new Map(), config: new Map(), stock: new Map(), variants: new Map(), variantStock: new Map(), cart: new Map(), sales: [], report: null, selectedReturn: null, selectedCancelSale: null, cashExpected: 0, customerCredit: 0, customerLookupRequest: 0, matchedCustomerIdentity: null };

  function status(message, error = false) {
    const box = $("status");
    box.textContent = message || "";
    box.dataset.error = error ? "true" : "false";
  }
  function showView(signedIn) {
    $("login-view").hidden = signedIn;
    $("app-view").hidden = !signedIn;
    $("logout").hidden = !signedIn;
    $("user-label").textContent = signedIn ? "Sesión de administrador" : "";
  }
  async function authorizeSession(session) {
    if (!session?.user) { showView(false); return; }
    if (session.user.id !== ADMIN_USER_ID) {
      await db.auth.signOut(); showView(false);
      status("Esta cuenta no está habilitada para usar el punto de venta.", true); return;
    }
    showView(true);
    await refreshAll();
    await refreshCash();
    $("product-search").focus();
  }
  async function refreshAll() {
    status("Cargando referencias e inventario…");
    const [productResult, priceResult, classPriceResult, configResult, movementResult, variantResult] = await Promise.all([
      db.from("productos").select("id,referencia,nombre,categoria,imagen_url,imagenes_url,eliminado").eq("eliminado", false).order("referencia"),
      db.from("precios").select("producto_id,cantidad_minima,precio_unitario").order("cantidad_minima"),
      db.from("pos_producto_precios_clase").select("producto_id,nivel,precio_unitario"),
      db.from("pos_producto_config").select("producto_id,codigo_barras,costo_unitario"),
      db.from("pos_movimientos_inventario").select("producto_id,variante_id,cantidad"),
      db.from("pos_producto_variantes").select("id,producto_id,color,talla,activo").eq("activo", true)
    ]);
    const problem = [productResult, priceResult, classPriceResult, configResult, movementResult, variantResult].find(result => result.error);
    if (problem) { status(`No se pudo cargar el POS: ${problem.error.message}. Verifica que se haya instalado la migración de variantes e inventario.`, true); return; }
    state.products = productResult.data || [];
    state.prices.clear(); state.classPrices.clear(); state.config.clear(); state.stock.clear(); state.variants.clear(); state.variantStock.clear();
    for (const price of priceResult.data || []) {
      const list = state.prices.get(price.producto_id) || [];
      list.push(price); state.prices.set(price.producto_id, list);
    }
    for (const price of classPriceResult.data || []) {
      if (price.precio_unitario == null) continue;
      const levels = state.classPrices.get(price.producto_id) || {};
      levels[price.nivel] = Number(price.precio_unitario);
      state.classPrices.set(price.producto_id, levels);
    }
    for (const item of configResult.data || []) state.config.set(item.producto_id, item);
    for (const variant of variantResult.data || []) { const list=state.variants.get(variant.producto_id)||[];list.push(variant);state.variants.set(variant.producto_id,list); }
    for (const move of movementResult.data || []) { state.stock.set(move.producto_id, (state.stock.get(move.producto_id) || 0) + Number(move.cantidad)); if(move.variante_id)state.variantStock.set(move.variante_id,(state.variantStock.get(move.variante_id)||0)+Number(move.cantidad)); }
    fillProductSelects(); renderProducts(); renderCart(); renderStock(); status("");
  }
  async function refreshCash(){
    const {data,error}=await db.rpc("pos_estado_caja");
    if(error){$("cash-status").textContent=`La caja estará disponible al instalar la extensión del POS: ${error.message}`;$("cash-open-form").hidden=true;$("cash-movement-form").hidden=true;$("cash-close-form").hidden=true;return;}
    const cashInfo=data||{},box=$("cash-status");box.replaceChildren();state.cashExpected=Number(cashInfo.esperado)||0;
    const title=document.createElement("h2"),balance=document.createElement("p");
    title.textContent=cashInfo.abierta?"Caja abierta":cashInfo.tiene_caja?"Caja cerrada":"Caja sin abrir";
    balance.className="cash-balance";balance.textContent=cashInfo.tiene_caja?`Efectivo esperado: ${money(cashInfo.esperado)}`:"Abre caja e indica cuánto efectivo hay al iniciar.";
    box.append(title,balance);
    if(cashInfo.tiene_caja){const opening=document.createElement("p");opening.textContent=`Efectivo inicial: ${money(cashInfo.saldo_inicial)}${cashInfo.abierta_en?` · Apertura: ${new Date(cashInfo.abierta_en).toLocaleString("es-CO")}`:""}`;box.append(opening);}
    if(!cashInfo.abierta&&cashInfo.tiene_caja){const closing=document.createElement("p");closing.textContent=`Último cierre: ${money(cashInfo.efectivo_contado)} · Diferencia: ${money(cashInfo.diferencia)}`;box.append(closing);}
    $("cash-open-form").hidden=Boolean(cashInfo.abierta);$("cash-movement-form").hidden=!cashInfo.abierta;$("cash-close-form").hidden=!cashInfo.abierta;
    const list=$("cash-movements");list.replaceChildren();
    for(const movement of cashInfo.movimientos||[]){const card=document.createElement("article");card.className="sale-card";const row=document.createElement("div");row.className="sale-summary";const label=document.createElement("strong");label.textContent=movement.tipo==="venta"?`Venta ${movement.venta_id||""}`:movement.tipo==="abono_cliente"?"Abono de cliente":movement.tipo==="apertura"?"Efectivo inicial":movement.tipo==="retiro"?"Retiro de caja":"Ingreso de caja";const value=document.createElement("strong");value.textContent=`${movement.direccion==="egreso"?"−":"+"}${money(movement.monto)}`;const date=document.createElement("small");date.textContent=new Date(movement.creado_en).toLocaleString("es-CO");row.append(label,value,date);card.append(row);if(movement.nota){const note=document.createElement("p");note.textContent=movement.nota;card.append(note);}list.append(card);}
    if(cashInfo.abierta){$("cash-counted-amount").value=String(Math.max(0,Number(cashInfo.esperado)||0));$("cash-close-difference").textContent="Ingresa el efectivo contado; se comparará con el saldo esperado.";}
  }
  async function openCash(event){event.preventDefault();const amount=Number($("cash-opening-amount").value);const {error}=await db.rpc("pos_abrir_caja",{p_saldo_inicial:amount});if(error){status(`No se pudo abrir caja: ${error.message}`,true);return;}$("cash-open-form").reset();await refreshCash();status("Caja abierta con el efectivo inicial registrado.");}
  async function saveCashMovement(event){event.preventDefault();const tipo=$("cash-movement-type").value,monto=Number($("cash-movement-amount").value),nota=$("cash-movement-note").value.trim();const {error}=await db.rpc("pos_registrar_movimiento_caja",{p_tipo:tipo,p_monto:monto,p_nota:nota});if(error){status(`No se pudo guardar el movimiento: ${error.message}`,true);return;}$("cash-movement-form").reset();await refreshCash();status(tipo==="retiro"?"Retiro registrado en caja.":"Ingreso registrado en caja.");}
  async function closeCash(event){event.preventDefault();const amount=Number($("cash-counted-amount").value);if(!window.confirm(`¿Cerrar caja con ${money(amount)} contados físicamente?`))return;const {data,error}=await db.rpc("pos_cerrar_caja",{p_efectivo_contado:amount});if(error){status(`No se pudo cerrar caja: ${error.message}`,true);return;}await refreshCash();status(`Caja cerrada. Diferencia: ${money(data?.diferencia)}.`);}
  function picture(product, className = "") {
    const url = product.imagen_url || product.imagenes_url?.[0];
    if (url) { const img = document.createElement("img"); img.src = url; img.alt = ""; img.loading = "lazy"; if (className) img.className = className; return img; }
    const empty = document.createElement("div"); empty.className = `product-placeholder ${className}`.trim(); empty.textContent = "Sin foto"; return empty;
  }
  function priceFor(product, quantity = 1, level = $("customer-price-level").value) {
    const classPrice = level ? state.classPrices.get(product.id)?.[level] : null;
    if (level) return Number.isFinite(classPrice) ? classPrice : 0;
    const tiers = state.prices.get(product.id) || [];
    if (!tiers.length) return 0;
    return Number([...tiers].sort((a,b) => Number(a.cantidad_minima)-Number(b.cantidad_minima)).filter(t => Number(t.cantidad_minima) <= quantity).at(-1)?.precio_unitario ?? tiers[0].precio_unitario);
  }
  function findProduct(term) {
    const clean = term.trim().toLocaleLowerCase("es");
    if (!clean) return null;
    const barcodeMatch = state.products.find(product => state.config.get(product.id)?.codigo_barras?.trim() === term.trim());
    if (barcodeMatch) return barcodeMatch;
    return state.products.find(product => String(product.referencia || "").toLocaleLowerCase("es") === clean)
      || state.products.find(product => String(product.nombre || "").toLocaleLowerCase("es") === clean);
  }
  function renderProducts() {
    const list = $("product-list"), term = $("product-search").value.trim().toLocaleLowerCase("es");
    list.replaceChildren();
    const matches = state.products.filter(product => {
      const config = state.config.get(product.id);
      const haystack = [product.referencia, product.nombre, product.categoria, config?.codigo_barras].join(" ").toLocaleLowerCase("es");
      return !term || haystack.includes(term);
    }).slice(0, 100);
    if (!matches.length) { list.innerHTML = '<p class="empty">No encontramos referencias con esa búsqueda.</p>'; return; }
    for (const product of matches) {
      const card = document.createElement("article"); card.className = "product-card";
      card.append(picture(product));
      const details = document.createElement("div");
      const name = document.createElement("strong"); name.textContent = `Ref ${product.referencia || product.id}`;
      const description = document.createElement("small"); description.textContent = product.nombre || product.categoria || "Producto";
      const stock = document.createElement("small"); stock.textContent = `Disponible: ${state.stock.get(product.id) || 0}`;
      details.append(name, description, stock); card.append(details);
      const variants=state.variants.get(product.id)||[];let selectedVariant=null;
      if(variants.length){const select=document.createElement("select");select.className="product-variant-select";select.setAttribute("aria-label",`Color o talla para referencia ${product.referencia}`);select.add(new Option("Selecciona color / talla",""));for(const variant of variants){const available=state.variantStock.get(variant.id)||0;const label=[variant.color,variant.talla].filter(Boolean).join(" · ");select.add(new Option(`${label} · ${available} disponibles`,String(variant.id)));}card.append(select);}
      const add = document.createElement("button"); add.type = "button"; add.className = "add-product";
      add.textContent = "+ Agregar al carrito";
      const refreshButton=()=>{const id=Number(card.querySelector(".product-variant-select")?.value)||null;selectedVariant=variants.find(item=>item.id===id)||null;const key=cartKey(product,selectedVariant),available=selectedVariant?(state.variantStock.get(selectedVariant.id)||0):(state.stock.get(product.id)||0);add.disabled=available<=(state.cart.get(key)?.quantity||0);add.textContent=state.cart.has(key)?"Agregado · toca para sumar":"+ Agregar al carrito";};
      card.querySelector(".product-variant-select")?.addEventListener("change",refreshButton);add.addEventListener("click",()=>{if(variants.length&&!selectedVariant){status(`Selecciona color o talla para Ref ${product.referencia}.`,true);return;}addToCart(product,selectedVariant);});refreshButton();card.append(add); list.append(card);
    }
  }
  function cartKey(product,variant=null){return `${product.id}:${variant?.id||0}`;}
  function addToCart(product,variant=null) {
    const key=cartKey(product,variant),available=variant?(state.variantStock.get(variant.id)||0):(state.stock.get(product.id)||0),current=state.cart.get(key);
    if ((current?.quantity || 0) >= available) { status(`No hay más unidades disponibles para la referencia ${product.referencia}.`, true); return; }
    if (current) current.quantity += 1;
    else state.cart.set(key, { product, variant, quantity: 1, unitPrice: priceFor(product, 1), manualPrice: false });
    renderCart(); renderProducts(); $("product-search").focus();
  }
  function setQuantity(id, next) {
    const item = state.cart.get(id); if (!item) return;
    const available = item.variant?(state.variantStock.get(item.variant.id)||0):(state.stock.get(item.product.id)||0);
    item.quantity = Math.max(0, Math.min(available, Math.floor(next) || 0));
    if (!item.quantity) state.cart.delete(id);
    else if (!item.manualPrice) item.unitPrice = priceFor(item.product, item.quantity);
    renderCart(); renderProducts();
  }
  function totals() { return [...state.cart.values()].reduce((sum, item) => sum + item.quantity * item.unitPrice, 0); }
  function renderCart() {
    const list = $("cart-items"); list.replaceChildren();
    if (!state.cart.size) { const empty=document.createElement("p"); empty.className="empty"; empty.textContent="Toca una referencia para agregarla."; list.append(empty); }
    for (const [id,item] of state.cart) {
      const row=document.createElement("div"); row.className="cart-row"; row.append(picture(item.product));
      const info=document.createElement("div"), name=document.createElement("div"), meta=document.createElement("div"); name.className="cart-name"; name.textContent=`Ref ${item.product.referencia}${item.variant?` · ${[item.variant.color,item.variant.talla].filter(Boolean).join(" · ")}`:""}`; meta.className="cart-meta"; meta.textContent=`${money(item.quantity*item.unitPrice)} total`;
      const price=document.createElement("input"); price.className="price-input"; price.type="number"; price.min="0"; price.step="1"; price.inputMode="decimal"; price.setAttribute("aria-label",`Precio por unidad para ${item.product.referencia}`); price.value=String(item.unitPrice); price.addEventListener("change",()=>{item.unitPrice=Math.max(0,Number(price.value)||0);item.manualPrice=true;renderCart();});
      const remove=document.createElement("button"); remove.type="button"; remove.className="delete-item"; remove.textContent="Quitar"; remove.addEventListener("click",()=>setQuantity(id,0));
      info.append(name,meta,price,remove); row.append(info);
      const controls=document.createElement("div"); controls.className="qty-controls";
      const minus=document.createElement("button"); minus.type="button"; minus.setAttribute("aria-label","Restar unidad"); minus.textContent="−"; minus.addEventListener("click",()=>setQuantity(id,item.quantity-1));
      const qty=document.createElement("span"); qty.textContent=String(item.quantity);
      const plus=document.createElement("button"); plus.type="button"; plus.setAttribute("aria-label","Sumar unidad"); plus.textContent="+"; plus.disabled=item.quantity >= (item.variant?(state.variantStock.get(item.variant.id)||0):(state.stock.get(item.product.id)||0)); plus.addEventListener("click",()=>setQuantity(id,item.quantity+1));
      controls.append(minus,qty,plus); row.append(controls); list.append(row);
    }
    $("cart-count").textContent=String([...state.cart.values()].reduce((n,item)=>n+item.quantity,0));
    $("sale-total").textContent=money(totals()); updatePaymentSummary();
  }
  function addPaymentRow(data = {}) {
    const row=document.createElement("div"); row.className="payment-row";
    const method=document.createElement("select"); method.className="payment-kind"; method.innerHTML='<option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option><option value="otro">Otro</option>'; method.value=data.medio||"efectivo";
    const amount=document.createElement("input"); amount.type="number"; amount.min="0"; amount.step="1"; amount.inputMode="decimal"; amount.placeholder="Valor pagado"; amount.className="payment-amount"; amount.value=data.valor||"";
    const received=document.createElement("input"); received.type="number"; received.min="0"; received.step="1"; received.inputMode="decimal"; received.placeholder="Efectivo recibido"; received.className="cash-received"; received.value=data.valor_recibido||"";
    const bank=document.createElement("select"); bank.className="transfer-bank"; bank.setAttribute("aria-label","Banco o billetera de la transferencia"); bank.innerHTML='<option value="">Seleccionar banco o billetera</option><option>Bancolombia</option><option>Banco de Bogotá</option><option>Davivienda</option><option>BBVA</option><option>Banco de Occidente</option><option>Banco Caja Social</option><option>Banco Agrario</option><option>Nu</option><option>Nequi</option><option>Daviplata</option><option>Otro</option>'; bank.value=data.banco||"";
    const reference=document.createElement("input"); reference.placeholder="Número de comprobante"; reference.className="transfer-reference"; reference.value=data.referencia_pago||"";
    const fields=document.createElement("div"); fields.className="transfer-fields"; fields.append(bank,reference);
    const cashLabel=document.createElement("label"); cashLabel.textContent="Recibido en efectivo"; cashLabel.className="cash-label"; cashLabel.append(received);
    const amountLabel=document.createElement("label"); amountLabel.textContent="Valor pagado"; amountLabel.className="payment-amount-label"; amountLabel.append(amount);
    const methodLabel=document.createElement("label"); methodLabel.textContent="Forma de pago"; methodLabel.append(method);
    const remove=document.createElement("button"); remove.type="button"; remove.className="remove-payment"; remove.setAttribute("aria-label","Quitar medio de pago"); remove.textContent="×"; remove.addEventListener("click",()=>{row.remove();updatePaymentSummary();});
    row.append(methodLabel,amountLabel,cashLabel,fields,remove);
    method.addEventListener("change",()=>{cashLabel.hidden=method.value!=="efectivo";amountLabel.hidden=method.value==="efectivo";fields.hidden=method.value!=="transferencia";updatePaymentSummary();});
    amount.addEventListener("input",updatePaymentSummary); received.addEventListener("input",updatePaymentSummary);
    cashLabel.hidden=method.value!=="efectivo"; amountLabel.hidden=method.value==="efectivo"; fields.hidden=method.value!=="transferencia";
    $("payment-rows").append(row); updatePaymentSummary();
  }
  function paymentData() {
    const rows=[...document.querySelectorAll(".payment-row")].map(row=>{const medio=row.querySelector(".payment-kind").value;return {medio,monto:medio==="efectivo"?(Number(row.querySelector(".cash-received").value)||0):(Number(row.querySelector(".payment-amount").value)||0),banco:row.querySelector(".transfer-bank").value.trim(),referencia_pago:row.querySelector(".transfer-reference").value.trim()};});
    const total=totals(), noCash=rows.filter(p=>p.medio!=="efectivo");
    let remaining=total;
    const cash=rows.filter(p=>p.medio==="efectivo");
    const applied=new Map();
    for(const payment of noCash){const valor=Math.min(payment.monto,remaining);remaining-=valor;applied.set(payment,valor);}
    for(const payment of cash){const valor=Math.min(payment.monto,remaining);remaining-=valor;applied.set(payment,valor);}
    return rows.map(p=>({medio:p.medio,valor:applied.get(p)||0,valor_recibido:p.medio==="efectivo"?p.monto:undefined,banco:p.banco,referencia_pago:p.referencia_pago})).filter(p=>p.valor>0);
  }
  function updatePaymentSummary() {
    const rows=[...document.querySelectorAll(".payment-row")], payments=paymentData(), paid=payments.reduce((sum,p)=>sum+p.valor,0), total=totals();
    $("paid-total").textContent=money(paid);
    const creditApplied=Math.min(state.customerCredit,Math.max(0,total-paid));
    $("credit-applied").textContent=money(creditApplied);
    const remainingDue=Math.max(0,total-paid-creditApplied);
    const balance=$("payment-balance");
    balance.textContent=remainingDue<=.01?"Pago completo":`Falta ${money(remainingDue)}`;
    balance.style.color=remainingDue<=.01?"#087d5c":"";
    const enteredNonCash=rows.filter(row=>row.querySelector(".payment-kind").value!=="efectivo").reduce((sum,row)=>sum+(Number(row.querySelector(".payment-amount").value)||0),0);
    const enteredCash=rows.filter(row=>row.querySelector(".payment-kind").value==="efectivo").reduce((sum,row)=>sum+(Number(row.querySelector(".cash-received").value)||0),0);
    const appliedCash=payments.filter(p=>p.medio==="efectivo").reduce((sum,p)=>sum+p.valor,0);
    const change=Math.max(0,enteredCash-appliedCash);
    $("change-return").textContent=money(change);
    const overpaidNonCash=enteredNonCash>total;
    const missingTransfer=payments.some(p=>p.medio==="transferencia"&&(!p.banco||!p.referencia_pago));
    if(overpaidNonCash){balance.textContent="Los pagos que no son efectivo superan el total; corrige los valores.";balance.style.color="#b42318";$("change-return").textContent=money(0);}
    $("complete-sale").disabled=!state.cart.size||remainingDue>.01||missingTransfer||overpaidNonCash;
  }
  function fillProductSelects() {
    for (const select of [$("stock-product"),$("config-product"),$("adjust-stock-product"),$("variant-product")]) {
      const previous=select.value; select.replaceChildren(new Option("Selecciona una referencia",""));
      for (const p of state.products) select.add(new Option(`Ref ${p.referencia} — ${p.nombre||"Producto"}`,String(p.id)));
      if (previous) select.value=previous;
    }
    loadConfigFields();loadVariantEditor();fillVariantSelects();
  }
  function fillVariantSelects(){
    for(const [productId,variantId,fieldId] of [["stock-product","stock-variant","stock-variant-field"],["adjust-stock-product","adjust-stock-variant","adjust-variant-field"]]){
      const product=Number($(productId).value),variants=state.variants.get(product)||[],select=$(variantId),previous=select.value;select.replaceChildren(new Option("Selecciona color / talla",""));
      for(const variant of variants){const label=[variant.color,variant.talla].filter(Boolean).join(" · "),stock=state.variantStock.get(variant.id)||0;select.add(new Option(`${label} · ${stock} disponibles`,String(variant.id)));}
      $(fieldId).hidden=!variants.length;if(previous&&variants.some(item=>String(item.id)===previous))select.value=previous;else if(variants.length===1)select.value=String(variants[0].id);
    }
  }
  function renderStock() {
    const term=$("stock-search").value.trim().toLocaleLowerCase("es"), container=$("stock-list"); container.replaceChildren();
    const products=state.products.filter(p=>`${p.referencia} ${p.nombre} ${p.categoria}`.toLocaleLowerCase("es").includes(term)),groups=new Map();
    for(const product of products){const key=product.categoria||"Sin categoría",items=groups.get(key)||[];items.push(product);groups.set(key,items);}
    for(const [category,items] of groups){const group=document.createElement("details");group.className="inventory-category";const summary=document.createElement("summary");summary.textContent=`${category} · ${items.length} referencia${items.length===1?"":"s"}`;group.append(summary);
      for(const p of items){const row=document.createElement("div");row.className="inventory-row";const desc=document.createElement("div");const strong=document.createElement("strong");strong.textContent=`Ref ${p.referencia}`;const small=document.createElement("small");small.textContent=p.nombre||p.categoria||"";desc.append(strong,small);const stock=document.createElement("strong");stock.className="stock-value";stock.textContent=`${state.stock.get(p.id)||0} unid.`;const code=document.createElement("small");const variants=state.variants.get(p.id)||[];code.textContent=variants.length?`${variants.length} colores / tallas`:state.config.get(p.id)?.codigo_barras?"Código asignado":"Sin código";const actions=document.createElement("div");actions.className="inventory-actions";const edit=document.createElement("button");edit.type="button";edit.className="btn btn-small btn-secondary";edit.textContent="Modificar";edit.addEventListener("click",()=>{$("config-product").value=String(p.id);loadConfigFields();$("config-form").scrollIntoView({behavior:"smooth",block:"center"});$("config-name").focus();});const variantsButton=document.createElement("button");variantsButton.type="button";variantsButton.className="btn btn-small btn-secondary";variantsButton.textContent="Colores / tallas";variantsButton.addEventListener("click",()=>{$("variant-product").value=String(p.id);loadVariantEditor();$("configure-variants").open=true;$("configure-variants").scrollIntoView({behavior:"smooth",block:"center"});});const adjust=document.createElement("button");adjust.type="button";adjust.className="btn btn-small btn-secondary";adjust.textContent="Ajustar stock";adjust.addEventListener("click",()=>{$("adjust-stock-product").value=String(p.id);fillVariantSelects();if(!variants.length){$("adjust-stock-count").value=String(state.stock.get(p.id)||0);}else if(variants.length===1){$("adjust-stock-variant").value=String(variants[0].id);$("adjust-stock-count").value=String(state.variantStock.get(variants[0].id)||0);}$("adjust-stock-reason").value="";$("adjust-stock-form").scrollIntoView({behavior:"smooth",block:"center"});$("adjust-stock-reason").focus();});const retire=document.createElement("button");retire.type="button";retire.className="btn btn-small btn-danger";retire.textContent="Retirar";retire.addEventListener("click",()=>retireReference(p));actions.append(edit,variantsButton,adjust,retire);row.append(desc,stock,code,actions);group.append(row);
        for(const variant of variants){const vrow=document.createElement("div");vrow.className="inventory-variant-row";vrow.textContent=`↳ ${[variant.color,variant.talla].filter(Boolean).join(" · ")} — ${state.variantStock.get(variant.id)||0} unidades`;group.append(vrow);}
      }container.append(group);
    }
    if(!products.length){const empty=document.createElement("p");empty.className="empty";empty.textContent="No hay referencias para mostrar.";container.append(empty);}
  }
  function loadVariantEditor(){const id=Number($("variant-product").value),variants=state.variants.get(id)||[];let mode="ninguno";if(variants.length){const colors=variants.some(item=>item.color),sizes=variants.some(item=>item.talla);mode=colors&&sizes?"color_talla":colors?"color":"talla";}
    $("variant-mode").value=mode;$("variant-edit-fields").hidden=mode==="ninguno";$("variants-input").value=variants.map(item=>`${item.color||""} | ${item.talla||""} | ${state.variantStock.get(item.id)||0}`).join("\n");
  }
  function parseVariantLines(text,mode){const raw=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean),items=raw.map((line,index)=>{const parts=line.split("|").map(part=>part.trim()),color=parts[0]||"",talla=parts[1]||"",cantidad=Number(parts[2]||0);if(parts.length>3||!Number.isInteger(cantidad)||cantidad<0)throw new Error(`Revisa la línea ${index+1}; usa color | talla | unidades enteras.`);if(mode==="color"&&(!color||talla)||mode==="talla"&&(!talla||color)||mode==="color_talla"&&(!color||!talla))throw new Error(`Completa los campos de color/talla según el tipo seleccionado (línea ${index+1}).`);return {color:color||null,talla:talla||null,cantidad};}).filter(item=>item.color||item.talla);const keys=new Set();for(const item of items){const key=`${(item.color||"").toLocaleLowerCase("es")}::${(item.talla||"").toLocaleLowerCase("es")}`;if(keys.has(key))throw new Error("Hay una combinación de color/talla repetida.");keys.add(key);}return items;}
  function loadConfigFields(){const id=Number($("config-product").value),product=state.products.find(item=>item.id===id),cfg=state.config.get(id),prices=state.classPrices.get(id)||{};$("config-name").value=product?.nombre||"";$("config-category").value=product?.categoria||"";$("barcode").value=cfg?.codigo_barras||"";$("unit-cost").value=cfg?.costo_unitario??"";for(const level of ["A","B","C","D","E"])$(`edit-price-${level.toLowerCase()}`).value=prices[level]??"";}
  async function submitSale(){
    const items=[...state.cart.values()].map(item=>({producto_id:item.product.id,variante_id:item.variant?.id||null,cantidad:item.quantity,precio_unitario:item.unitPrice}));
    const payments=paymentData(); if(!items.length){status("Agrega productos al carrito.",true);return;}
    const button=$("complete-sale");button.disabled=true;button.textContent="Guardando venta…";
    const client={nombre:$("customer-name").value.trim(),documento:$("customer-document").value.trim(),telefono:$("customer-phone").value.trim(),ciudad:$("customer-city").value.trim(),barrio:$("customer-neighborhood").value.trim(),direccion:$("customer-address").value.trim()};
    const level=$("customer-price-level").value||null;
    const deliveryType=$("delivery-type").value, selectedCarrier=$("carrier-name").value;
    const delivery={tipo:deliveryType,transportadora:selectedCarrier==="Otra"?$("carrier-other").value.trim():selectedCarrier,guia:$("tracking-number").value.trim()};
    if(["transportadora","domicilio"].includes(deliveryType)&&(!client.ciudad||!client.direccion)){status("Para la entrega, indica ciudad y dirección.",true);button.disabled=false;button.textContent="Confirmar venta";return;}
    if(deliveryType==="transportadora"&&!delivery.transportadora){status("Selecciona o escribe la transportadora.",true);button.disabled=false;button.textContent="Confirmar venta";return;}
    let {data,error}=await db.rpc("pos_registrar_venta_detallada",{p_items:items,p_pagos:payments,p_cliente:client,p_nivel_precio:level,p_observacion:$("sale-note").value.trim()||null,p_entrega:delivery});
    let legacySave=false;
    if(error?.code==="PGRST202"&&deliveryType==="recoge_cliente"){
      const legacy=await db.rpc("pos_registrar_venta",{p_items:items,p_pagos:payments,p_cliente:client,p_nivel_precio:level,p_observacion:$("sale-note").value.trim()||null});
      data=legacy.data;error=legacy.error;legacySave=!error;
    }
    button.textContent="Confirmar venta";
    if(error){const detail=error.code==="PGRST202"?"Instala primero la extensión del POS para guardar los datos de entrega y vincular el cliente.":error.message;status(`No se registró la venta: ${detail}`,true);updatePaymentSummary();return;}
    const lines=[...state.cart.values()].map(item=>({reference:item.product.referencia,name:item.product.nombre,variant:item.variant?{color:item.variant.color,talla:item.variant.talla}:null,quantity:item.quantity,price:item.unitPrice}));
    showReceipt(data.numero,lines,totals(),payments,{client,level,delivery,creditApplied:Number(data.saldo_aplicado)||0,creditRemaining:Number(data.saldo_favor_restante)||0,change:Math.max(0,[...document.querySelectorAll(".payment-row")].filter(row=>row.querySelector(".payment-kind").value==="efectivo").reduce((sum,row)=>sum+(Number(row.querySelector(".cash-received").value)||0),0)-payments.filter(payment=>payment.medio==="efectivo").reduce((sum,payment)=>sum+payment.valor,0))});
    state.cart.clear();$("payment-rows").replaceChildren();addPaymentRow();state.customerLookupRequest++;state.matchedCustomerIdentity=null;$("customer-name").value="";$("customer-document").value="";$("customer-phone").value="";$("customer-city").value="";$("customer-neighborhood").value="";$("customer-address").value="";$("customer-price-level").value="";$("customer-match").textContent="";state.customerCredit=0;$("customer-credit").textContent=`Saldo a favor disponible: ${money(0)}`;$("delivery-type").value="recoge_cliente";$("carrier-name").value="";$("carrier-other").value="";$("tracking-number").value="";toggleDeliveryFields();$("sale-note").value="";
    await refreshAll();await refreshCash();status(legacySave?`Venta ${data.numero} guardada e inventario actualizado. La extensión para guardar ficha del cliente y entrega aún no está instalada.`:`Venta ${data.numero} guardada. El inventario se actualizó.`);
    $("receipt-dialog").showModal();
  }
  function showReceipt(number,lines,total,payments,context={}){
    const box=$("receipt");box.replaceChildren();
    const h=document.createElement("h2");h.className="receipt-logo";h.textContent="MarTextiles";
    const p=document.createElement("p");p.textContent="COMPROBANTE INTERNO DE VENTA";
    const num=document.createElement("p");num.textContent=number;box.append(h,p,num);
    const created=document.createElement("p");created.textContent=new Date(context.createdAt||Date.now()).toLocaleString("es-CO");box.append(created);
    if(context.cancelled){const cancelled=document.createElement("strong");cancelled.className="receipt-cancelled";cancelled.textContent="VENTA ANULADA · COPIA DE CONSULTA";box.append(cancelled);}
    if(context.client?.nombre){const customer=document.createElement("p");customer.textContent=`Cliente: ${context.client.nombre}${context.client.documento?` · CC/NIT ${context.client.documento}`:""}`;box.append(customer);}
    if(context.client?.direccion){const address=document.createElement("p");address.textContent=`Entrega: ${context.client.direccion}${context.client.barrio?` · ${context.client.barrio}`:""}${context.client.ciudad?` · ${context.client.ciudad}`:""}`;box.append(address);}
    if(context.delivery?.tipo){const delivery=document.createElement("p");delivery.textContent=context.delivery.tipo==="transportadora"?`Transportadora: ${context.delivery.transportadora||""}${context.delivery.guia?` · Guía ${context.delivery.guia}`:""}`:context.delivery.tipo==="domicilio"?"Entrega a domicilio":"Recoge el cliente";box.append(delivery);}
    box.append(document.createElement("hr"));
    for(const item of lines){
      const line=document.createElement("div");line.className="receipt-line";
      const left=document.createElement("span");left.textContent=`${item.quantity} x Ref ${item.reference}${item.variant?` · ${[item.variant.color,item.variant.talla].filter(Boolean).join(" · ")}`:""} · ${money(item.price)} c/u`;
      const right=document.createElement("span");right.textContent=money(item.quantity*item.price);
      line.append(left,right);box.append(line);
    }
    box.append(document.createElement("hr"));
    const appliedCredit=Number(context.creditApplied??payments.filter(payment=>payment.medio==="saldo_favor").reduce((sum,payment)=>sum+Number(payment.valor||0),0))||0;
    const totalDue=Math.max(0,Number(total)-appliedCredit);
    const sum=document.createElement("div");sum.className="receipt-line";
    const label=document.createElement("strong");label.textContent="TOTAL COMPRA";
    const value=document.createElement("strong");value.textContent=money(total);sum.append(label,value);box.append(sum);
    if(appliedCredit>0){const credit=document.createElement("div");credit.className="receipt-line";const creditLabel=document.createElement("span");creditLabel.textContent="Menos saldo a favor aplicado";const creditValue=document.createElement("span");creditValue.textContent=`− ${money(appliedCredit)}`;credit.append(creditLabel,creditValue);box.append(credit);}
    const dueLine=document.createElement("div");dueLine.className="receipt-line";const dueLabel=document.createElement("strong");dueLabel.textContent="TOTAL A PAGAR";const dueValue=document.createElement("strong");dueValue.textContent=money(totalDue);dueLine.append(dueLabel,dueValue);box.append(dueLine);
    const actualPayments=payments.filter(payment=>payment.medio!=="saldo_favor");
    for(const payment of actualPayments){const line=document.createElement("p");line.textContent=`${payment.medio}${payment.banco?` · ${payment.banco}`:""}: ${money(payment.valor)}${payment.medio==="transferencia"&&payment.referencia_pago?` · ${payment.referencia_pago}`:""}`;box.append(line);}
    const paidNow=actualPayments.reduce((sum,payment)=>sum+Number(payment.valor||0),0),pending=Math.max(0,totalDue-paidNow);
    if(pending>0){const line=document.createElement("div");line.className="receipt-line";const pendingLabel=document.createElement("strong");pendingLabel.textContent="PENDIENTE";const pendingValue=document.createElement("strong");pendingValue.textContent=money(pending);line.append(pendingLabel,pendingValue);box.append(line);}
    if(context.creditRemaining>0){const line=document.createElement("p");line.textContent=`${context.creditRemainingLabel||"Saldo a favor disponible después de esta compra"}: ${money(context.creditRemaining)}`;box.append(line);}
    if(context.change){const line=document.createElement("div");line.className="receipt-line";const label=document.createElement("strong");label.textContent="Cambio devuelto";const amount=document.createElement("strong");amount.textContent=money(context.change);line.append(label,amount);box.append(line);}
    const foot=document.createElement("p");foot.className="receipt-foot";foot.textContent="Gracias por tu compra";box.append(foot);applyReceiptSettings();
  }
  async function submitStock(event){event.preventDefault();const id=Number($("stock-product").value),quantity=Number($("stock-quantity").value),variants=state.variants.get(id)||[];if(!id||quantity<1)return;let result;if(variants.length){const variantId=Number($("stock-variant").value);if(!variantId){status("Selecciona el color o la talla que recibiste.",true);return;}result=await db.rpc("pos_registrar_movimiento_variante",{p_producto_id:id,p_variante_id:variantId,p_tipo:"entrada",p_cantidad:quantity,p_nota:$("stock-note").value.trim()||null});}else result=await db.rpc("pos_registrar_entrada",{p_producto_id:id,p_cantidad:quantity,p_nota:$("stock-note").value.trim()||null});const {data,error}=result;if(error){status(`No se pudo registrar la entrada: ${error.message}`,true);return;}$("stock-form").reset();await refreshAll();status(`Entrada registrada para Ref ${data.referencia}${data.color||data.talla?` · ${[data.color,data.talla].filter(Boolean).join(" · ")}`:""}. Existencia: ${data.existencia} unidades.`);}
  async function createReference(event){
    event.preventDefault();const button=$("new-reference-form").querySelector('[type="submit"]');button.disabled=true;button.textContent="Creando referencia…";
    const prices={A:Number($("new-ref-price-a").value),B:Number($("new-ref-price-b").value),C:Number($("new-ref-price-c").value),D:Number($("new-ref-price-d").value),E:Number($("new-ref-price-e").value)},mode=$("new-variant-mode").value;
    let variants=[];try{if(mode!=="ninguno")variants=parseVariantLines($("new-variants-input").value,mode);}catch(error){button.disabled=false;button.textContent="Crear referencia y cargar inventario";status(error.message,true);return;}
    const {data,error}=await db.rpc("pos_crear_referencia_con_variantes",{p_referencia:$("new-ref-code").value.trim(),p_nombre:$("new-ref-name").value.trim(),p_categoria:$("new-ref-category").value,p_costo:Number($("new-ref-cost").value),p_cantidad_inicial:mode==="ninguno"?Number($("new-ref-quantity").value):0,p_codigo_barras:$("new-ref-barcode").value.trim()||null,p_precios:prices,p_modo:mode,p_variantes:variants});
    button.disabled=false;button.textContent="Crear referencia y cargar inventario";
    if(error){status(`No se pudo crear la referencia: ${error.message}`,true);return;}
    $("new-reference-form").reset();$("new-ref-quantity").value="0";$("new-ref-quantity").disabled=false;$("new-variant-mode").value="ninguno";$("new-variant-fields").hidden=true;$("new-quantity-field").hidden=false;$("new-reference").open=false;await refreshAll();
    const id=String(data?.producto_id||"");if(id){$("stock-product").value=id;$("config-product").value=id;loadConfigFields();}
    status(`Referencia ${data?.referencia||"nueva"} creada. Inventario inicial: ${Number(data?.existencia)||0} unidades. Agrega fotos y completa la ficha desde Administración cuando quieras.`);
  }
  async function saveConfig(event){event.preventDefault();const id=Number($("config-product").value);if(!id){status("Selecciona una referencia.",true);return;}const prices={A:Number($("edit-price-a").value),B:Number($("edit-price-b").value),C:Number($("edit-price-c").value),D:Number($("edit-price-d").value),E:Number($("edit-price-e").value)};const {error}=await db.rpc("pos_actualizar_referencia",{p_producto_id:id,p_nombre:$("config-name").value.trim(),p_categoria:$("config-category").value,p_codigo_barras:$("barcode").value.trim()||null,p_costo:Number($("unit-cost").value),p_precios:prices});if(error){status(`No se pudieron guardar los cambios: ${error.message}`,true);return;}await refreshAll();$("config-product").value=String(id);loadConfigFields();status("Referencia actualizada. El código se conservó para mantener agrupado su historial.");}
  async function saveVariants(event){event.preventDefault();const id=Number($("variant-product").value),mode=$("variant-mode").value;if(!id){status("Selecciona una referencia.",true);return;}let variants=[];try{if(mode!=="ninguno")variants=parseVariantLines($("variants-input").value,mode);}catch(error){status(error.message,true);return;}const {data,error}=await db.rpc("pos_guardar_variantes",{p_producto_id:id,p_modo:mode,p_variantes:variants,p_motivo:"Configuración y conteo de variantes desde Inventario"});if(error){status(`No se pudieron guardar las variantes: ${error.message}`,true);return;}await refreshAll();$("variant-product").value=String(id);loadVariantEditor();status(`Variantes guardadas para Ref ${data.referencia}. Existencia total: ${data.existencia} unidades.`);}
  async function adjustStock(event){event.preventDefault();const id=Number($("adjust-stock-product").value),count=Number($("adjust-stock-count").value),reason=$("adjust-stock-reason").value.trim(),variants=state.variants.get(id)||[];if(!id||!Number.isInteger(count)||count<0||!reason){status("Selecciona referencia, cantidad contada y motivo.",true);return;}let result;if(variants.length){const variantId=Number($("adjust-stock-variant").value);if(!variantId){status("Selecciona el color o talla que contaste.",true);return;}result=await db.rpc("pos_registrar_movimiento_variante",{p_producto_id:id,p_variante_id:variantId,p_tipo:"ajuste",p_cantidad:count,p_nota:reason});}else result=await db.rpc("pos_ajustar_inventario",{p_producto_id:id,p_existencia_contada:count,p_motivo:reason});const {data,error}=result;if(error){status(`No se pudo ajustar el inventario: ${error.message}`,true);return;}$("adjust-stock-form").reset();await refreshAll();status(`Ajuste guardado para Ref ${data.referencia}${data.color||data.talla?` · ${[data.color,data.talla].filter(Boolean).join(" · ")}`:""}: ${data.diferencia>0?"+":""}${data.diferencia} unidades. Existencia: ${data.existencia}.`);}
  async function retireReference(product){const stock=state.stock.get(product.id)||0;if(stock!==0){status(`No se puede retirar Ref ${product.referencia}: primero deja sus existencias en cero mediante un ajuste con motivo.`,true);return;}if(!window.confirm(`¿Retirar Ref ${product.referencia} del inventario activo? Se conservarán sus ventas e historial.`))return;const {error}=await db.rpc("pos_retirar_referencia",{p_producto_id:product.id});if(error){status(`No se pudo retirar la referencia: ${error.message}`,true);return;}await refreshAll();status(`Ref ${product.referencia} retirada. Su historial se conserva y ya no aparecerá en ventas nuevas.`);}
  function parseCsv(text){
    const firstLine=text.split(/\r?\n/,1)[0]||"";const delimiter=(firstLine.match(/;/g)||[]).length>(firstLine.match(/,/g)||[]).length?";":",";const rows=[];let row=[],cell="",quoted=false;
    for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'&&quoted&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"'){quoted=!quoted;}else if(ch===delimiter&&!quoted){row.push(cell);cell="";}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(value=>value.trim()))rows.push(row);row=[];cell="";}else cell+=ch;}
    row.push(cell);if(row.some(value=>value.trim()))rows.push(row);return rows;
  }  function toggleDeliveryFields(){const carrier=$("delivery-type").value==="transportadora";$("carrier-field").hidden=!carrier;$("tracking-field").hidden=!carrier;$("carrier-other-field").hidden=!carrier||$("carrier-name").value!=="Otra";}
  function customerIdentity(){return `${$("customer-document").value.trim()}|${$("customer-phone").value.trim()}`;}
  function clearCustomerFields({keepFocusField=null}={}){
    for(const id of ["customer-name","customer-document","customer-phone","customer-city","customer-neighborhood","customer-address"]){if(id!==keepFocusField)$(id).value="";}
    $("customer-price-level").value="";$("customer-match").textContent="";state.matchedCustomerIdentity=null;state.customerCredit=0;
    $("customer-credit").textContent=`Saldo a favor disponible: ${money(0)}`;$("customer-account-history").hidden=true;$("customer-account-movements").replaceChildren();
    for(const item of state.cart.values())if(!item.manualPrice)item.unitPrice=priceFor(item.product,item.quantity);renderCart();updatePaymentSummary();
  }
  async function lookupCustomer(){
    const documentNumber=$("customer-document").value.trim(),phone=$("customer-phone").value.trim();if(!documentNumber&&!phone)return;
    const request=++state.customerLookupRequest,identity=`${documentNumber}|${phone}`;
    const isCurrent=()=>request===state.customerLookupRequest;
    const isSameIdentity=()=>identity===customerIdentity();
    const digits=value=>String(value||"").replace(/\D/g,"");const normalizedPhone=value=>{const number=digits(value);return number.length===12&&number.startsWith("57")?number.slice(2):number;};let data=null,lastError=null;
    const customers=await db.from("pos_clientes").select("nombre,documento,telefono,ciudad,barrio,direccion,nivel_precio,actualizado_en").order("actualizado_en",{ascending:false}).limit(1000);
    if(!isCurrent()||!isSameIdentity())return;
    if(!customers.error){const all=customers.data||[];data=(documentNumber&&all.find(customer=>digits(customer.documento)===digits(documentNumber)))||(phone&&all.find(customer=>normalizedPhone(customer.telefono)===normalizedPhone(phone)))||null;}
    else lastError=customers.error;
    if(!data){
      const sales=await db.from("pos_ventas").select("cliente_nombre,cliente_documento,cliente_telefono,cliente_ciudad,nivel_precio,creada_en").order("creada_en",{ascending:false}).limit(1000);
      if(!isCurrent()||!isSameIdentity())return;
      if(!sales.error){lastError=null;const all=sales.data||[];const previous=(documentNumber&&all.find(sale=>digits(sale.cliente_documento)===digits(documentNumber)))||(phone&&all.find(sale=>normalizedPhone(sale.cliente_telefono)===normalizedPhone(phone)));if(previous)data={nombre:previous.cliente_nombre,documento:previous.cliente_documento,telefono:previous.cliente_telefono,ciudad:previous.cliente_ciudad,nivel_precio:previous.nivel_precio};}
      else lastError=sales.error;
    }
    if(!isCurrent()||!isSameIdentity())return;
    if(!data&&lastError){state.customerCredit=0;$("customer-credit").textContent=`Saldo a favor disponible: ${money(0)}`;$("customer-match").textContent=`No pude buscar el cliente: ${lastError.message}`;updatePaymentSummary();return;}
    if(!data){state.customerCredit=0;state.matchedCustomerIdentity=null;$("customer-credit").textContent=`Saldo a favor disponible: ${money(0)}`;$("customer-match").textContent="Cliente nuevo; quedará guardado al registrar la venta.";updatePaymentSummary();return;}
    $("customer-name").value=data.nombre||"";$("customer-document").value=data.documento||documentNumber;$("customer-phone").value=data.telefono||phone;$("customer-city").value=data.ciudad||"";$("customer-neighborhood").value=data.barrio||"";$("customer-address").value=data.direccion||"";$("customer-price-level").value=data.nivel_precio||"";
    state.matchedCustomerIdentity=customerIdentity();
    $("customer-match").textContent="Cliente encontrado; cargué sus datos guardados.";
    await refreshCustomerAccount(request);
    if(!isCurrent())return;
    for(const item of state.cart.values())if(!item.manualPrice)item.unitPrice=priceFor(item.product,item.quantity);renderCart();
  }
  async function refreshCustomerAccount(lookupRequest=state.customerLookupRequest){
    const {data,error}=await db.rpc("pos_obtener_cuenta_cliente",{p_documento:$('customer-document').value.trim()||null,p_telefono:$('customer-phone').value.trim()||null});
    if(lookupRequest!==state.customerLookupRequest)return;
    state.customerCredit=error?0:Number(data?.saldo_favor)||0;
    $("customer-credit").textContent=error?"Saldo a favor: no disponible (instala la migración)":`Saldo a favor disponible: ${money(state.customerCredit)}${Number(data?.saldo_pendiente)>0?` · Debe ${money(data.saldo_pendiente)}`:""}`;
    const history=$('customer-account-history'),list=$('customer-account-movements');list.replaceChildren();
    const movements=data?.movimientos||[];const movementsById=new Map(movements.map(movement=>[Number(movement.id),movement]));const reversedIds=new Set(movements.map(movement=>Number(movement.movimiento_reversado_id)).filter(Boolean));
    let missingAdvanceIds=false;
    for(const movement of movements){const row=document.createElement('p');row.className='account-movement';const restoredBySale=movement.tipo==='abono'&&(movement.nota||'').startsWith('Saldo a favor restaurado por anulación de ');const reversesRestored=movement.tipo==='anulacion_abono'&&(movementsById.get(Number(movement.movimiento_reversado_id))?.nota||'').startsWith('Saldo a favor restaurado por anulación de ');const names={abono:restoredBySale?'Saldo restaurado por factura anulada':'Abono recibido',uso_abono:'Abono aplicado',anulacion_abono:reversesRestored?'Saldo restaurado anulado':'Abono anulado',deuda:'Saldo pendiente',pago_deuda:'Pago de saldo pendiente'};const details=document.createElement('span');details.textContent=`${names[movement.tipo]||movement.tipo}: ${money(movement.monto)}${movement.medio?` · ${movement.medio}`:''}${movement.banco?` · ${movement.banco}`:''}${movement.referencia_pago?` · ${movement.referencia_pago}`:''} · ${new Date(movement.creado_en).toLocaleDateString('es-CO')}`;row.append(details);if(movement.tipo==='abono'&&!restoredBySale&&!reversedIds.has(Number(movement.id))){if(Number(movement.id)>0){const cancel=document.createElement('button');cancel.type='button';cancel.className='btn btn-small btn-danger cancel-advance';cancel.textContent='Anular';cancel.dataset.movementId=String(movement.id);cancel.dataset.amount=String(movement.monto);cancel.dataset.method=movement.medio||'';cancel.addEventListener('click',cancelAdvance);row.append(cancel);}else{missingAdvanceIds=true;}}list.append(row);}
    if(missingAdvanceIds){const hint=document.createElement('p');hint.className='hint';hint.textContent='Para habilitar la anulación, falta actualizar la migración de abonos en Supabase.';list.append(hint);}
    history.hidden=error||!list.childElementCount;
    updatePaymentSummary();
  }
  function openAdvance(){
    $("advance-name").value=$("customer-name").value.trim();$("advance-document").value=$("customer-document").value.trim();$("advance-phone").value=$("customer-phone").value.trim();$("advance-amount").value="";$("advance-method").value="transferencia";$("advance-bank").value="";$("advance-reference").value="";$("advance-note").value="";toggleAdvanceFields();$("advance-dialog").showModal();
  }
  function toggleAdvanceFields(){const show=$("advance-method").value==="transferencia";$('advance-bank-fields').hidden=!show;}
  async function submitAdvance(event){
    event.preventDefault();const button=$("save-advance");button.disabled=true;
    const client={nombre:$('advance-name').value.trim(),documento:$('advance-document').value.trim(),telefono:$('advance-phone').value.trim()};
    const {data,error}=await db.rpc("pos_registrar_abono",{p_cliente:client,p_monto:Number($('advance-amount').value),p_medio:$('advance-method').value,p_banco:$('advance-bank').value||null,p_referencia:$('advance-reference').value.trim()||null,p_nota:$('advance-note').value.trim()||null});
    button.disabled=false;
    if(error){status(`No se pudo registrar el abono: ${error.message}`,true);return;}
    $('customer-name').value=client.nombre;$('customer-document').value=client.documento;$('customer-phone').value=client.telefono;
    $('advance-dialog').close();$('advance-form').reset();await lookupCustomer();status(`Abono registrado. Saldo a favor disponible: ${money(data?.saldo_favor)}.`);
  }
  async function cancelAdvance(event){
    const button=event.currentTarget,id=Number(button.dataset.movementId),amount=Number(button.dataset.amount);if(!Number.isInteger(id)||id<=0){status('Supabase todavía no está devolviendo el identificador del abono. Ejecuta la migración de anulación de abonos y vuelve a buscar el cliente.',true);return;}
    if(!window.confirm(`¿Anular el abono de ${money(amount)}? Se conservará el movimiento en el historial y se ajustará el saldo del cliente${button.dataset.method==='efectivo'?' y la caja':''}.`))return;
    button.disabled=true;const {data,error}=await db.rpc('pos_anular_abono',{p_movimiento_id:id,p_motivo:'Anulación de abono'});button.disabled=false;
    if(error){status(`No se pudo anular el abono: ${error.message}`,true);return;}
    await refreshCustomerAccount();await refreshCash();status(`Abono anulado. Saldo a favor disponible: ${money(data?.saldo_favor)}.`);
  }
  function applyReceiptSettings(){
    const settings=JSON.parse(localStorage.getItem("martextiles-pos-receipt")||"{}");
    if(settings.paper)$('receipt-paper').value=settings.paper;if(settings.font)$('receipt-font').value=settings.font;
    const widths={"58mm":"58mm","80mm":"80mm",a4:"180mm",letter:"7in"},pageSizes={"58mm":"58mm auto","80mm":"80mm auto",a4:"A4",letter:"Letter"},pageMargins={"58mm":"0","80mm":"0",a4:"10mm",letter:"10mm"},fonts={small:"11px",normal:"13px",large:"16px"};
    $('receipt-dialog').style.setProperty("--receipt-width",widths[$('receipt-paper').value]||"80mm");$('receipt-dialog').style.setProperty("--receipt-font-size",fonts[$('receipt-font').value]||"13px");
    $('receipt-dialog').dataset.paper=$('receipt-paper').value;
    let printPage=document.getElementById("pos-print-page");if(!printPage){printPage=document.createElement("style");printPage.id="pos-print-page";document.head.append(printPage);}printPage.textContent=`@media print{@page{size:${pageSizes[$('receipt-paper').value]||"80mm auto"};margin:${pageMargins[$('receipt-paper').value]||"0"}}}`;
  }
  function parseCop(value){
    let clean=String(value??"").replace(/[^0-9,.-]/g,"");if(!clean)return null;
    const comma=clean.lastIndexOf(","),dot=clean.lastIndexOf(".");
    if(comma>=0&&dot>=0){const decimal=comma>dot?comma:dot,tail=clean.length-decimal-1;clean=clean.replace(/[,.]/g,"");if(tail>0)clean=clean.slice(0,-tail)+"."+clean.slice(-tail);}
    else if(comma>=0){const tail=clean.length-comma-1;clean=tail>0&&tail<=2?clean.replace(",","."):clean.replace(/,/g,"");}
    else if(dot>=0){const tail=clean.length-dot-1;clean=tail>0&&tail<=2?clean:clean.replace(/\./g,"");}
    const number=Number(clean);return Number.isFinite(number)&&number>=0?number:null;
  }
  async function importClassPrices(){
    const file=$("price-import-file").files[0];if(!file){status("Selecciona el CSV exportado desde la pestaña BD.",true);return;}
    const rows=parseCsv(await file.text());if(rows.length<2){status("El CSV no contiene filas de referencias.",true);return;}
    const normalizeHeaders=cells=>cells.map(value=>value.trim().replace(/^\uFEFF/,"").toLocaleUpperCase("es"));
    const headerIndex=rows.slice(0,20).findIndex(cells=>{const headers=normalizeHeaders(cells);return headers.some(value=>["REF","REFERENCIA"].includes(value))&&["A","B","C","D","E"].every(level=>headers.includes(level));});
    if(headerIndex<0){status("No encuentro una fila con columnas REF (o REFERENCIA), A, B, C, D y E en el CSV.",true);return;}
    const headers=normalizeHeaders(rows[headerIndex]);const refIndex=headers.findIndex(value=>["REF","REFERENCIA"].includes(value));
    const data=[];for(const cells of rows.slice(headerIndex+1)){const reference=(cells[refIndex]||"").trim();if(!reference)continue;const row={referencia:reference};for(const level of ["A","B","C","D","E"]){const value=parseCop(cells[headers.indexOf(level)]);if(value!==null)row[level]=value;}data.push(row);}
    if(!data.length){status("No encontré precios con referencias válidas en el CSV.",true);return;}
    const button=$("import-prices");button.disabled=true;const {data:result,error}=await db.rpc("pos_importar_precios_clase",{p_precios:data});button.disabled=false;
    if(error){status(`No se importaron los precios: ${error.message}`,true);return;}
    await refreshAll();status(`Precios importados: ${result.precios_importados}. Referencias sin coincidencia: ${result.referencias_no_encontradas}.`);
  }
  function reportTable(title,headers,rows){const section=document.createElement("section");section.className="card report-table-card";const heading=document.createElement("h2");heading.textContent=title;section.append(heading);if(!rows.length){const empty=document.createElement("p");empty.className="hint";empty.textContent="Sin datos para este periodo.";section.append(empty);return section;}const wrap=document.createElement("div");wrap.className="report-table-wrap";const table=document.createElement("table");table.className="report-table";const thead=document.createElement("thead"),headRow=document.createElement("tr");for(const label of headers){const th=document.createElement("th");th.textContent=label;headRow.append(th);}thead.append(headRow);table.append(thead);const tbody=document.createElement("tbody");for(const row of rows){const tr=document.createElement("tr");for(const value of row){const td=document.createElement("td");td.textContent=String(value??"");tr.append(td);}tbody.append(tr);}table.append(tbody);wrap.append(table);section.append(wrap);return section;}
  function renderReport(report){
    state.report=report;$("export-report").disabled=false;$("report-period").textContent=`Periodo: ${report.desde} a ${report.hasta}. Las ventas anuladas se excluyen de ventas netas y utilidad.`;
    const refs=report.referencias||[],best=[...refs].filter(item=>Number(item.unidades_net)>0).sort((a,b)=>Number(b.unidades_net)-Number(a.unidades_net))[0];
    const summary=$("report-summary");summary.replaceChildren();const metrics=[["Ventas registradas",report.ventas],["Ventas anuladas",report.anuladas],["Venta bruta",money(report.venta_bruta)],["Devoluciones",money(report.devoluciones)],["Venta neta",money(report.venta_neta)],["Unidades netas vendidas",report.unidades_net],["Costo de mercancía vendida",money(report.costo_mercancia)],["Utilidad bruta",money(report.utilidad_bruta)],["Margen bruto",`${Number(report.margen_porcentaje||0).toLocaleString("es-CO")} %`],["Ticket promedio neto",money(report.ticket_promedio)],["Referencia más vendida",best?`Ref ${best.referencia} · ${best.unidades_net} unid. · ${money(best.utilidad_bruta)} utilidad`:"Sin ventas"],["Inventario actual",`${report.inventario_actual?.unidades||0} unid. · ${money(report.inventario_actual?.valor_costo)}`]];
    for(const [label,value] of metrics){const card=document.createElement("div");card.className="metric";const span=document.createElement("span"),strong=document.createElement("strong");span.textContent=label;strong.textContent=String(value);card.append(span,strong);summary.append(card);}
    const breakdown=$("report-breakdown");breakdown.replaceChildren();const products=refs.map(item=>[item.referencia,`${item.nombre||""}${item.categoria?` · ${item.categoria}`:""}`,item.unidades_vendidas, item.unidades_net,money(item.venta_neta),money(item.costo),money(item.utilidad_bruta),`${Number(item.venta_neta)>0?(Number(item.utilidad_bruta)/Number(item.venta_neta)*100).toLocaleString("es-CO",{maximumFractionDigits:1}):"0"} %`]);
    breakdown.append(reportTable("Desempeño por referencia",["Referencia","Producto","Unidades","Unid. netas","Venta neta","Costo","Utilidad bruta","Margen"],products));
    breakdown.append(reportTable("Referencias menos vendidas (con ventas)",["Referencia","Producto","Unidades netas","Venta neta","Utilidad bruta"],[...refs].filter(item=>Number(item.unidades_net)>0).sort((a,b)=>Number(a.unidades_net)-Number(b.unidades_net)).map(item=>[item.referencia,item.nombre,item.unidades_net,money(item.venta_neta),money(item.utilidad_bruta)])));
    breakdown.append(reportTable("Referencias sin ventas netas",["Referencia","Producto","Categoría","Existencia"],(report.sin_ventas||[]).map(item=>[item.referencia,item.nombre,item.categoria,item.existencia])));
    breakdown.append(reportTable("Medios de pago",["Medio","Total recibido","Pagos"],(report.medios_pago||[]).map(item=>[item.medio,money(item.total),item.transacciones])));
    breakdown.append(reportTable("Clientes principales",["Cliente","Documento","Ventas","Venta neta"],(report.clientes||[]).map(item=>[item.cliente,item.documento,item.ventas,money(item.total)])));
    breakdown.append(reportTable("Ventas por día",["Fecha","Ventas","Venta neta","Unidades"],(report.por_dia||[]).map(item=>[item.fecha,item.ventas,money(item.venta_neta),item.unidades])));
  }
  async function runReport(){const from=$("report-from").value,to=$("report-to").value;if(!from||!to||to<from){status("Selecciona un rango de fechas válido.",true);return;}$("run-report").disabled=true;status("Generando reporte del periodo…");const {data,error}=await db.rpc("pos_reporte_ventas",{p_desde:from,p_hasta:to});$("run-report").disabled=false;if(error){status(`No se pudo generar el reporte: ${error.message}. Comprueba que ejecutaste la migración de reportes en Supabase.`,true);return;}renderReport(data||{});status("");}
  function exportReport(){const report=state.report;if(!report)return;const rows=[["Sección","Referencia o dato","Descripción","Unidades","Venta bruta","Devoluciones","Venta neta","Costo","Utilidad bruta","Margen"]];for(const key of ["ventas","anuladas","venta_bruta","devoluciones","venta_neta","unidades_net","costo_mercancia","utilidad_bruta","margen_porcentaje","ticket_promedio"]){rows.push(["Resumen",key,report[key]??""]);}for(const item of report.referencias||[])rows.push(["Referencias",item.referencia,item.nombre,item.unidades_net,item.venta_bruta,item.devoluciones,item.venta_neta,item.costo,item.utilidad_bruta,Number(item.venta_neta)>0?Number(item.utilidad_bruta)/Number(item.venta_neta):0]);for(const item of report.sin_ventas||[])rows.push(["Sin ventas",item.referencia,item.nombre,item.existencia]);for(const item of report.medios_pago||[])rows.push(["Medios de pago",item.medio,"",item.transacciones,"","",item.total]);for(const item of report.clientes||[])rows.push(["Clientes",item.documento,item.cliente,item.ventas,"","",item.total]);for(const item of report.por_dia||[])rows.push(["Por día",item.fecha,"",item.unidades,"","",item.venta_neta]);const csv="\uFEFF"+rows.map(row=>row.map(value=>`"${String(value??"").replaceAll('"','""')}"`).join(";")).join("\r\n");const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`reporte-pos-${report.desde}-${report.hasta}.csv`;link.click();URL.revokeObjectURL(url);}  function setReportDefaultDates(){const today=new Date(),first=new Date(today.getFullYear(),today.getMonth(),1),iso=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;$("report-from").value=iso(first);$("report-to").value=iso(today);}
  async function loadHistory(){status("Cargando ventas recientes…");let result=await db.from("pos_ventas").select("id,numero,estado,cliente_nombre,cliente_documento,cliente_telefono,cliente_ciudad,barrio,direccion,tipo_entrega,transportadora,numero_guia,nivel_precio,total,creada_en,anulada_en,motivo_anulacion,nota_anulacion,inventario_reintegrado,efectivo_reembolsado,pos_venta_items(*),pos_pagos(*)").order("creada_en",{ascending:false}).limit(1000);if(result.error&&["42703","PGRST204"].includes(result.error.code)){result=await db.from("pos_ventas").select("id,numero,estado,cliente_nombre,cliente_documento,cliente_telefono,cliente_ciudad,barrio,direccion,tipo_entrega,transportadora,numero_guia,nivel_precio,total,creada_en,pos_venta_items(*),pos_pagos(*)").order("creada_en",{ascending:false}).limit(1000);}if(result.error&&["42703","PGRST204"].includes(result.error.code)){result=await db.from("pos_ventas").select("id,numero,estado,cliente_nombre,cliente_documento,cliente_telefono,cliente_ciudad,nivel_precio,total,creada_en,pos_venta_items(*),pos_pagos(*)").order("creada_en",{ascending:false}).limit(1000);}if(result.error){status(`No se pudo consultar el historial: ${result.error.message}`,true);return;}state.sales=result.data||[];renderHistory();await runReport();}
  async function reprintSale(sale){
    const payments=(sale.pos_pagos||[]).map(payment=>({medio:payment.medio,valor:Number(payment.valor)||0,banco:payment.banco||"",referencia_pago:payment.referencia_pago||""}));
    const lines=(sale.pos_venta_items||[]).map(item=>({reference:item.referencia,name:item.nombre||"",variant:item.color||item.talla?{color:item.color||null,talla:item.talla||null}:null,quantity:Number(item.cantidad)||0,price:Number(item.precio_unitario)||0}));
    const creditApplied=payments.filter(payment=>payment.medio==="saldo_favor").reduce((sum,payment)=>sum+payment.valor,0);
    const client={nombre:sale.cliente_nombre||"",documento:sale.cliente_documento||"",telefono:sale.cliente_telefono||"",ciudad:sale.cliente_ciudad||"",barrio:sale.barrio||"",direccion:sale.direccion||""};
    let creditRemaining=0;
    if(client.documento||client.telefono){const {data,error}=await db.rpc("pos_obtener_cuenta_cliente",{p_documento:client.documento||null,p_telefono:client.telefono||null});if(!error)creditRemaining=Number(data?.saldo_favor)||0;}
    showReceipt(sale.numero||`Venta ${sale.id}`,lines,Number(sale.total)||0,payments,{client,level:sale.nivel_precio||"",delivery:{tipo:sale.tipo_entrega||"",transportadora:sale.transportadora||"",guia:sale.numero_guia||""},creditApplied,creditRemaining,creditRemainingLabel:"Saldo a favor disponible actualmente",cancelled:sale.estado==="anulada",createdAt:sale.creada_en});
    $("receipt-dialog").showModal();
  }
  function renderHistory(){const term=$("history-search").value.trim().toLocaleLowerCase("es"),filtered=state.sales.filter(sale=>[sale.numero,sale.cliente_nombre,sale.cliente_documento,...(sale.pos_venta_items||[]).map(i=>i.referencia)].join(" ").toLocaleLowerCase("es").includes(term));const box=$("sales-list");box.replaceChildren();
    for(const sale of filtered){const card=document.createElement("article");card.className="sale-card";const heading=document.createElement("div");heading.className="sale-summary";const number=document.createElement("div"),when=document.createElement("div"),value=document.createElement("strong"),stateEl=document.createElement("div");const date=new Date(sale.creada_en);number.innerHTML="";const nStrong=document.createElement("strong");nStrong.textContent=sale.numero||`Venta ${sale.id}`;const nSmall=document.createElement("small");nSmall.textContent=sale.cliente_nombre||"Venta sin nombre de cliente";number.append(nStrong,nSmall);when.innerHTML="";const dSmall=document.createElement("small");dSmall.textContent=date.toLocaleString("es-CO");when.append(dSmall);value.textContent=money(sale.total);stateEl.textContent=sale.estado.replaceAll("_"," ");heading.append(number,when,value,stateEl);card.append(heading);
      const details=document.createElement("details"),summaryEl=document.createElement("summary");summaryEl.textContent="Ver productos, pagos y entrega";details.append(summaryEl);const ul=document.createElement("ul");for(const item of sale.pos_venta_items||[]){const li=document.createElement("li");li.textContent=`${item.cantidad} × Ref ${item.referencia}${item.color||item.talla?` · ${[item.color,item.talla].filter(Boolean).join(" · ")}`:""} — ${money(item.total_linea)}`;ul.append(li);}details.append(ul);for(const pay of sale.pos_pagos||[]){const p=document.createElement("p"),method=pay.medio==="saldo_favor"?"Saldo a favor":pay.medio;p.textContent=`${method}${pay.banco?` · ${pay.banco}`:""}: ${money(pay.valor)}${pay.referencia_pago?` · ${pay.referencia_pago}`:""}`;details.append(p);}if(sale.nivel_precio){const p=document.createElement("p");p.textContent=`Categoría de precio: ${sale.nivel_precio}`;details.append(p);}if(sale.tipo_entrega){const p=document.createElement("p");p.textContent=sale.tipo_entrega==="transportadora"?`Envío: ${sale.transportadora||"Transportadora"}${sale.numero_guia?` · Guía ${sale.numero_guia}`:""}`:sale.tipo_entrega==="domicilio"?"Entrega a domicilio":"Recoge el cliente";details.append(p);}const address=[sale.direccion,sale.barrio,sale.cliente_ciudad].filter(Boolean).join(" · ");if(address){const p=document.createElement("p");p.textContent=`Dirección: ${address}`;details.append(p);}if(sale.estado==="anulada"){const p=document.createElement("p");p.textContent=`Anulada${sale.anulada_en?` el ${new Date(sale.anulada_en).toLocaleString("es-CO")}`:""}${sale.motivo_anulacion?` · Motivo: ${sale.motivo_anulacion}`:""}${sale.nota_anulacion?` · ${sale.nota_anulacion}`:""}`;details.append(p);if(sale.inventario_reintegrado){const stock=document.createElement("p");stock.textContent="Los productos se reingresaron al inventario.";details.append(stock);}if(Number(sale.efectivo_reembolsado)>0){const refund=document.createElement("p");refund.textContent=`Reembolso en efectivo registrado: ${money(sale.efectivo_reembolsado)}`;details.append(refund);}}card.append(details);
      const actions=document.createElement("div");actions.className="sale-actions";const print=document.createElement("button");print.type="button";print.className="btn btn-secondary";print.textContent=sale.estado==="anulada"?"Reimprimir copia anulada":"Reimprimir tirilla";print.addEventListener("click",()=>reprintSale(sale));actions.append(print);if(sale.estado!=="devuelta"&&sale.estado!=="anulada"){const button=document.createElement("button");button.type="button";button.className="btn btn-secondary";button.textContent="Registrar devolución";button.addEventListener("click",()=>openReturn(sale));actions.append(button);if(sale.estado==="completada"){const cancel=document.createElement("button");cancel.type="button";cancel.className="btn btn-danger";cancel.textContent="Anular venta";cancel.addEventListener("click",()=>openCancel(sale));actions.append(cancel);}}card.append(actions);box.append(card);
    }
    if(!filtered.length){const empty=document.createElement("p");empty.className="empty";empty.textContent="No hay ventas que coincidan con la búsqueda.";box.append(empty);}
  }
  function openCancel(sale){state.selectedCancelSale=sale;$("cancel-sale-label").textContent=`${sale.numero||`Venta ${sale.id}`} · ${sale.cliente_nombre||"Cliente no registrado"} · ${money(sale.total)}`;$("cancel-reason").value="";$("cancel-note").value="";$("cancel-restock").checked=true;$("cancel-cash-refund").checked=false;$("cancel-dialog").showModal();}
  async function submitCancel(event){event.preventDefault();const sale=state.selectedCancelSale;if(!sale)return;const button=$("submit-cancel");button.disabled=true;const {data,error}=await db.rpc("pos_anular_venta",{p_venta_id:sale.id,p_motivo:$("cancel-reason").value,p_nota:$("cancel-note").value.trim()||null,p_reintegrar_inventario:$("cancel-restock").checked,p_reembolsar_efectivo:$("cancel-cash-refund").checked});button.disabled=false;if(error){status(`No se pudo anular la venta: ${error.message}`,true);return;}$("cancel-dialog").close();state.selectedCancelSale=null;await refreshAll();await loadHistory();if(sale.cliente_documento||sale.cliente_telefono){$("customer-document").value=sale.cliente_documento||"";$("customer-phone").value=sale.cliente_telefono||"";state.customerLookupRequest++;await refreshCustomerAccount();}status(`Venta ${sale.numero||sale.id} anulada. Se conservó en el historial${Number(data?.saldo_favor_restaurado)>0?`; saldo a favor restaurado: ${money(data.saldo_favor_restaurado)}`:""}${Number(data?.efectivo_reembolsado)>0?` y reembolso en efectivo de ${money(data.efectivo_reembolsado)}`:""}.`);}
  async function openReturn(sale){state.selectedReturn=sale;$("return-sale-label").textContent=`${sale.numero} · ${sale.cliente_nombre||"Cliente no registrado"}`;$("return-reason").value="";$("return-note").value="";const rows=$("return-items");rows.replaceChildren();const {data:returns}=await db.from("pos_devoluciones").select("id,pos_devolucion_items(venta_item_id,cantidad)").eq("venta_id",sale.id);const already=new Map();for(const ret of returns||[])for(const item of ret.pos_devolucion_items||[])already.set(item.venta_item_id,(already.get(item.venta_item_id)||0)+Number(item.cantidad));for(const item of sale.pos_venta_items||[]){const pending=Number(item.cantidad)-(already.get(item.id)||0);if(pending<=0)continue;const row=document.createElement("div");row.className="return-line";row.dataset.saleItemId=String(item.id);row.dataset.unitPrice=String(item.precio_unitario);const label=document.createElement("strong");label.textContent=`Ref ${item.referencia} · pendientes ${pending}`;const quantity=document.createElement("input");quantity.type="number";quantity.min="0";quantity.max=String(pending);quantity.value="0";quantity.dataset.quantity="true";quantity.setAttribute("aria-label",`Cantidad a devolver de ${item.referencia}`);const restockLabel=document.createElement("label"),check=document.createElement("input");check.type="checkbox";check.dataset.restock="true";restockLabel.append(check,document.createTextNode(" Reingresar a inventario"));row.append(label,quantity,restockLabel);rows.append(row);}$("return-dialog").showModal();}
  async function submitReturn(){const sale=state.selectedReturn;if(!sale)return;const items=[...$("return-items").querySelectorAll(".return-line")].map(row=>({venta_item_id:Number(row.dataset.saleItemId),cantidad:Number(row.querySelector('[data-quantity="true"]').value)||0,reintegrar_inventario:row.querySelector('[data-restock="true"]').checked})).filter(item=>item.cantidad>0);if(!items.length){status("Indica al menos una unidad devuelta.",true);return;}if(!$("return-reason").value){status("Selecciona el motivo de la devolución.",true);return;}const button=$("submit-return");button.disabled=true;const {data,error}=await db.rpc("pos_registrar_devolucion",{p_venta_id:sale.id,p_items:items,p_motivo:$("return-reason").value,p_nota:$("return-note").value.trim()||null});button.disabled=false;if(error){status(`No se registró la devolución: ${error.message}`,true);return;}$("return-dialog").close();await refreshAll();await loadHistory();status(`Devolución guardada. Valor registrado: ${money(data.valor)}. El ajuste de caja o reembolso debe quedar asentado por separado.`);}

  document.querySelectorAll("[data-password-toggle]").forEach(button=>button.addEventListener("click",()=>{const input=document.getElementById(button.dataset.passwordToggle);const visible=input.type==="password";input.type=visible?"text":"password";button.textContent=visible?"Ocultar":"Mostrar";button.setAttribute("aria-pressed",String(visible));input.focus();}));
  $("login-form").addEventListener("submit",async event=>{event.preventDefault();if(location.protocol==="file:"){status("No se puede iniciar sesión desde file://. En VS Code, abre pos.html con Live Server y entra por http://127.0.0.1:5500/pos.html.",true);return;}status("Validando acceso…");const {data,error}=await db.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});if(error){status(`No se pudo iniciar sesión: ${error.message}`,true);return;}await authorizeSession(data.session);});
  $("logout").addEventListener("click",async()=>{await db.auth.signOut();state.cart.clear();showView(false);status("");});
  document.querySelectorAll(".tab").forEach(tab=>tab.addEventListener("click",async()=>{document.querySelectorAll(".tab").forEach(item=>item.classList.toggle("active",item===tab));document.querySelectorAll(".panel").forEach(panel=>panel.classList.toggle("active-panel",panel.id===tab.dataset.panel));if(tab.dataset.panel==="history-panel")await loadHistory();if(tab.dataset.panel==="stock-panel")renderStock();if(tab.dataset.panel==="cash-panel")await refreshCash();}));
  $("product-search").addEventListener("input",renderProducts);
  $("customer-price-level").addEventListener("change",()=>{for(const item of state.cart.values())if(!item.manualPrice)item.unitPrice=priceFor(item.product,item.quantity);renderCart();});
  $("customer-document").addEventListener("blur",lookupCustomer);
  $("customer-phone").addEventListener("blur",lookupCustomer);
  for(const field of [$('customer-document'),$('customer-phone')])field.addEventListener("input",event=>{state.customerLookupRequest++;if(state.matchedCustomerIdentity&&customerIdentity()!==state.matchedCustomerIdentity){clearCustomerFields({keepFocusField:event.currentTarget.id});}else{state.customerCredit=0;$('customer-credit').textContent=`Saldo a favor disponible: ${money(0)}`;$('customer-account-history').hidden=true;$('customer-account-movements').replaceChildren();updatePaymentSummary();}});
  $('clear-customer').addEventListener("click",()=>{state.customerLookupRequest++;clearCustomerFields();$('customer-match').textContent="Datos del cliente borrados. Puedes ingresar otro cliente; el carrito se conserva.";$('customer-document').focus();});
  $('register-advance').addEventListener("click",openAdvance);
  $('advance-form').addEventListener("submit",submitAdvance);
  $('advance-method').addEventListener("change",toggleAdvanceFields);
  $('close-advance').addEventListener("click",()=>$('advance-dialog').close());
  $('advance-dialog').addEventListener("click",event=>{if(event.target===$('advance-dialog'))$('advance-dialog').close();});
  for(const field of [$('receipt-paper'),$('receipt-font')])field.addEventListener("change",()=>{localStorage.setItem("martextiles-pos-receipt",JSON.stringify({paper:$('receipt-paper').value,font:$('receipt-font').value}));applyReceiptSettings();});
  $('receipt-print').addEventListener("click",()=>{applyReceiptSettings();window.print();});
  $('close-receipt').addEventListener("click",()=>$('receipt-dialog').close());
  $('receipt-dialog').addEventListener("click",event=>{if(event.target===$('receipt-dialog'))$('receipt-dialog').close();});
  $("delivery-type").addEventListener("change",toggleDeliveryFields);
  $("carrier-name").addEventListener("change",toggleDeliveryFields);
  $("product-search").addEventListener("keydown",event=>{if(event.key!=="Enter")return;event.preventDefault();const product=findProduct(event.currentTarget.value);if(product){if((state.variants.get(product.id)||[]).length){status(`Ref ${product.referencia} tiene colores o tallas; selecciónalos en la tarjeta del producto.`,true);return;}addToCart(product);event.currentTarget.value="";renderProducts();}else status("No encontramos ese código o referencia.",true);});
  $("clear-search").addEventListener("click",()=>{$("product-search").value="";renderProducts();$("product-search").focus();});
  $("add-payment").addEventListener("click",()=>addPaymentRow());
  $("complete-sale").addEventListener("click",submitSale);
  $("stock-form").addEventListener("submit",submitStock);
  $("adjust-stock-form").addEventListener("submit",adjustStock);
  $("new-reference-form").addEventListener("submit",createReference);
  $("configure-variants-form").addEventListener("submit",saveVariants);
  $("config-form").addEventListener("submit",saveConfig);
  $("import-prices").addEventListener("click",importClassPrices);
  $("stock-product").addEventListener("change",()=>{const cfg=state.config.get(Number($("stock-product").value));fillVariantSelects();if(cfg){$("config-product").value=String($("stock-product").value);loadConfigFields();}});
  $("adjust-stock-product").addEventListener("change",()=>{fillVariantSelects();const productId=Number($("adjust-stock-product").value),variants=state.variants.get(productId)||[];if(variants.length===1){$("adjust-stock-variant").value=String(variants[0].id);$("adjust-stock-count").value=String(state.variantStock.get(variants[0].id)||0);}else if(!variants.length){$("adjust-stock-count").value=String(state.stock.get(productId)||0);}});
  $("config-product").addEventListener("change",loadConfigFields);
  $("variant-product").addEventListener("change",loadVariantEditor);
  $("variant-mode").addEventListener("change",()=>{$("variant-edit-fields").hidden=$("variant-mode").value==="ninguno";});
  const toggleNewVariantFields=()=>{const enabled=$("new-variant-mode").value!=="ninguno";$("new-variant-fields").hidden=!enabled;$("new-quantity-field").hidden=enabled;$("new-ref-quantity").disabled=enabled;};
  $("new-variant-mode").addEventListener("change",toggleNewVariantFields);
  $("adjust-stock-variant").addEventListener("change",()=>{$("adjust-stock-count").value=String(state.variantStock.get(Number($("adjust-stock-variant").value))||0);});
  $("stock-search").addEventListener("input",renderStock);
  $("history-search").addEventListener("input",renderHistory);
  $("refresh-history").addEventListener("click",loadHistory);
  $("run-report").addEventListener("click",runReport);
  $("export-report").addEventListener("click",exportReport);
  $("refresh-cash").addEventListener("click",refreshCash);
  $("cash-open-form").addEventListener("submit",openCash);
  $("cash-movement-form").addEventListener("submit",saveCashMovement);
  $("cash-close-form").addEventListener("submit",closeCash);
  $("cash-counted-amount").addEventListener("input",()=>{$("cash-close-difference").textContent=`Diferencia al cierre: ${money((Number($("cash-counted-amount").value)||0)-state.cashExpected)}`;});
  $("submit-return").addEventListener("click",submitReturn);
  $("return-dialog").addEventListener("click",event=>{if(event.target===$("return-dialog"))$("return-dialog").close();});
  $("cancel-form").addEventListener("submit",submitCancel);
  $("close-cancel").addEventListener("click",()=>$('cancel-dialog').close());
  $("dismiss-cancel").addEventListener("click",()=>$('cancel-dialog').close());
  $("cancel-dialog").addEventListener("click",event=>{if(event.target===$("cancel-dialog"))$("cancel-dialog").close();});
  addPaymentRow();
  setReportDefaultDates();
  toggleDeliveryFields();
  db.auth.getSession().then(({data})=>authorizeSession(data.session));
  db.auth.onAuthStateChange((_event,session)=>{if(!session)showView(false);});
})();


