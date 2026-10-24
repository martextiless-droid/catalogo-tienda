(() => {
  const WHATSAPP_NUMBER = "573015547616";
  const SUPABASE_URL = "https://nsuxvytaogbnrlopzfgi.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_A61mORZLeNZ4hd4x4INGjQ_XS0U1Xap";
  const toggle = document.getElementById("store-chat-toggle");
  const panel = document.getElementById("store-chat-panel");
  const closeButton = document.getElementById("store-chat-close");
  const resetButton = document.getElementById("store-chat-reset");
  const messages = document.getElementById("store-chat-messages");
  const form = document.getElementById("store-chat-form");
  const input = document.getElementById("store-chat-input");
  if (!toggle || !panel || !messages || !form || !input) return;

  const HISTORY_KEY = "martextiles-chat-history-v1";
  const HISTORY_LIMIT = 12;
  const MAX_HISTORY_MESSAGE = 600;
  const welcomeMessage = messages.querySelector(".store-chat-bot")?.textContent.trim()
    || "¡Hola! Puedo ayudarte a encontrar una referencia o resolver dudas sobre envíos, pagos y atención mayorista.";

  function loadHistory() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "null");
      if (!Array.isArray(saved)) return [{ role: "assistant", content: welcomeMessage }];
      const valid = saved
        .filter(item => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string")
        .map(item => ({ role: item.role, content: item.content.trim().slice(0, MAX_HISTORY_MESSAGE) }))
        .filter(item => item.content);
      return valid.length ? valid.slice(-HISTORY_LIMIT) : [{ role: "assistant", content: welcomeMessage }];
    } catch {
      return [{ role: "assistant", content: welcomeMessage }];
    }
  }

  let conversationHistory = loadHistory();

  function saveHistory() {
    conversationHistory = conversationHistory.slice(-HISTORY_LIMIT);
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(conversationHistory));
    } catch (error) {
      console.warn("No se pudo conservar la memoria temporal del chat:", error);
    }
  }

  function remember(role, content) {
    const value = String(content || "").trim().slice(0, MAX_HISTORY_MESSAGE);
    if (!value) return;
    conversationHistory.push({ role, content: value });
    saveHistory();
  }

  function restoreTranscript() {
    messages.replaceChildren();
    conversationHistory.forEach(item => addMessage(item.content, item.role === "user" ? "user" : "bot"));
  }

  restoreTranscript();

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

  function catalogContext(question) {
    const stopWords = new Set(["como", "para", "que", "con", "una", "uno", "las", "los", "del", "por", "tiene", "tienen", "quiero", "busco", "hay", "me", "de", "en", "el", "la"]);
    const terms = normalize(question).split(/[^a-z0-9]+/).filter(term => term.length > 2 && !stopWords.has(term));
    const cards = [...document.querySelectorAll(".products .product")];
    const byReference = new Map();

    for (const card of cards) {
      const reference = card.querySelector("h3")?.textContent.trim().replace(/^ref(?:erencia)?\s*/i, "");
      if (!reference || byReference.has(reference.toLowerCase())) continue;
      const name = card.querySelector("h3")?.textContent.trim() || reference;
      const category = card.dataset.cat || "";
      const style = card.dataset.subcat || "";
      const price = card.querySelector("p")?.textContent.trim() || "Precio por consultar";
      const link = card.querySelector("a[href]")?.href || "";
      const searchable = normalize(`${reference} ${name} ${category} ${style}`);
      let score = terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0);
      if (terms.some(term => /^\d+[a-z]*$/i.test(term) && normalize(reference) === term)) score += 20;
      if (/pijam/.test(normalize(question)) && /pijam/.test(normalize(category))) score += 5;
      if (/jogger/.test(normalize(question)) && /jogger/.test(normalize(category))) score += 5;
      byReference.set(reference.toLowerCase(), { reference, name, category, style, price, url: link, score });
    }

    const ranked = [...byReference.values()].sort((a, b) => b.score - a.score);
    const relevant = ranked.filter(item => item.score > 0).slice(0, 10);
    return (relevant.length ? relevant : ranked.slice(0, 8)).map(({ score, ...product }) => product);
  }

  async function askAssistant(question) {
    const typing = addMessage("Estoy revisando tu consulta…", "bot");
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/martextiles-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_PUBLISHABLE_KEY
        },
        body: JSON.stringify({
          question,
          history: conversationHistory.slice(0, -1).slice(-10),
          catalog: catalogContext(question)
        }),
        signal: AbortSignal.timeout(20000)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "No fue posible responder.");
      typing.textContent = result.answer || "No pude preparar una respuesta.";
      remember("assistant", typing.textContent);
    } catch (error) {
      typing.textContent = "No pude conectarme en este momento. Puedes continuar la consulta con nuestro equipo.";
      conversationHistory.pop();
      saveHistory();
      addContactLink(typing, `Mi pregunta: ${question}`);
      console.error("Error del asistente de MarTextiles:", error);
    }
    messages.scrollTop = messages.scrollHeight;
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
    const summary = priceText ? `${title.textContent}. ${priceText}` : title.textContent;
    remember("assistant", `Encontré esta referencia en el catálogo: ${summary}`);
    messages.scrollTop = messages.scrollHeight;
  }

  function reply(text) {
    addMessage(text, "bot");
    remember("assistant", text);
  }

  function answer(question) {
    const text = normalize(question);
    const product = findProduct(question);
    if (product) {
      productAnswer(product, question);
      return;
    }
    if (/envio|envios|transportadora|cobertura|domicilio/.test(text)) {
      reply("Realizamos envíos nacionales e internacionales. El costo y el tiempo dependen del destino y del pedido; escríbenos por WhatsApp para confirmarlos.");
    } else if (/pago|pagos|transferencia|contra entrega|contraentrega|banco/.test(text)) {
      reply("El pago contra entrega está disponible a nivel nacional. Para confirmar los medios de pago disponibles para tu pedido, te atienden por WhatsApp.");
    } else if (/mayorista|emprendedor|cantidad minima|minimo|precio/.test(text)) {
      reply("Somos mayoristas y atendemos a emprendedores. El precio y la cantidad mínima dependen de cada referencia; dime el código para buscarla en el catálogo.");
    } else if (/horario|abren|atienden|atencion/.test(text)) {
      reply("Nuestro horario es de lunes a viernes, de 8:20 a. m. a 1:00 p. m. y de 2:00 a 5:00 p. m.; sábados, de 8:20 a. m. a 12:00 p. m. (hora de Colombia).");
    } else if (/garantia|defecto|imperfecto|costura|tela/.test(text)) {
      reply("Las prendas tienen garantía de fábrica por imperfectos en la tela o la costura. Escríbenos por WhatsApp para revisar tu caso y recibir orientación.");
    } else {
      askAssistant(question);
    }
  }

  function send(question) {
    const value = String(question || "").trim();
    if (!value) return;
    addMessage(value, "user");
    remember("user", value);
    answer(value);
  }

  toggle.addEventListener("click", () => setOpen(panel.hidden));
  closeButton?.addEventListener("click", () => setOpen(false));
  resetButton?.addEventListener("click", () => {
    conversationHistory = [{ role: "assistant", content: welcomeMessage }];
    saveHistory();
    restoreTranscript();
  });
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
