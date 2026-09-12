import { useEffect, useState, lazy, Suspense } from "react";
import { supabase } from "./lib/supabase";
import { suscribirNavegarDevolucion } from "./lib/navegarDevolucion";
import { fetchPerfil, type Perfil } from "./data/usuarios";
import { type Cliente } from "./data/clientes";
import Login from "./modules/Login/Login";
// 👇 Módulos de pantalla completa: carga BAJO DEMANDA (se bajan al abrirlos, no al entrar).
const Bienvenida = lazy(() => import("./modules/Bienvenida/Bienvenida"));
const Directorio = lazy(() => import("./modules/Directorio/Directorio"));
const Clientes = lazy(() => import("./modules/Clientes/Clientes"));
const ChatCliente = lazy(() => import("./modules/ChatCliente/ChatCliente"));
const Llamadas = lazy(() => import("./modules/Llamadas/Llamadas"));
const Kpis = lazy(() => import("./modules/Kpis/Kpis"));
const Conmutador = lazy(() => import("./modules/Conmutador/Conmutador"));
const ChatInterno = lazy(() => import("./modules/ChatInterno/ChatInterno"));
// Videollamadas y sus pantallas de llamada NO se tocan: quedan eager.
import Videollamadas from "./modules/Videollamadas/Videollamadas";
import LlamadaGrupo from "./modules/Videollamadas/LlamadaGrupo";
import LlamadaChat from "./modules/ChatInterno/LlamadaChat";
const Configuracion = lazy(() => import("./modules/Configuracion/Configuracion"));
const Asistente = lazy(() => import("./modules/Asistente/Asistente"));
import Campanita from "./modules/Campanita/Campanita";
const Catalogo = lazy(() => import("./modules/Catalogo/Catalogo"));
const Seguimiento = lazy(() => import("./modules/Seguimiento/Seguimiento"));
const ControlDevoluciones = lazy(() => import("./modules/Devoluciones/ControlDevoluciones"));
const MiListaDelDia = lazy(() => import("./modules/MiLista/MiListaDelDia"));
const CrmProspectos = lazy(() => import("./modules/CrmProspectos/CrmProspectos"));
const Comercial = lazy(() => import("./modules/Comercial/Comercial"));
import AvisosChat from "./modules/Avisos/AvisosChat";
import LlamadaEntrante from "./modules/Avisos/LlamadaEntrante";
import ConmutadorEntrante from "./modules/Avisos/ConmutadorEntrante";
import { useLineaConmutador, LineaConmutadorBoton, LineaConmutadorPantalla } from "./modules/Avisos/LineaConmutador";
import OnboardingGate from "./modules/Onboarding/OnboardingGate";
import { BRAND } from "./brand";
import { usePermisos, modulosVisibles } from "./data/permisos";

// ── ?empotrado=chat ───────────────────────────────────────────────
// Se lee UNA SOLA VEZ, al cargar la página, y se guarda aquí.
// Tiene que ser así porque el canje de sesión (?sso=) borra la
// dirección completa más abajo (línea ~390) y de pasada se llevaba
// este dato: el chat arrancaba empotrado y medio segundo después
// salía el sistema entero con su menú.
const EMPOTRADO =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("empotrado")
    : null;

type Vista = "bienvenida" | "directorio" | "clientes" | "llamadas" | "kpis" | "conmutador" | "chat" | "videollamadas" | "configuracion" | "asistente" | "catalogo" | "seguimiento" | "chatcliente" | "milista" | "prospectos" | "devoluciones" | "comercial";

const Icono: Record<Vista, JSX.Element> = {
bienvenida: (
    <svg viewBox="0 0 512 512" className="h-6 w-6">
      <defs>
        <linearGradient id="jcbg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#10417C" />
          <stop offset="0.55" stopColor="#0F6E8E" />
          <stop offset="1" stopColor="#16A8A4" />
        </linearGradient>
        <linearGradient id="jcdw" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#C8922A" />
          <stop offset="0.5" stopColor="#F2D78A" />
          <stop offset="1" stopColor="#FFFFFF" />
        </linearGradient>
      </defs>
      <rect x="50" y="62" width="412" height="330" rx="98" fill="url(#jcbg)" />
      <polygon points="150,388 232,388 132,476" fill="url(#jcbg)" />
      <g transform="translate(146,118) scale(9.2)" fill="url(#jcdw)">
        <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
      </g>
    </svg>
  ),
  directorio: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  clientes: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" />
    </svg>
  ),
  chatcliente: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  llamadas: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <polyline points="16 2 16 8 22 8" /><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2" />
    </svg>
  ),
  kpis: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  conmutador: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3 14v-2a9 9 0 0 1 18 0v2" /><rect x="2" y="14" width="4" height="6" rx="1" /><rect x="18" y="14" width="4" height="6" rx="1" /><path d="M18 20a3 3 0 0 1-3 3h-3" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  videollamadas: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  ),
  asistente: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" /><path d="M19 14l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6L19 14z" />
    </svg>
  ),
  configuracion: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  catalogo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="6" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><path d="M6 8v8" /><path d="M11 6h9" /><path d="M11 12h7" /><path d="M11 18h9" />
    </svg>
  ),
  comercial: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3 21V10l7-5 7 5v11" /><path d="M9 21v-6h4v6" /><path d="M17 21h4V13l-4-3" />
    </svg>
  ),
  seguimiento: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />
    </svg>
  ),
  milista: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
    </svg>
  ),
  prospectos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  ),
  devoluciones: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3 10a8 8 0 1 1 2.5 5.8" /><path d="M3 4v6h6" /><path d="M12 8v4l3 2" />
    </svg>
  ),
};

// `destacado` pinta el grupo en el azul de la marca en lugar del gris de
// los demás. Se usa en Comercial, que es el trabajo de todos los días y
// tiene que saltar a la vista sin buscarlo.
const GRUPOS: { titulo: string; destacado?: boolean; modulos: { clave: Vista; nombre: string }[] }[] = [
  {
    titulo: "Comunicación Interna",
    modulos: [
      { clave: "asistente", nombre: "Asistente IA" },
      { clave: "chat", nombre: "Chat Interno" },
      { clave: "directorio", nombre: "Directorio" },
    ],
  },
  // Comercial va ARRIBA, luego de Comunicación Interna: estaba hasta el
  // final y había que recorrer todo el menú para llegar a lo que más se
  // usa. Cambio pedido por la DGE el 08-09-2026.
  {
    titulo: "Comercial",
    destacado: true,
    modulos: [
      { clave: "prospectos", nombre: "CRM Prospectos" },
      { clave: "comercial", nombre: "Módulo Comercial" },
    ],
  },
  {
    titulo: "Comunicación con Clientes",
    modulos: [
      { clave: "conmutador", nombre: "Conmutador" },
      { clave: "videollamadas", nombre: "Videollamadas" },
      { clave: "llamadas", nombre: "Llamadas" },
      { clave: "chatcliente", nombre: "Chat Cliente" },
      { clave: "milista", nombre: "Mi lista del día" },
      { clave: "clientes", nombre: "Clientes" },
      { clave: "seguimiento", nombre: "CRM Clientes (UAC)" },
      { clave: "devoluciones", nombre: "Control de Devoluciones" },
    ],
  },
  {
    titulo: "Sistema",
    modulos: [
      { clave: "kpis", nombre: "KPIs Llamadas" },
    ],
  },
];

// 👇 NUEVO: lo que aparece DENTRO del menú de la foto (esquina arriba a la derecha).
//  Configuración, Catálogo de Seguimiento y Conmutador. (Cerrar sesión se agrega aparte.)
const ITEMS_MENU_USUARIO: { clave: Vista; nombre: string }[] = [
  { clave: "configuracion", nombre: "Configuración" },
  { clave: "catalogo", nombre: "Catálogo de Seguimiento" },
  { clave: "conmutador", nombre: "Conmutador" },
];

const BARRA_MOVIL: { clave: Vista; nombre: string }[] = [
  { clave: "llamadas", nombre: "Llamadas" },
  { clave: "chat", nombre: "Chat" },
  { clave: "bienvenida", nombre: "Inicio" },
  { clave: "videollamadas", nombre: "Video" },
  { clave: "asistente", nombre: "IA" },
];

const ENCABEZADOS: Record<Vista, { titulo: string; sub: string }> = {
  bienvenida: { titulo: "", sub: "" },
  comercial: { titulo: "", sub: "" },
  chat: { titulo: "", sub: "" },
  videollamadas: { titulo: "", sub: "" },
  configuracion: { titulo: "", sub: "" },
  kpis: { titulo: "", sub: "" },
  conmutador: { titulo: "", sub: "" },
  asistente: { titulo: "", sub: "" },
  catalogo: {
    titulo: "Catálogo de Seguimiento",
    sub: "Reglas por código: responsable, ritmo, escalamiento y cómo se completa la tarea.",
  },
  seguimiento: {
    titulo: "CRM Clientes (UAC)",
    sub: "A quién llamar hoy: vencidos, por vencer y al día según el plazo de cada código.",
  },
  directorio: {
    titulo: "Directorio del Equipo",
    sub: "Encuentra a cualquier área por nombre o extensión y contáctala al instante.",
  },
  clientes: {
    titulo: "Clientes",
    sub: "Ficha completa de cada cliente: estatus, datos, vínculos e historial.",
  },
  chatcliente: {
    titulo: "Chat Cliente",
    sub: "Conversaciones de WhatsApp con los clientes desde el número de la empresa.",
  },
  llamadas: {
    titulo: "Registro de Llamadas",
    sub: "Cada llamada queda guardada con su folio automático (por área).",
  },
  milista: {
    titulo: "Mi lista del día",
    sub: "Tus clientes que tocan hoy, ordenados por prioridad. Toca uno para abrir su ficha.",
  },
  prospectos: {
    titulo: "CRM Prospectos",
    sub: "Leads del área comercial: de dónde llegan, quién los atiende y cuándo toca el siguiente toque.",
  },
  devoluciones: {
    titulo: "Control de Devoluciones",
    sub: "Todas las Devoluciones Compensadas (RDC): solicitudes por definir, próximos abonos y atrasados.",
  },
};

// Cuando tocas la NOTIFICACIÓN de una llamada (?llamada=...), entras directo
// a la llamada 1-a-1 bonita (LlamadaChat), no a la sala de juntas.
function LlamadaDesdeAviso({ sala, soloAudio }: { sala: string; soloAudio: boolean }) {
  const [nombre] = useState<string>(() => {
    try {
      const g = localStorage.getItem("chat_yo");
      if (g) { const o = JSON.parse(g); return o?.nombre || ""; }
    } catch {}
    return "";
  });
  const irInicio = () => { window.location.href = "/"; };

  if (!nombre) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-nube px-4 text-center">
        <div className="w-full max-w-sm rounded-3xl border border-black/5 bg-white p-8 shadow-xl">
          <p className="text-4xl">📞</p>
          <h1 className="mt-2 font-display text-lg font-extrabold text-tinta">Te están llamando</h1>
          <p className="mt-2 text-sm text-humo">Inicia sesión para contestar la llamada.</p>
          <button onClick={irInicio} className="mt-5 w-full rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-dark">Entrar</button>
        </div>
      </div>
    );
  }

  return <LlamadaChat sala={sala} nombre={nombre} soloAudio={soloAudio} onCerrar={irInicio} />;
}

function SalaPublica({ sala }: { sala: string }) {
  const [nombre, setNombre] = useState<string>(() => {
    try {
      const g = localStorage.getItem("chat_yo");
      if (g) { const o = JSON.parse(g); return o?.nombre || ""; }
    } catch {}
    return "";
  });
  const [entrado, setEntrado] = useState(false);
  const [terminado, setTerminado] = useState(false);

  if (entrado && !terminado) {
    return (
      <LlamadaGrupo
        sala={sala}
        nombre={nombre.trim() || "Invitado"}
        onCerrar={() => { setEntrado(false); setTerminado(true); }}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-nube px-4">
      <div className="w-full max-w-sm rounded-3xl border border-black/5 bg-white p-8 text-center shadow-xl">
        <img src="/favicon.svg" alt={BRAND.nombre} className="mx-auto mb-4 h-16 w-16" />
        {terminado ? (
          <>
            <p className="text-4xl">👋</p>
            <h1 className="mt-2 font-display text-lg font-extrabold text-tinta">Llamada terminada</h1>
            <p className="mt-2 text-sm text-humo">Gracias por su tiempo. Si la reunión sigue abierta, puede volver a entrar.</p>
            <button onClick={() => setTerminado(false)} className="mt-5 w-full rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-dark">Volver a entrar</button>
          </>
        ) : (
          <>
            <h1 className="font-display text-lg font-extrabold text-tinta">Videollamada · {BRAND.empresa}</h1>
            <p className="mt-2 text-sm text-humo">Escriba su nombre para entrar a la reunión. No necesita instalar nada.</p>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Su nombre"
              className="mt-4 w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
            />
            <button
              onClick={() => setEntrado(true)}
              disabled={!nombre.trim()}
              className="mt-3 w-full rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50"
            >
              📹 Entrar a la reunión
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [vista, setVista] = useState<Vista>("bienvenida");
  const [chatTarget, setChatTarget] = useState<{ nombre: string; nonce: number } | null>(null);
  const [segTarget, setSegTarget] = useState<{ cliente: Cliente; nonce: number } | null>(null);
  const [devTarget, setDevTarget] = useState<{ cliente: Cliente; nonce: number } | null>(null);

  useEffect(() => {
    suscribirNavegarDevolucion((cliente) => {
      setDevTarget({ cliente, nonce: Date.now() });
      setVista("devoluciones");
    });
  }, []);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [menuUsuario, setMenuUsuario] = useState(false);

  const [sesion, setSesion] = useState<{ email: string } | null | undefined>(undefined);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [perfilListo, setPerfilListo] = useState(false); // 👈 ¿ya sabemos el ROL? (evita el parpadeo de "todos los módulos")
  const [miFoto, setMiFoto] = useState<string | null>(null); // 👈 NUEVO: foto del colaborador (para el círculo)
  const linea = useLineaConmutador(perfil?.nombre || sesion?.email?.split("@")[0] || "");
  const [denegado, setDenegado] = useState(false);
  const [pendiente, setPendiente] = useState<string | null>(null);

  usePermisos(); // 👈 Fase 2B: carga los permisos guardados y re-pinta el menú cuando cambian

  // Módulos que ve esta persona según su rol.
  // Mientras NO sepamos el rol todavía (perfilListo === false), NO mostramos nada,
  // así no aparecen "todos" los módulos por un instante para luego desaparecer.
  const misModulos = perfilListo ? modulosVisibles(perfil?.rol) : [];

  useEffect(() => {
    (async () => {
      // 👇 Si llegamos desde el Portal DIIPA con un código de acceso
      // (?sso=XXXX), lo canjeamos por la sesión real ANTES de revisar
      // si hay sesión. Así entras directo, sin volver a loguearte.
      try {
        const params = new URLSearchParams(window.location.search);
        const codigo = params.get("sso");
        if (codigo) {
          const res = await fetch("/.netlify/functions/canjear-sso", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: codigo }),
          });
          if (res.ok) {
            const { access_token, refresh_token } = await res.json();
            const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
            if (setErr) console.error("SSO: setSession falló:", setErr.message);
          } else {
            const detalle = await res.text().catch(() => "");
            console.error("SSO: canjear-sso respondió", res.status, detalle);
          }
          // Quitamos el ?sso= de la URL (haya funcionado o no; no se puede reusar).
          // OJO: se conserva ?empotrado, porque si se borra, el chat deja de
          // saber que va dentro de JusticiaFácil y se pinta el sistema completo.
          const resto = EMPOTRADO ? "?empotrado=" + encodeURIComponent(EMPOTRADO) : "";
          window.history.replaceState({}, "", window.location.pathname + resto + window.location.hash);
        }
      } catch (e) {
        console.error("SSO: error inesperado", e);
      }

      const { data } = await supabase.auth.getSession();
      revisar(data.session);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, session) => revisar(session));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Si la vista actual no la puede ver su rol, lo regresa a Inicio.
  useEffect(() => {
    if (vista !== "bienvenida" && !(misModulos as string[]).includes(vista)) {
      setVista("bienvenida");
    }
  }, [misModulos, vista]);

  // 👇 NUEVO: busca la foto del colaborador (tabla colaboradores) por su correo.
  useEffect(() => {
    const correo = sesion?.email?.toLowerCase();
    if (!correo) { setMiFoto(null); return; }
    let vivo = true;
    (async () => {
      try {
        const { data } = await supabase.from("colaboradores").select("foto_url").eq("correo", correo).maybeSingle();
        if (vivo) setMiFoto((data?.foto_url as string) || null);
      } catch {
        if (vivo) setMiFoto(null);
      }
    })();
    return () => { vivo = false; };
  }, [sesion?.email]);

  async function revisar(session: any) {
    const email: string | undefined = session?.user?.email;
    if (!email) { setSesion(null); setPerfil(null); setPerfilListo(false); setPendiente(null); return; }
    const correo = email.toLowerCase();
    const esDiipa = correo.endsWith("@diipadesarrollos.com");
    let estado = esDiipa ? "activo" : "pendiente";
    try {
      const { data } = await supabase.from("usuarios").select("estado").eq("email", correo).maybeSingle();
      if (data?.estado) estado = data.estado;
    } catch {}
    if (estado !== "activo") {
      setPendiente(estado);
      setSesion(null);
      setPerfil(null);
      setPerfilListo(false);
      setDenegado(false);
      return;
    }
    setPendiente(null);
    setDenegado(false);
    setSesion({ email });
    // Cuando termine de buscar el perfil (con o sin fila), ya sabemos el rol → perfilListo = true.
    fetchPerfil(email)
      .then((p) => { setPerfil(p); setPerfilListo(true); })
      .catch(() => { setPerfil(null); setPerfilListo(true); });
  }

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    setSesion(null);
    setPerfil(null);
    setPerfilListo(false);
    setPendiente(null);
  };

  const params = new URLSearchParams(window.location.search);
  const salaLlamada = params.get("llamada");
  if (salaLlamada) return <LlamadaDesdeAviso sala={salaLlamada} soloAudio={params.get("a") === "1"} />;

  const salaPublica = params.get("sala");
  if (salaPublica) return <SalaPublica sala={salaPublica} />;

  // Esperamos a saber el rol antes de pintar el tablero:
  //  - sesion === undefined  → todavía revisando la sesión
  //  - sesion activa pero perfilListo === false → ya hay sesión, falta el rol
  // En ambos casos mostramos "Cargando…" (así nunca se ve la barra con módulos de más).
  if (sesion === undefined || (sesion && !perfilListo)) {
    return <div className="flex min-h-screen items-center justify-center bg-nube text-sm text-humo">Cargando…</div>;
  }

  if (pendiente) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-nube px-4">
        <div className="w-full max-w-sm rounded-3xl border border-black/5 bg-white p-8 text-center shadow-xl">
          <img src="/favicon.svg" alt={BRAND.nombre} className="mx-auto mb-4 h-16 w-16" />
          <p className="text-4xl">{pendiente === "rechazado" ? "🚫" : "⏳"}</p>
          <h1 className="mt-2 font-display text-lg font-extrabold text-tinta">
            {pendiente === "rechazado" ? "Acceso no aprobado" : "Solicitud pendiente"}
          </h1>
          <p className="mt-2 text-sm text-humo">
            {pendiente === "rechazado"
              ? "Tu solicitud fue rechazada. Si crees que es un error, contacta a un administrador."
              : "Tu cuenta quedó registrada. Un administrador la revisará y te dará acceso pronto."}
          </p>
          <button
            onClick={cerrarSesion}
            className="mt-5 w-full rounded-xl border border-black/10 px-4 py-2.5 text-sm font-semibold text-tinta hover:bg-nube"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  if (!sesion) {
    return <Login denegado={denegado} />;
  }

  // ── Modo empotrado: ?empotrado=chat ───────────────────────────────
  // JusticiaFácil muestra el chat DENTRO de su propia pantalla, en un
  // recuadro. Es EXACTAMENTE el mismo ChatInterno, la misma sesión y la
  // misma base de datos — aquí sólo se pinta sin la barra de arriba ni
  // el menú de la izquierda, porque ésos ya los pone JusticiaFácil.
  // No hay una segunda copia del chat: es éste, visto desde allá.
  // Los avisos flotantes (campanita, llamada entrante) tampoco se pintan
  // aquí, para que no salgan dobles cuando tengas los dos abiertos.
  if (EMPOTRADO === "chat") {
    // Mismo candado que el menú normal: si el rol de esta persona no tiene
    // el módulo "chat" entre los suyos, tampoco lo abre por esta dirección.
    if (!(misModulos as string[]).includes("chat")) {
      return (
        <div className="flex h-screen items-center justify-center bg-nube px-6 text-center text-sm text-humo">
          Tu usuario no tiene acceso al chat interno. Pídelo a la Dirección.
        </div>
      );
    }
    return (
      <div className="h-screen overflow-hidden bg-nube p-1 text-tinta sm:p-2">
        <Suspense fallback={<div className="flex items-center justify-center py-20 text-sm text-humo">Cargando el chat…</div>}>
          <ChatInterno
            target={chatTarget}
            identidad={{
              nombre: perfil?.nombre || sesion.email.split("@")[0],
              area: perfil?.area ?? null,
              correo: perfil?.email || sesion.email,
            }}
          />
        </Suspense>
      </div>
    );
  }

  // ── CRM Prospectos se movió al módulo Comercial (08-09-2026) ──
  // A quien tiene el módulo ya NO le sale en este menú: entra por la
  // pantalla Prospectos de la barra azul. A quien NO lo tiene —el asesor
  // comercial y facturación— se le deja aquí, porque si no se quedaría
  // sin CRM y es justo quien más lo usa.
  const tieneComercial = (misModulos as string[]).includes("comercial");
  const menuVisible = (clave: string) =>
    (misModulos as string[]).includes(clave) &&
    !(clave === "prospectos" && tieneComercial);

  const gruposVisibles = GRUPOS
    .map((g) => ({ ...g, modulos: g.modulos.filter((m) => menuVisible(m.clave)) }))
    .filter((g) => g.modulos.length > 0);
  const barraVisible = BARRA_MOVIL.filter((m) => m.clave === "bienvenida" || menuVisible(m.clave));

  const cab = ENCABEZADOS[vista];
  const nombreMostrar = perfil?.nombre || sesion.email.split("@")[0];
  const subMostrar = perfil?.rol ? (perfil.rol + (perfil.area ? " · " + perfil.area : "")) : sesion.email;
  const iniciales = (nombreMostrar || "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  // 👇 NUEVO: items del menú de la foto que esta persona SÍ puede ver.
  const menuUsuarioItems = ITEMS_MENU_USUARIO.filter((m) => (misModulos as string[]).includes(m.clave));

  // ── La barra de arriba ──
  // Se arma una sola vez y se usa en los dos lados: en el sistema y
  // dentro del módulo Comercial. Antes solo existía aquí abajo, y por
  // eso al entrar al módulo desaparecían la foto, la campanita y el
  // teléfono. No se duplica nada: es la misma barra, no una copia.
  const barraSuperior = (
          <header className="relative z-30 flex h-12 items-center justify-between gap-3 border-b border-black/5 bg-white/85 px-4 backdrop-blur sm:px-6 md:sticky md:top-0">
            <button
              onClick={() => setVista("bienvenida")}
              className="flex min-w-0 items-center gap-1.5 truncate text-left"
            >
              <span className="font-display text-sm font-extrabold text-tinta">{BRAND.nombre}</span>
              <span className="hidden truncate text-xs font-medium text-humo sm:inline">· {BRAND.empresa}</span>
            </button>
            <div className="flex items-center gap-1">
              {/* 1) FOTO del colaborador (primero) → menú: Configuración, Catálogo, Conmutador, Cerrar sesión */}
              <div className="relative">
                <button
                  onClick={() => setMenuUsuario((v) => !v)}
                  aria-label={"Tu cuenta · " + sesion.email}
                  className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-teal-soft text-[11px] font-extrabold text-teal-dark ring-1 ring-black/5"
                >
                  {miFoto ? <img src={miFoto} alt={nombreMostrar} className="h-full w-full object-cover" /> : (iniciales || "?")}
                </button>
                {menuUsuario && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuUsuario(false)} />
                    <div className="absolute right-0 top-10 z-50 w-60 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl">
                      {/* Encabezado: foto + nombre + rol */}
                      <div className="flex items-center gap-3 border-b border-black/5 px-4 py-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-soft text-xs font-extrabold text-teal-dark">
                          {miFoto ? <img src={miFoto} alt={nombreMostrar} className="h-full w-full object-cover" /> : (iniciales || "?")}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-tinta">{nombreMostrar}</div>
                          <div className="truncate text-[11px] text-humo">{subMostrar}</div>
                        </div>
                      </div>
                      {/* Accesos */}
                      <div className="py-1">
                        {menuUsuarioItems.map((m) => (
                          <button
                            key={m.clave}
                            onClick={() => { setMenuUsuario(false); setVista(m.clave); }}
                            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-tinta transition hover:bg-nube"
                          >
                            <span className="text-humo">{Icono[m.clave]}</span>
                            <span>{m.nombre}</span>
                          </button>
                        ))}
                        <div className="my-1 border-t border-black/5" />
                        <button
                          onClick={() => { setMenuUsuario(false); cerrarSesion(); }}
                          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-humo transition hover:bg-nube"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                          </svg>
                          <span>Cerrar sesión</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
  
              {/* 2) CAMPANITA (en medio) */}
              <Campanita
                onIr={() => setVista("llamadas")}
                onAbrirChat={(nombre) => { setChatTarget({ nombre, nonce: Date.now() }); setVista("chat"); }}
                onIrModulo={(modulo) => setVista(modulo as Vista)}
              />
  
              {/* 3) TELÉFONO del conmutador (al final) */}
              <LineaConmutadorBoton linea={linea} />
            </div>
          </header>
  );

  if (vista === "comercial") {
    return (
      <div className="flex h-screen flex-col bg-nube text-tinta">
        {barraSuperior}
        <div className="min-h-0 flex-1">
          <Suspense fallback={null}>
            <Comercial onSalir={() => setVista("bienvenida")} />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-nube text-tinta">
      <AvisosChat nombre={perfil?.nombre || sesion.email.split("@")[0]} onAbrir={() => setVista("chat")} />
      <LlamadaEntrante nombre={perfil?.nombre || sesion.email.split("@")[0]} />
      <ConmutadorEntrante nombre={perfil?.nombre || sesion.email.split("@")[0]} />
      <LineaConmutadorPantalla linea={linea} />
      <OnboardingGate correo={sesion.email} nombre={perfil?.nombre || sesion.email.split("@")[0]} />

      <aside className="fixed inset-x-0 top-0 z-40 hidden items-center gap-2 border-b border-black/5 bg-white px-3 py-2 md:inset-y-0 md:right-auto md:flex md:w-60 md:flex-col md:items-stretch md:gap-1 md:border-b-0 md:border-r md:px-4 md:py-5">
        <button
          onClick={() => setVista("bienvenida")}
          className="flex shrink-0 items-center gap-2.5 md:mb-4 md:px-1"
        >
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal to-aqua">
            <span className="font-display text-sm font-extrabold text-white">JC</span>
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-dorado ring-2 ring-white" />
          </div>
          <div className="hidden text-left leading-tight md:block">
            <div className="font-display text-base font-extrabold text-tinta">{BRAND.nombre}</div>
            <div className="text-[10px] font-medium text-humo">{BRAND.empresa}</div>
          </div>
        </button>

        <nav className="flex flex-1 gap-1 overflow-x-auto md:flex-col md:overflow-y-auto md:pb-4">
          {gruposVisibles.map((g) => (
            <div key={g.titulo} className="flex gap-1 md:flex-col md:gap-1">
              <p className={
                "hidden px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide md:block " +
                (g.destacado ? "text-teal" : "text-humo/70")
              }>
                {g.titulo}
              </p>
              {g.modulos.map((m) => (
                <button
                  key={m.clave}
                  onClick={() => setVista(m.clave)}
                  className={
                    "flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition " +
                    (vista === m.clave
                      ? (g.destacado ? "bg-teal font-semibold text-white" : "bg-teal-soft font-semibold text-teal-dark")
                      : g.destacado
                      ? "font-semibold text-teal hover:bg-teal-soft"
                      : "font-medium text-humo hover:bg-nube hover:text-tinta")
                  }
                >
                  <span className={vista === m.clave ? (g.destacado ? "text-white" : "text-teal") : g.destacado ? "text-teal" : "text-humo"}>
                    {Icono[m.clave]}
                  </span>
                  <span>{m.nombre}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-end border-t border-black/5 bg-white pt-1.5 pb-[calc(env(safe-area-inset-bottom)+14px)] md:hidden">
        {barraVisible.map((m) =>
          m.clave === "bienvenida" ? (
            <button
              key={m.clave}
              onClick={() => { setVista(m.clave); setMenuAbierto(false); }}
              className="flex flex-1 flex-col items-center gap-1.5"
            >
              <span className="-mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-white p-[3px] ring-1 ring-black/5">
                <svg viewBox="0 0 512 512" className="h-full w-full">
                  <defs>
                    <linearGradient id="navbg" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#10417C" />
                      <stop offset="0.55" stopColor="#0F6E8E" />
                      <stop offset="1" stopColor="#16A8A4" />
                    </linearGradient>
                    <linearGradient id="navdw" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#C8922A" />
                      <stop offset="0.5" stopColor="#F2D78A" />
                      <stop offset="1" stopColor="#FFFFFF" />
                    </linearGradient>
                  </defs>
                  <circle cx="256" cy="256" r="252" fill="url(#navbg)" />
                  <g transform="translate(146,146) scale(9.2)" fill="url(#navdw)">
                    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                  </g>
                </svg>
              </span>
              <span className={"text-[10px] font-medium " + (vista === m.clave ? "text-teal" : "text-humo")}>{m.nombre}</span>
            </button>
          ) : (
            <button
              key={m.clave}
              onClick={() => { setVista(m.clave); setMenuAbierto(false); }}
              className={
                "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] transition " +
                (vista === m.clave ? "text-teal" : "text-humo")
              }
            >
              {Icono[m.clave]}
              <span className="font-medium">{m.nombre}</span>
            </button>
          )
        )}
        <button
          onClick={() => setMenuAbierto(true)}
          className={
            "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] transition " +
            (!BARRA_MOVIL.some((m) => m.clave === vista) ? "text-teal" : "text-humo")
          }
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
          </svg>
          <span className="font-medium">Más</span>
        </button>
      </nav>

      {menuAbierto && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true">
          <button
            aria-label="Cerrar menú"
            onClick={() => setMenuAbierto(false)}
            className="absolute inset-0 bg-tinta/45"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-3xl bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3 shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-black/15" />
            {gruposVisibles.map((g) => (
              <div key={g.titulo} className="mb-2">
                <p className={
                  "px-1 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide " +
                  (g.destacado ? "text-teal" : "text-humo/70")
                }>{g.titulo}</p>
                <div className="flex flex-col gap-0.5">
                  {g.modulos.map((m) => (
                    <button
                      key={m.clave}
                      onClick={() => { setVista(m.clave); setMenuAbierto(false); }}
                      className={
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition " +
                        (vista === m.clave
                          ? (g.destacado ? "bg-teal font-semibold text-white" : "bg-teal-soft font-semibold text-teal-dark")
                          : g.destacado
                          ? "font-semibold text-teal hover:bg-teal-soft"
                          : "font-medium text-humo hover:bg-nube hover:text-tinta")
                      }
                    >
                      <span className={vista === m.clave ? (g.destacado ? "text-white" : "text-teal") : g.destacado ? "text-teal" : "text-humo"}>
                        {Icono[m.clave]}
                      </span>
                      <span>{m.nombre}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pb-[calc(86px+env(safe-area-inset-bottom))] md:pb-0 md:pl-60">
        {barraSuperior}

        {cab.titulo && (
          <div className="border-b border-black/5 bg-white/70 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
            <h1 className="font-display text-xl font-extrabold text-tinta">{cab.titulo}</h1>
            {cab.sub && <p className="mt-0.5 text-sm text-humo">{cab.sub}</p>}
          </div>
        )}

        <main className={vista === "chat" ? "p-1 sm:p-3 lg:p-4" : ""}>
          <Suspense fallback={<div className="flex items-center justify-center py-20 text-sm text-humo">Cargando…</div>}>
          {vista === "bienvenida" && <Bienvenida onIr={(v) => setVista(v)} onAbrirSeguimiento={(cliente) => { setSegTarget({ cliente, nonce: Date.now() }); setVista("seguimiento"); }} identidad={{ nombre: perfil?.nombre || sesion.email.split("@")[0], area: perfil?.area ?? null, correo: perfil?.email || sesion.email }} />}
          {vista === "directorio" && <Directorio onMensaje={(nombre) => { setChatTarget({ nombre, nonce: Date.now() }); setVista("chat"); }} />}
          {vista === "clientes" && <Clientes />}
          {vista === "chatcliente" && <ChatCliente />}
          {vista === "llamadas" && <Llamadas />}
          {vista === "kpis" && <Kpis />}
          {vista === "conmutador" && <Conmutador />}
          {vista === "chat" && <ChatInterno target={chatTarget} identidad={{ nombre: perfil?.nombre || sesion.email.split("@")[0], area: perfil?.area ?? null, correo: perfil?.email || sesion.email }} />}
          {vista === "videollamadas" && <Videollamadas />}
          {vista === "asistente" && <Asistente />}
          {vista === "configuracion" && <Configuracion />}
          {vista === "catalogo" && <Catalogo />}
          {vista === "seguimiento" && <Seguimiento target={segTarget} />}
          {vista === "milista" && <MiListaDelDia />}
          {vista === "prospectos" && <CrmProspectos />}
          {vista === "devoluciones" && <ControlDevoluciones target={devTarget} />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
