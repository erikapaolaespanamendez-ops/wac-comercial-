// =====================================================================
//  MÓDULO COMERCIAL · La cáscara (pantalla completa)
//  →  src/modules/Comercial/Comercial.tsx
//
//  Esta pantalla se pinta ENCIMA de todo JurisConecta: se ocupa el
//  monitor completo y no se ve la barra lateral del CRM ni su logo.
//  Eso se logra porque App.tsx la manda a pintar ANTES de dibujar el
//  resto (ver instrucciones-de-instalacion.md).
//
//  Aquí adentro no hay datos ni lógica de negocio: solo el marco,
//  la barra azul de la izquierda y el botón para regresar. Cada
//  pantalla del proceso vive en su propio archivo.
// =====================================================================
import { useState } from "react";
// La pantalla de Catálogo ahora la manda ListaGarantias: trae adentro el
// conmutador Lista / Catálogo / Mapa y pinta la vitrina de siempre en su
// pestaña. Por eso ya no se importa CatalogoGarantias aquí.
import ListaGarantias from "./ListaGarantias";
import Carteras from "./Carteras";
// Los desarrollos propios (Plaza Leville) NO son cartera de cesión: no
// tienen crédito ni juicio y se venden por unidades. Por eso tienen su
// propia vitrina y no salen revueltos en el Catálogo de Garantías.
import CatalogoProyectos from "./CatalogoProyectos";
import ValidacionesPrecio from "./ValidacionesPrecio";
// El CRM de prospectos vive en su propio módulo, pero se pinta AQUÍ:
// es parte del proceso comercial. No se copió el código, se reusa el
// mismo componente, así que hay una sola versión de esa pantalla.
import CrmProspectos from "../CrmProspectos/CrmProspectos";

// Las pantallas del módulo, en el orden del proceso comercial.
type Pantalla =
  | "tablero" | "prospectos" | "catalogo" | "apartados" | "contratos"
  | "carteras" | "proyectos";

const PROCESO: { clave: Pantalla; nombre: string }[] = [
  { clave: "tablero", nombre: "Tablero" },
  { clave: "prospectos", nombre: "Prospectos" },
  { clave: "catalogo", nombre: "Catálogo" },
  { clave: "apartados", nombre: "Apartados" },
  { clave: "contratos", nombre: "Contratos" },
];

const ORIGEN: { clave: Pantalla; nombre: string }[] = [
  { clave: "carteras", nombre: "Carteras" },
  { clave: "proyectos", nombre: "Proyectos" },
];

// ── Dibujitos de la barra ────────────────────────────────────────────
// Van aquí mismo para no depender de ninguna librería de íconos.
const ICONOS: Record<Pantalla, JSX.Element> = {
  tablero: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-5 w-5">
      <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  prospectos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-5 w-5">
      <circle cx="10" cy="8" r="4" /><path d="M3 21v-1a6 6 0 0 1 6-6h1" /><circle cx="18" cy="17" r="3" /><path d="M20.5 19.5 22 21" />
    </svg>
  ),
  catalogo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3 21V10l7-5 7 5v11" /><path d="M9 21v-6h4v6" /><path d="M17 21h4V13l-4-3" />
    </svg>
  ),
  apartados: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M9 11V6a2 2 0 0 1 4 0v5" /><path d="M13 11V5a2 2 0 0 1 4 0v8a7 7 0 0 1-14 0v-2a2 2 0 0 1 4 0" />
    </svg>
  ),
  contratos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" />
    </svg>
  ),
  carteras: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
  // Dos niveles de locales con su anuncio: un desarrollo, no una carpeta.
  proyectos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3 21h18" /><path d="M5 21V8h11v13" />
      <path d="M5 14h11" /><path d="M19 21V5h2" />
      <path d="M8 11h2M8 17h2M12 11h2M12 17h2" />
    </svg>
  ),
};

// ── El logo ──────────────────────────────────────────────────────────
// Por ahora está dibujado con formas, para que no dependa de ningún
// archivo y no salga una imagen rota.
// 👉 CUANDO TENGAS EL LOGO EN SVG: guárdalo en public/logo-inmuebles.svg
//    y cambia todo este bloque <svg>…</svg> por una sola línea:
//    <img src="/logo-inmuebles.svg" alt="Inmuebles Accesibles" className="h-8" />
//    (No uses el JPG: trae fondo blanco y se va a ver un cuadro contra
//     el azul marino.)
function Logo() {
  return (
    <svg viewBox="0 0 78 40" className="h-8 w-auto" role="img" aria-label="Inmuebles Accesibles">
      <title>Inmuebles Accesibles</title>
      <polygon points="4,34 14,6 22,6 12,34" fill="#4E86D8" />
      <polygon points="22,34 32,6 42,6 32,34" fill="#7FAEEA" />
      <polygon points="46,34 58,6 66,6 78,34 68,34 62,18 56,34" fill="#8AEAE5" />
    </svg>
  );
}

// ── Un renglón de la barra ───────────────────────────────────────────
function ItemBarra({ clave, nombre, activo, onClick }: {
  clave: Pantalla; nombre: string; activo: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition " +
        (activo
          ? "bg-aqua-dark font-semibold text-aqua-soft"
          : "font-medium text-teal-light hover:bg-white/10 hover:text-white")
      }
    >
      <span className={activo ? "text-aqua-light" : "text-teal-light"}>{ICONOS[clave]}</span>
      <span>{nombre}</span>
    </button>
  );
}

// ── Pantalla que todavía no se construye ─────────────────────────────
// Para que los botones de la barra no queden muertos mientras vamos
// una por una.
function EnConstruccion({ nombre }: { nombre: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-24 text-center">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-10 w-10 text-humo/50">
        <circle cx="12" cy="12" r="9" /><path d="M12 8v5" strokeLinecap="round" /><circle cx="12" cy="16.5" r=".6" fill="currentColor" />
      </svg>
      <p className="font-display text-lg font-semibold text-tinta">{nombre}</p>
      <p className="max-w-sm text-sm text-humo">
        Esta pantalla todavía no se construye. Vamos una por una: primero el catálogo.
      </p>
    </div>
  );
}

// ── El módulo completo ───────────────────────────────────────────────
// onSalir: lo manda App.tsx. Al tocarlo, regresa a JurisConecta.
export default function Comercial({ onSalir }: { onSalir: () => void }) {
  const [pantalla, setPantalla] = useState<Pantalla>("catalogo");

  return (
    <div className="flex min-h-screen bg-nube text-tinta">
      {/* ── Barra azul marino de la izquierda ── */}
      <aside className="flex w-52 shrink-0 flex-col bg-teal-dark">
        <div className="border-b border-white/10 px-4 py-5">
          <Logo />
          <div className="mt-3 font-display text-sm font-semibold leading-tight text-white">
            Inmuebles Accesibles
          </div>
          <div className="mt-1 text-[10px] leading-tight text-teal-light">
            Asociados con DIIPA S.A. de C.V.
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-2.5 py-4">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wide text-aqua-light">
            Proceso
          </p>
          {PROCESO.map((m) => (
            <ItemBarra
              key={m.clave}
              clave={m.clave}
              nombre={m.nombre}
              activo={pantalla === m.clave}
              onClick={() => setPantalla(m.clave)}
            />
          ))}

          <p className="px-3 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-wide text-aqua-light">
            Origen
          </p>
          {ORIGEN.map((m) => (
            <ItemBarra
              key={m.clave}
              clave={m.clave}
              nombre={m.nombre}
              activo={pantalla === m.clave}
              onClick={() => setPantalla(m.clave)}
            />
          ))}
        </nav>

        {/* ── Botón de regresar a JurisConecta ── */}
        <div className="border-t border-white/10 px-2.5 py-3">
          <button
            onClick={onSalir}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-teal-light transition hover:bg-white/10 hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
            </svg>
            <span>Salir del módulo</span>
          </button>
        </div>
      </aside>

      {/* ── Lo que se ve a la derecha ── */}
      <main className="flex min-w-0 flex-1 flex-col bg-white">
        {pantalla === "catalogo" && <ListaGarantias />}
        {/* El Tablero arranca con la bandeja de validaciones de precio.
            Las demás tarjetas del tablero se agregan encima después. */}
        {pantalla === "tablero" && <ValidacionesPrecio />}
        {pantalla === "prospectos" && <CrmProspectos />}
        {pantalla === "apartados" && <EnConstruccion nombre="Apartados" />}
        {pantalla === "contratos" && <EnConstruccion nombre="Contratos" />}
        {pantalla === "carteras" && <Carteras />}
        {pantalla === "proyectos" && <CatalogoProyectos />}
      </main>
    </div>
  );
}
