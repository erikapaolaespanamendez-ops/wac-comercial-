import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { BRAND } from "../../brand";

function esIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export default function Login({ denegado }: { denegado?: boolean }) {
  const [modo, setModo] = useState<"entrar" | "registrar">("entrar");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verPass, setVerPass] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const [prompt, setPrompt] = useState<any>(null);
  const [instalada, setInstalada] = useState(false);
  const [modalInstalar, setModalInstalar] = useState<null | "ios" | "menu">(null);
  useEffect(() => {
    const onP = (e: any) => { e.preventDefault(); setPrompt(e); };
    const onI = () => { setInstalada(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", onP);
    window.addEventListener("appinstalled", onI);
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalada(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onP);
      window.removeEventListener("appinstalled", onI);
    };
  }, []);
  const instalar = async () => {
    if (prompt) { prompt.prompt(); try { await prompt.userChoice; } catch {} setPrompt(null); }
    else if (esIOS()) setModalInstalar("ios");
    else setModalInstalar("menu");
  };


  const entrarGoogle = async () => {
    setCargando(true); setError(null); setMensaje(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {         redirectTo: window.location.origin,         scopes: "https://www.googleapis.com/auth/gmail.send",         queryParams: { access_type: "offline", prompt: "consent" },       },
    });
    if (error) { setError("No se pudo conectar con Google. Intenta de nuevo."); setCargando(false); }
  };

  const entrarCorreo = async () => {
    setError(null); setMensaje(null);
    if (!email.trim()) { setError("Escribe tu correo."); return; }
    if (!password) { setError("Escribe tu contraseña."); return; }
    setCargando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) { setError("Correo o contraseña incorrectos."); setCargando(false); }
  };

  const registrarse = async () => {
    setError(null); setMensaje(null);
    if (!nombre.trim()) { setError("Escribe tu nombre completo."); return; }
    if (!email.trim() || !email.includes("@")) { setError("Escribe un correo válido."); return; }
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    setCargando(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { nombre: nombre.trim() } },
    });
    setCargando(false);
    if (error) {
      if (error.message.toLowerCase().includes("already")) setError("Ese correo ya está registrado. Intenta entrar o usa '¿Olvidaste tu contraseña?'.");
      else setError("No se pudo registrar. Intenta de nuevo.");
      return;
    }
    try { await supabase.auth.signOut(); } catch {}
    setEnviado(true);
  };

  const olvideContrasena = async () => {
    setError(null); setMensaje(null);
    if (!email.trim()) { setError("Primero escribe tu correo arriba."); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: window.location.origin });
    if (error) setError("No se pudo enviar el correo. Intenta de nuevo.");
    else setMensaje("Te enviamos un correo para cambiar tu contraseña. Revisa tu bandeja (y spam).");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-nube px-4 py-8">
      <div className="w-full max-w-sm rounded-3xl border border-black/5 bg-white p-8 text-center shadow-xl">
        <img src="/favicon.svg" alt={BRAND.nombre} className="mx-auto mb-4 h-20 w-20" />
        <h1 className="font-display text-xl font-extrabold text-tinta">{BRAND.nombre}</h1>
        <p className="mt-1 text-sm text-humo">{BRAND.empresa}</p>

        {enviado ? (
          <div className="mt-6">
            <div className="rounded-2xl bg-teal-soft p-5">
              <p className="text-3xl">✅</p>
              <p className="mt-2 font-semibold text-teal-dark">¡Solicitud enviada!</p>
              <p className="mt-1 text-sm text-humo">Te avisaremos cuando te aprueben y puedas entrar.</p>
            </div>
            <button onClick={() => { setEnviado(false); setModo("entrar"); setError(null); }} className="mt-4 text-xs font-medium text-teal-dark hover:underline">Volver al inicio</button>
          </div>
        ) : modo === "registrar" ? (
          <>
            <p className="mt-5 mb-3 text-sm text-humo">Crea tu cuenta. Un administrador revisará tu solicitud antes de darte acceso.</p>
            <div className="space-y-2 text-left">
              <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre completo" className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/40" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Tu correo" autoComplete="username" className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/40" />
              <div className="relative">
                <input type={verPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Crea una contraseña" autoComplete="new-password" className="w-full rounded-xl border border-black/10 px-3 py-2.5 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-teal/40" />
                <button type="button" onClick={() => setVerPass((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-medium text-humo hover:bg-nube">{verPass ? "Ocultar" : "Ver"}</button>
              </div>
            </div>
            <button onClick={registrarse} disabled={cargando} className="mt-3 w-full rounded-xl bg-teal px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-dark disabled:opacity-50">{cargando ? "Enviando…" : "Registrarme"}</button>
            <button onClick={() => { setModo("entrar"); setError(null); }} className="mt-3 text-xs font-medium text-teal-dark hover:underline">¿Ya tienes cuenta? Inicia sesión</button>
          </>
        ) : (
          <>
            <button onClick={entrarGoogle} disabled={cargando} className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-tinta shadow-sm transition hover:bg-nube disabled:opacity-50">
              <svg viewBox="0 0 24 24" className="h-5 w-5">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {cargando ? "Conectando…" : "Entrar con Google"}
            </button>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-black/10" /><span className="text-[11px] font-medium text-humo">o con tu correo</span><div className="h-px flex-1 bg-black/10" />
            </div>

            <div className="space-y-2 text-left">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Tu correo" autoComplete="username" className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/40" />
              <div className="relative">
                <input type={verPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") entrarCorreo(); }} placeholder="Contraseña" autoComplete="current-password" className="w-full rounded-xl border border-black/10 px-3 py-2.5 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-teal/40" />
                <button type="button" onClick={() => setVerPass((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-medium text-humo hover:bg-nube">{verPass ? "Ocultar" : "Ver"}</button>
              </div>
            </div>
            <button onClick={entrarCorreo} disabled={cargando} className="mt-3 w-full rounded-xl bg-teal px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-dark disabled:opacity-50">{cargando ? "Entrando…" : "Entrar"}</button>
            <button onClick={olvideContrasena} className="mt-2 block w-full text-xs font-medium text-teal-dark hover:underline">¿Olvidaste tu contraseña?</button>
            <button onClick={() => { setModo("registrar"); setError(null); setMensaje(null); }} className="mt-2 text-xs font-semibold text-teal-dark hover:underline">¿Eres nuevo? Regístrate aquí</button>
          </>
        )}

        {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
        {mensaje && <p className="mt-3 rounded-lg bg-teal-soft px-3 py-2 text-xs text-teal-dark">{mensaje}</p>}
        {denegado && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">Tu cuenta aún no tiene acceso. Espera a que un administrador te apruebe.</p>}

        {!instalada && (
          <button onClick={instalar} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-teal/30 bg-teal-soft px-4 py-2.5 text-sm font-semibold text-teal-dark transition hover:bg-teal/10">📲 Instalar app</button>
        )}
      </div>

      {modalInstalar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setModalInstalar(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-left shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-display text-base font-extrabold text-tinta">📲 Instalar JurisConecta</h3>
            {modalInstalar === "ios" ? (
              <ol className="list-decimal space-y-2 pl-5 text-sm text-humo">
                <li>Abre esta página en <b>Safari</b>.</li>
                <li>Toca <b>Compartir</b> (cuadrito con flecha ↑).</li>
                <li>Baja y toca <b>"Agregar a inicio"</b>.</li>
                <li>Toca <b>"Agregar"</b>. 🎉</li>
              </ol>
            ) : (
              <ol className="list-decimal space-y-2 pl-5 text-sm text-humo">
                <li>Abre el menú <b>⋮</b> del navegador.</li>
                <li>Toca <b>"Instalar app"</b>.</li>
                <li>Confirma <b>"Instalar"</b>. 🎉</li>
              </ol>
            )}
            <button onClick={() => setModalInstalar(null)} className="mt-4 w-full rounded-xl border border-black/10 px-4 py-2 text-sm font-semibold text-tinta hover:bg-nube">Entendido</button>
          </div>
        </div>
      )}
    </div>
  );
}
