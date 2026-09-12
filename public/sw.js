// =====================================================================
//  SERVICE WORKER JURISCONECTA v6
//  - Muestra notificaciones (push) VIBRANDO y PEGADAS en la barra
//    (como WhatsApp/Temu), con nombre y mensaje.
//  - SOLO guarda la portada para abrir sin internet (network-first).
//  - NO toca el JavaScript, ni Supabase, ni el chat en vivo.
// =====================================================================
const CACHE = "jurisconecta-v6";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    try { const c = await caches.open(CACHE); await c.add("/"); } catch {}
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.clients.claim();
    const wins = await self.clients.matchAll({ type: "window" });
    for (const w of wins) {
      try { w.navigate(w.url); } catch {}
    }
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.mode !== "navigate") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      try { return await fetch(req); }
      catch {
        const cached = await caches.match("/");
        return cached || Response.error();
      }
    })()
  );
});

// ===== NOTIFICACIONES (Web Push) =====
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || "JurisConecta";
  const body = data.body || "Tienes un mensaje nuevo";
  const canalId = data.canalId || "";
  const url = data.url || (canalId ? "/?chat=" + canalId : "/");
  const esLlamada = !!data.esLlamada;

  // En LLAMADA: vibración larga y repetida (como timbre) + botones Contestar/Rechazar.
  const vibrate = esLlamada
    ? [600, 300, 600, 300, 600, 300, 600, 300, 600, 300, 600]
    : [200, 100, 200];
  const actions = esLlamada
    ? [{ action: "abrir", title: "📞 Contestar" }, { action: "rechazar", title: "Rechazar" }]
    : [{ action: "abrir", title: "Abrir" }];

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: data.tag || canalId || "jurisconecta",
      renotify: true,
      requireInteraction: true,
      vibrate,
      data: { url },
      actions,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "rechazar") return;   // Rechazar: solo cierra el aviso
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if ("focus" in c) {
          try { await c.focus(); if ("navigate" in c) await c.navigate(url); return; } catch {}
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url);
    })()
  );
});
