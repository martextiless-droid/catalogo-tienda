const allowedOrigins = new Set([
  "https://martextiles.com",
  "https://www.martextiles.com",
]);
const recentRequests = new Map<string, number[]>();

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (allowedOrigins.has(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return Response.json({ error: "Origen no permitido." }, { status: 403 });
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin": origin!,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return Response.json({ error: "Método no permitido." }, { status: 405, headers: corsHeaders });
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return Response.json({ error: "El asistente aún no está configurado." }, { status: 503, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question || question.length > 600) {
      return Response.json({ error: "Escribe una consulta de máximo 600 caracteres." }, { status: 400, headers: corsHeaders });
    }

    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || origin!;
    const now = Date.now();
    const recent = (recentRequests.get(clientIp) || []).filter(timestamp => now - timestamp < 60_000);
    if (recent.length >= 8) {
      return Response.json({ error: "Enviaste varias consultas seguidas. Espera un minuto e inténtalo de nuevo." }, { status: 429, headers: corsHeaders });
    }
    recent.push(now);
    recentRequests.set(clientIp, recent);

    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        store: false,
        max_output_tokens: 300,
        instructions: [
          "Eres el asistente de atención al cliente de MarTextiles, una tienda colombiana de ropa al por mayor.",
          "Responde en español, con amabilidad y brevedad. Ayuda con preguntas generales sobre compras, pedidos, productos y la tienda.",
          "Horario: lunes a viernes de 8:20 a. m. a 1:00 p. m. y de 2:00 a 5:00 p. m.; sábados de 8:20 a. m. a 12:00 p. m., hora de Colombia.",
          "Hay envíos nacionales e internacionales; el costo y el tiempo dependen del destino. Pago contra entrega disponible a nivel nacional.",
          "Las prendas tienen garantía de fábrica por imperfectos de tela o costura.",
          "No inventes disponibilidad, existencias, precios específicos, tiempos de envío ni políticas que no estén en este contexto. Para confirmar esos datos, invita a escribir al WhatsApp de MarTextiles.",
          "No solicites contraseñas, datos de tarjetas ni información financiera sensible.",
        ].join(" "),
        input: question,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await openAiResponse.json().catch(() => ({}));
    if (!openAiResponse.ok) {
      console.error("OpenAI API error:", openAiResponse.status, data?.error?.code || "unknown");
      return Response.json({ error: "No pude generar una respuesta ahora." }, { status: 502, headers: corsHeaders });
    }

    const answer = typeof data.output_text === "string"
      ? data.output_text.trim()
      : (data.output || [])
        .flatMap((item: { content?: Array<{ type?: string; text?: string }> }) => item.content || [])
        .filter((item: { type?: string }) => item.type === "output_text")
        .map((item: { text?: string }) => item.text || "")
        .join("\n")
        .trim();
    if (!answer) {
      return Response.json({ error: "No recibí una respuesta. Intenta de nuevo." }, { status: 502, headers: corsHeaders });
    }

    return Response.json({ answer }, { headers: corsHeaders });
  } catch (error) {
    console.error("MarTextiles chat error:", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "No pude procesar la consulta. Intenta de nuevo." }, { status: 500, headers: corsHeaders });
  }
});
