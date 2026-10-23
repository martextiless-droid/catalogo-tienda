(() => {
  const WHATSAPP_NUMBER = "573015547616";
  const toggle = document.getElementById("store-chat-toggle");
  const panel = document.getElementById("store-chat-panel");
  const closeButton = document.getElementById("store-chat-close");
  const messages = document.getElementById("store-chat-messages");
  const form = document.getElementById("store-chat-form");
  const input = document.getElementById("store-chat-input");
  if (!toggle || !panel || !messages || !form || !input) return;

  const normalize = value => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/\s+/g, " ")
    .trim();

  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) input.focus();
    else toggle.focus();
  }

  function addMessage(text, kind) {
    const bubble = document.createElement("div");
    bubble.className = `store-chat-message ${kind === "user" ? "store-chat-user" : "store-chat-bot"}`;
    bubble.textContent = text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  }

  function addContactLink(parent, question) {
    const link = document.createElement("a");
    link.className = "store-chat-contact";
    link.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hola, estoy en MarTextiles. ${question}`)}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Continuar por WhatsApp";
    parent.appendChild(link);
  }

  function findProduct(question) {
    const cards = [...document.querySelectorAll(".products .product")];
    const normalizedQuestion = normalize(question).replace(/^ref(?:erencia)?\s*/, "");
    const referenceMatch = normalizedQuestion.match(/\b([a-z]*\d+[a-z]*)\b/i);
    const detail = document.querySelector(".product-detail");
    const detailReference = normalize(document.getElementById("product-reference")?.textContent || document.getElementById("product-name")?.textContent).replace(/^ref(?:erencia)?\s*/, "");
    if (referenceMatch) {
      const wanted = referenceMatch[1];
      const exact = cards.find(card => normalize(card.querySelector("h3")?.textContent).replace(/^ref(?:erencia)?\s*/, "") === wanted);
      if (exact) return exact;
      if (detail && detailReference.includes(wanted)) return detail;
    }
    if (normalizedQuestion.length < 4) return null;
    return cards.find(card => normalize(card.textContent).includes(normalizedQuestion)) || (detail && detailReference.includes(normalizedQuestion) ? detail : null);
  }

  function productAnswer(card, question) {
    const bubble = addMessage("Encontré esta referencia en el catálogo:", "bot");
    const product = document.createElement("div");
    product.className = "store-chat-product";
    const title = document.createElement("strong");
    const isDetail = card.matches(".product-detail");
    title.textContent = (isDetail ? document.getElementById("product-reference")?.textContent : card.querySelector("h3")?.textContent)?.trim() || document.getElementById("product-name")?.textContent.trim() || "Producto";
    product.appendChild(title);
    const priceText = isDetail ? document.getElementById("product-prices")?.textContent.trim() : card.querySelector("p")?.textContent.trim();
    if (priceText) {
      const detail = document.createElement("small");
      detail.textContent = priceText;
      product.appendChild(detail);
    }
    const productLink = isDetail ? { href: window.location.href } : card.querySelector("a[href]");
    if (productLink?.href) {
      const link = document.createElement("a");
      link.href = productLink.href;
      link.textContent = "Ver producto";
      product.appendChild(link);
    }
    addContactLink(product, `Quisiera confirmar disponibilidad y precio de ${title.textContent}. Mi pregunta fue: ${question}`);
    bubble.appendChild(product);
    messages.scrollTop = messages.scrollHeight;
  }

  function answer(question) {
    const text = normalize(question);
    const product = findProduct(question);
    if (product) {
      productAnswer(product, question);
      return;
    }
    if (/envio|envios|transportadora|cobertura|domicilio/.test(text)) {
      addMessage("Realizamos envíos nacionales e internacionales. El costo y el tiempo dependen del destino y del pedido; escríbenos por WhatsApp para confirmarlos.", "bot");
    } else if (/pago|pagos|transferencia|contra entrega|contraentrega|banco/.test(text)) {
      addMessage("El pago contra entrega está disponible a nivel nacional. Para confirmar los medios de pago disponibles para tu pedido, te atienden por WhatsApp.", "bot");
    } else if (/mayorista|emprendedor|cantidad minima|minimo|precio/.test(text)) {
      addMessage("Somos mayoristas y atendemos a emprendedores. El precio y la cantidad mínima dependen de cada referencia; dime el código para buscarla en el catálogo.", "bot");
    } else if (/horario|abren|atienden|atencion/.test(text)) {
      addMessage("Nuestro horario es de lunes a viernes, de 8:20 a. m. a 1:00 p. m. y de 2:00 a 5:00 p. m.; sábados, de 8:20 a. m. a 12:00 p. m. (hora de Colombia).", "bot");
    } else if (/garantia|defecto|imperfecto|costura|tela/.test(text)) {
      addMessage("Las prendas tienen garantía de fábrica por imperfectos en la tela o la costura. Escríbenos por WhatsApp para revisar tu caso y recibir orientación.", "bot");
    } else {
      const bubble = addMessage("Aún no tengo esa información. Puedo ayudarte a buscar una referencia o puedes continuar la consulta con nuestro equipo.", "bot");
      addContactLink(bubble, `Mi pregunta: ${question}`);
    }
  }

  function send(question) {
    const value = String(question || "").trim();
    if (!value) return;
    addMessage(value, "user");
    answer(value);
  }

  toggle.addEventListener("click", () => setOpen(panel.hidden));
  closeButton?.addEventListener("click", () => setOpen(false));
  panel.addEventListener("keydown", event => {
    if (event.key === "Escape") setOpen(false);
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    input.value = "";
    send(question);
  });
  document.querySelectorAll("[data-chat-question]").forEach(button => {
    button.addEventListener("click", () => send(button.dataset.chatQuestion));
  });
})();
