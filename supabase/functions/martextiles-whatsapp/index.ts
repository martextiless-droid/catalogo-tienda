const encoder = new TextEncoder();
const MAX_BODY_BYTES = 1_000_000;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Falta configurar ${name}.`);
  return value;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function verifyMetaSignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature?.startsWith("sha256=")) return false;
  const appSecret = Deno.env.get("WHATSAPP_APP_SECRET");
  if (!appSecret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody)));
  const providedHex = signature.slice(7).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(providedHex)) return false;
  const provided = Uint8Array.from(providedHex.match(/.{2}/g) || [], byte => parseInt(byte, 16));
  return equalBytes(digest, provided);
}

function dbHeaders(): HeadersInit {
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

function dbUrl(table: string, query = ""): string {
  const base = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  return `${base}/rest/v1/${table}${query ? `?${query}` : ""}`;
}

async function dbRequest(table: string, query: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(dbUrl(table, query), {
    ...init,
    headers: { ...dbHeaders(), ...(init.headers || {}) },
    signal: AbortSignal.timeout(8_000),
  });
}

async function upsertContact(phone: string, name: string | null): Promise<number> {
  const response = await dbRequest("whatsapp_contactos", "on_conflict=telefono&select=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ telefono: phone, nombre: name, ultimo_mensaje_en: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`No se pudo guardar el contacto (${response.status}).`);
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows[0]?.id) throw new Error("No se recibió el contacto guardado.");
  return Number(rows[0].id);
}

async function saveMessage(contactId: number, direction: "entrante" | "saliente", text: string, metaId: string | null, type = "texto"): Promise<boolean> {
  const response = await dbRequest("whatsapp_mensajes", "on_conflict=id_mensaje_meta&select=id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({ contacto_id: contactId, direccion: direction, texto: text, id_mensaje_meta: metaId, tipo: type }),
  });
  if (!response.ok) throw new Error(`No se pudo guardar el mensaje (${response.status}).`);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function recentHistory(contactId: number): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const query = new URLSearchParams({
    select: "direccion,texto",
    contacto_id: `eq.${contactId}`,
    texto: "not.is.null",
    order: "creado_en.desc",
    limit: "12",
  });
  const response = await dbRequest("whatsapp_mensajes", query.toString());
  if (!response.ok) throw new Error(`No se pudo consultar el historial (${response.status}).`);
  const rows = await response.json();
  return (Array.isArray(rows) ? rows : []).reverse().map((row: { direccion: string; texto: string }) => ({
    role: row.direccion === "entrante" ? "user" as const : "assistant" as const,
    content: String(row.texto || "").slice(0, 600),
  }));
}

async function catalogContext(): Promise<{ catalog: unknown[]; prices: Map<string, string> }> {
  const productQuery = new URLSearchParams({
    select: "id,referencia,nombre,categoria,subcategoria,imagen_url,imagenes_url",
    publicado: "eq.true",
    eliminado: "eq.false",
    order: "id.asc",
    limit: "100",
  });
  const productsResponse = await dbRequest("productos", productQuery.toString());
  if (!productsResponse.ok) throw new Error(`No se pudo consultar el catálogo (${productsResponse.status}).`);
  const products = await productsResponse.json();
  const ids = (Array.isArray(products) ? products : []).map((item: { id: number }) => item.id).filter(Boolean);
  const prices = new Map<string, string>();
  if (ids.length) {
    const priceQuery = new URLSearchParams({ select: "producto_id,cantidad_minima,precio_unitario", producto_id: `in.(${ids.join(",")})`, order: "cantidad_minima.asc" });
    const priceResponse = await dbRequest("precios", priceQuery.toString());
    if (priceResponse.ok) {
      const priceRows = await priceResponse.json();
      for (const price of Array.isArray(priceRows) ? priceRows : []) {
        if (!prices.has(String(price.producto_id))) {
          prices.set(String(price.producto_id), `desde $${Number(price.precio_unitario).toLocaleString("es-CO")} c/u, mínimo ${price.cantidad_minima} unidades`);
        }
      }
    }
  }
  return { catalog: Array.isArray(products) ? products : [], prices };
}

function requestedReference(text: string, products: unknown[]): string | null {
  const candidates = (Array.isArray(products) ? products : [])
    .map((item: { referencia?: unknown }) => String(item.referencia || "").trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const normalized = text.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return candidates.find(reference => {
    const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9])${escaped.toLocaleLowerCase("es")}(?:$|[^a-z0-9])`, "i").test(normalized);
  }) || null;
}

async function activePhotos(reference: string): Promise<Array<{ url: string; descripcion: string | null }>> {
  const query = new URLSearchParams({
    select: "url,descripcion,creada_en,tanda_id",
    referencia: `eq.${reference}`,
    activa: "eq.true",
    order: "creada_en.desc",
    limit: "20",
  });
  const response = await dbRequest("whatsapp_fotos_referencia", query.toString());
  if (!response.ok) throw new Error(`No se pudieron consultar fotos (${response.status}).`);
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) return [];
  const latestBatch = rows[0].tanda_id;
  return rows.filter((row: { tanda_id: string; url: string }) => row.tanda_id === latestBatch && /^https:\/\//i.test(row.url));
}

async function makeAnswer(question: string, history: Array<{ role: "user" | "assistant"; content: string }>, catalog: unknown[], prices: Map<string, string>): Promise<string> {
  const apiKey = requiredEnv("OPENAI_API_KEY");
  const products = (Array.isArray(catalog) ? catalog : []).map((item: Record<string, unknown>) => ({
    referencia: item.referencia,
    nombre: item.nombre,
    categoría: item.categoria,
    estilo: item.subcategoria,
    precio: prices.get(String(item.id)) || "Precio por consultar",
  }));
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-5-mini",
      store: false,
      max_output_tokens: 350,
      instructions: [
        "Eres la vendedora virtual de MarTextiles, una tienda colombiana de ropa al por mayor. Responde en español, cálido, natural y breve, como en WhatsApp.",
        "Ayuda a elegir productos y hacer el pedido. Usa solo el catálogo de abajo para afirmar referencias, estilos o precios. No inventes estampados, existencias, precios ni políticas.",
        "Si preguntan por estampados/fotos de una referencia y no hay fotos activas disponibles, dilo con claridad y ofrece confirmar con el equipo.",
        "Horario: lunes a viernes de 8:20 a. m. a 1:00 p. m. y de 2:00 a 5:00 p. m.; sábados de 8:20 a. m. a 12:00 p. m., hora Colombia. Envíos nacionales e internacionales; costo y tiempo dependen del destino. Garantía de fábrica por imperfectos de tela o costura.",
        `Catálogo público vigente: ${JSON.stringify(products)}`,
      ].join(" "),
      input: [
        ...history.slice(-10).filter((item, index, items) =>
          !(index === items.length - 1 && item.role === "user" && item.content === question)
        ),
        { role: "user", content: question },
      ],
    }),
    signal: AbortSignal.timeout(18_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenAI respondió ${response.status} (${data?.error?.code || "sin código"}).`);
  const answer = typeof data.output_text === "string" ? data.output_text.trim() : "";
  if (!answer) throw new Error("OpenAI devolvió una respuesta vacía.");
  return answer.slice(0, 1200);
}

async function sendWhatsApp(to: string, content: Record<string, unknown>): Promise<string | null> {
  const token = requiredEnv("WHATSAPP_ACCESS_TOKEN");
  const phoneId = requiredEnv("WHATSAPP_PHONE_NUMBER_ID");
  const version = requiredEnv("WHATSAPP_GRAPH_API_VERSION");
  if (!/^v\d+\.\d+$/.test(version)) throw new Error("WHATSAPP_GRAPH_API_VERSION debe tener formato vNN.N.");
  const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, ...content }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Meta respondió ${response.status} (${data?.error?.code || "sin código"}).`);
  return data?.messages?.[0]?.id || null;
}

async function answerInbound(message: Record<string, unknown>, profile: Record<string, unknown>, value: Record<string, unknown>): Promise<void> {
  const from = typeof message.from === "string" ? message.from : "";
  const metaId = typeof message.id === "string" ? message.id : "";
  if (!from || !metaId) return;
  const type = typeof message.type === "string" ? message.type : "unknown";
  const text = type === "text" && typeof (message.text as Record<string, unknown>)?.body === "string"
    ? String((message.text as Record<string, unknown>).body).trim().slice(0, 1200)
    : "";
  const name = typeof (profile?.name) === "string" ? String(profile.name).slice(0, 120) : null;
  const contactId = await upsertContact(from, name);
  const isNew = await saveMessage(contactId, "entrante", text, metaId, type);
  if (!isNew) return;

  let reply: string;
  if (!text) {
    reply = "¡Hola! Por ahora puedo responder mensajes escritos. Cuéntame qué referencia buscas o escríbeme tu pregunta.";
  } else {
    try {
      const { catalog, prices } = await catalogContext();
      const reference = requestedReference(text, catalog);
      const photos = reference ? await activePhotos(reference) : [];
      if (reference && photos.length) {
        reply = `¡Claro! Te comparto algunos estampados activos de la referencia ${reference}.`;
        const textId = await sendWhatsApp(from, { type: "text", text: { body: reply } });
        await saveMessage(contactId, "saliente", reply, textId);
        for (const photo of photos.slice(0, 4)) {
          const caption = photo.descripcion ? `${reference} · ${photo.descripcion}` : `Referencia ${reference}`;
          const imageId = await sendWhatsApp(from, { type: "image", image: { link: photo.url, caption } });
          await saveMessage(contactId, "saliente", caption, imageId, "imagen");
        }
        if (photos.length > 4) {
          const more = `Tengo ${photos.length - 4} estampados más de esta referencia. ¿Quieres que te los envíe?`;
          const moreId = await sendWhatsApp(from, { type: "text", text: { body: more } });
          await saveMessage(contactId, "saliente", more, moreId);
        }
        return;
      }
      if (reference) {
        const product = (catalog as Array<Record<string, unknown>>).find(item => String(item.referencia || "").toLowerCase() === reference.toLowerCase());
        if (product?.imagen_url || (Array.isArray(product?.imagenes_url) && product.imagenes_url.length)) {
          const productPhotos = [...new Set([product.imagen_url, ...(Array.isArray(product.imagenes_url) ? product.imagenes_url : [])].filter((url): url is string => typeof url === "string" && url.startsWith("https://")))];
          reply = `¡Claro! Estas son las fotos del catálogo para la referencia ${reference}.`;
          const textId = await sendWhatsApp(from, { type: "text", text: { body: reply } });
          await saveMessage(contactId, "saliente", reply, textId);
          for (const url of productPhotos.slice(0, 4)) {
            const imageId = await sendWhatsApp(from, { type: "image", image: { link: url, caption: `Referencia ${reference}` } });
            await saveMessage(contactId, "saliente", `Referencia ${reference}`, imageId, "imagen");
          }
          return;
        }
      }
      reply = await makeAnswer(text, await recentHistory(contactId), catalog, prices);
    } catch (error) {
      console.error(JSON.stringify({ event: "whatsapp_reply_generation_failed", message_id: metaId, error: error instanceof Error ? error.message.slice(0, 180) : "unknown" }));
      reply = "Disculpa, en este momento no pude consultar el catálogo. ¿Me escribes de nuevo en un momento?";
    }
  }

  const outboundId = await sendWhatsApp(from, { type: "text", text: { body: reply } });
  await saveMessage(contactId, "saliente", reply, outboundId);
}

Deno.serve(async (request: Request) => {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expectedToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
    if (mode === "subscribe" && expectedToken && token === expectedToken && challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
    }
    return json({ error: "Verificación de webhook inválida." }, 403);
  }
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) return json({ error: "Payload demasiado grande." }, 413);
    const rawBody = await request.text();
    if (encoder.encode(rawBody).byteLength > MAX_BODY_BYTES) return json({ error: "Payload demasiado grande." }, 413);
    if (!await verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
      console.error(JSON.stringify({ event: "whatsapp_signature_invalid" }));
      return json({ error: "Firma inválida." }, 401);
    }

    const payload = JSON.parse(rawBody);
    if (payload?.object !== "whatsapp_business_account") return json({ received: true });
    const events: Array<{ message: Record<string, unknown>; profile: Record<string, unknown>; value: Record<string, unknown> }> = [];
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        if (change.field !== "messages") continue;
        const contacts = new Map<string, Record<string, unknown>>((value.contacts || []).map((contact: Record<string, unknown>) => [String(contact.wa_id || ""), contact.profile as Record<string, unknown> || {}]));
        for (const message of value.messages || []) {
          events.push({ message, profile: contacts.get(String(message.from || "")) || {}, value });
        }
      }
    }

    for (const event of events.slice(0, 10)) {
      try {
        await answerInbound(event.message, event.profile, event.value);
      } catch (error) {
        console.error(JSON.stringify({ event: "whatsapp_message_processing_failed", message_id: event.message.id || "unknown", error: error instanceof Error ? error.message.slice(0, 180) : "unknown" }));
      }
    }
    return json({ received: true });
  } catch (error) {
    console.error(JSON.stringify({ event: "whatsapp_webhook_failed", error: error instanceof Error ? error.message.slice(0, 180) : "unknown" }));
    return json({ error: "No se pudo procesar el webhook." }, 500);
  }
});
