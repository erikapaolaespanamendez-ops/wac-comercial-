// =====================================================================
//  avisarPush — le pide al servidor (notificar.mjs) que mande la
//  notificación Web Push a los destinatarios del canal.
//  Es "fire-and-forget": si algo falla, NO rompe el envío del mensaje.
//
//  👉 TEMPORAL: escribe en la consola qué respondió el servidor, para
//     poder diagnosticar. Luego lo quitamos.
// =====================================================================
export function avisarPush(p: {
  canalId: string;
  autor: string;
  texto?: string | null;
  canalNombre?: string | null;
}): void {
  try {
    fetch("/.netlify/functions/notificar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        canalId: p.canalId,
        autor: p.autor,
        texto: p.texto || "",
        canalNombre: p.canalNombre || "",
      }),
    })
      .then((r) => r.text())
      .then((t) => console.log("📢 notificar respondió:", t))
      .catch((e) => console.log("📢 notificar ERROR:", e?.message || e));
  } catch (e: any) {
    console.log("📢 avisarPush ERROR:", e?.message || e);
  }
}
