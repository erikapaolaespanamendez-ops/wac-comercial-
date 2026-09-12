// Manda un correo con Gmail, en nombre del asesor que tiene la sesión abierta.
// Usa el "permiso de Google" (provider_token) que Supabase guarda al entrar.
import { supabase } from "./supabase";

export async function enviarCorreoGmail(args: { to: string; asunto: string; cuerpo: string; cc?: string; pixelUrl?: string; adjuntos?: { nombre: string; tipo: string; base64: string }[] }): Promise<{ ok: boolean; error?: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.provider_token;
  const from = data.session?.user?.email || "";
  if (!token) {
    return { ok: false, error: "Tu permiso de Google expiró (pasa al rato de entrar). Vuelve a entrar con Google y reintenta." };
  }
  if (!args.to) return { ok: false, error: "Este cliente no tiene correo." };
  try {
    const res = await fetch("/.netlify/functions/enviar-correo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: token, from, to: args.to, cc: args.cc || "", asunto: args.asunto, cuerpo: args.cuerpo, pixelUrl: args.pixelUrl || "", adjuntos: args.adjuntos || [] }),
    });
    const out = await res.json();
    if (!res.ok || !out.ok) return { ok: false, error: out.error || "No se pudo enviar el correo." };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Error de red al enviar." };
  }
}
