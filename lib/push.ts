import { supabase } from "./supabase";

// La llave PÚBLICA puede ir aquí (no es secreta). La privada vive en el servidor.
export const VAPID_PUBLIC = "BKrz13FnluofCoeJ-hmVBi1D02pkAITQHdmwDY93P4p98zbL3qCtSwCpQ1-R03KTrq87Jl2En87lWyQQSHd632Q";

export function pushSoportado(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function permisoActual(): NotificationPermission | "no-soportado" {
  if (!pushSoportado()) return "no-soportado";
  return Notification.permission;
}

function base64ToUint8(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Pide permiso, suscribe el navegador y guarda el "buzón" en Supabase.
export async function activarNotificaciones(nombre: string, correo?: string): Promise<{ ok: boolean; msg: string }> {
  if (!pushSoportado()) return { ok: false, msg: "Este navegador no soporta notificaciones." };
  try {
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") return { ok: false, msg: "No diste permiso de notificaciones." };
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8(VAPID_PUBLIC) as BufferSource,
      });
    }
    const json = sub.toJSON();
    const endpoint = sub.endpoint;
    const p256dh = json.keys?.p256dh || "";
    const auth = json.keys?.auth || "";
    if (!endpoint || !p256dh || !auth) return { ok: false, msg: "No se pudo crear la suscripción." };
    // Guardamos también el CORREO (identificador único) para que el nombre no importe.
    const fila: Record<string, string> = { nombre, endpoint, p256dh, auth };
    if (correo && correo.trim()) fila.correo = correo.trim().toLowerCase();
    const { error } = await supabase.from("push_subs").upsert(fila, { onConflict: "endpoint" });
    if (error) return { ok: false, msg: "No se pudo guardar: " + error.message };
    return { ok: true, msg: "¡Notificaciones activadas! Te avisaremos aunque la app esté cerrada." };
  } catch (e: any) {
    return { ok: false, msg: "Error: " + (e?.message || "desconocido") };
  }
}

export async function desactivarNotificaciones(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await supabase.from("push_subs").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
  } catch {}
}
