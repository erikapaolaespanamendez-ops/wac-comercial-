// Usa la IA (Gemini) para PULIR / formalizar el borrador de un correo.
export async function pulirCorreo(borrador: string, paraNombre?: string): Promise<{ ok: boolean; texto?: string; error?: string }> {
  const prompt =
    `Eres asistente de redacción de DIIPA (Inmuebles Accesibles). Reescribe el siguiente correo para un cliente` +
    (paraNombre ? ` llamado ${paraNombre}` : "") +
    `, en español, con tono profesional, claro, cálido y formal. Corrige ortografía y redacción. ` +
    `NO inventes datos, cifras, fechas ni compromisos que no estén en el borrador. ` +
    `Devuelve SOLO el texto del correo (sin asunto, sin comillas, sin explicaciones).\n\nBorrador:\n"""${borrador}"""`;
  try {
    const r = await fetch("/.netlify/functions/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensajes: [{ rol: "user", texto: prompt }] }),
    });
    const data = await r.json();
    if (!r.ok || data.error) return { ok: false, error: data.error || "La IA no pudo responder." };
    return { ok: true, texto: String(data.texto || "").trim() };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Error de red con la IA." };
  }
}
