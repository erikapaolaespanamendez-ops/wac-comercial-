import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { fetchPerfil } from "../../data/usuarios";
import { activarNotificaciones, desactivarNotificaciones, permisoActual, pushSoportado } from "../../lib/push";

export default function BotonNotificaciones({ nombre }: { nombre?: string }) {
  const [estado, setEstado] = useState<"cargando" | "no" | "off" | "on">("cargando");
  const [trabajando, setTrabajando] = useState(false);
  const [nombreSesion, setNombreSesion] = useState("");
  const [correoSesion, setCorreoSesion] = useState("");

  useEffect(() => {
    let activo = true;
    supabase.auth.getSession().then(async ({ data }) => {
      const email = data.session?.user?.email;
      if (!email) return;
      if (activo) setCorreoSesion(email.toLowerCase());
      const perfil = await fetchPerfil(email).catch(() => null);
      if (activo) setNombreSesion(perfil?.nombre || email.split("@")[0]);
    });
    return () => { activo = false; };
  }, []);

  useEffect(() => {
    if (!pushSoportado()) { setEstado("no"); return; }
    navigator.serviceWorker.ready
      .then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        setEstado(sub && permisoActual() === "granted" ? "on" : "off");
      })
      .catch(() => setEstado("off"));
  }, []);

  function nombreActual(): string {
    if (nombre && nombre.trim()) return nombre.trim();
    if (nombreSesion && nombreSesion.trim()) return nombreSesion.trim();
    try { const g = localStorage.getItem("chat_yo"); if (g) { const o = JSON.parse(g); return o?.nombre || ""; } } catch {}
    return "";
  }

  async function activar() {
    const n = nombreActual();
    if (!n) { alert("No pude identificar tu nombre todavía. Espera unos segundos y vuelve a intentar, o cierra sesión y vuelve a entrar."); return; }
    let correo = correoSesion;
    if (!correo) {
      try { const { data } = await supabase.auth.getSession(); correo = (data.session?.user?.email || "").toLowerCase(); } catch {}
    }
    setTrabajando(true);
    const r = await activarNotificaciones(n, correo);
    setTrabajando(false);
    if (r.ok) setEstado("on");
    alert(r.msg);
  }
  async function desactivar() {
    setTrabajando(true);
    await desactivarNotificaciones();
    setTrabajando(false);
    setEstado("off");
  }

  // Prueba: avisa en ESTE aparato. Espera 5 seg para que puedas BLOQUEAR
  // el cel o salir de la app (si no, el sistema esconde el aviso en primer plano).
  async function probar() {
    try {
      const reg = await navigator.serviceWorker.ready;
      alert("📴 Bloquea tu teléfono o sal de la app AHORA.\nEl aviso de prueba llegará en 5 segundos.");
      setTimeout(() => {
        const opts: any = {
          body: "¡Funciona! Los avisos llegan a este aparato. ✅",
          tag: "prueba-jurisconecta",
          renotify: true,
          requireInteraction: true,
          vibrate: [300, 150, 300, 150, 300],
          icon: "/favicon.svg",
          badge: "/favicon.svg",
        };
        reg.showNotification("🔔 Prueba JurisConecta", opts).catch(() => {});
      }, 5000);
    } catch (e: any) {
      alert("No se pudo mostrar la prueba: " + (e?.message || "error desconocido"));
    }
  }

  if (estado === "cargando" || estado === "no") return null;

  if (estado === "on") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={desactivar} disabled={trabajando} title="Notificaciones activadas (clic para desactivar)" className="flex shrink-0 items-center gap-1 rounded-lg bg-teal-soft px-3 py-1.5 text-xs font-semibold text-teal-dark hover:opacity-80">
          🔔 <span>Activadas</span>
        </button>
        <button onClick={probar} className="flex shrink-0 items-center gap-1 rounded-lg border border-teal/30 px-3 py-1.5 text-xs font-semibold text-teal-dark hover:bg-teal-soft">
          🧪 <span>Probar aviso</span>
        </button>
      </div>
    );
  }
  return (
    <button onClick={activar} disabled={trabajando} className="flex shrink-0 items-center gap-1 rounded-lg border border-teal/30 px-3 py-1.5 text-xs font-semibold text-teal-dark hover:bg-teal-soft">
      🔔 <span>{trabajando ? "Activando…" : "Activar avisos"}</span>
    </button>
  );
}
