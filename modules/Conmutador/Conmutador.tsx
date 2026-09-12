import { useEffect, useState } from "react";
import { emitirLlamada } from "../../data/conmutador";

// =====================================================================
//  CONMUTADOR · GUION OFICIAL  +  VOZ POR ÁREA
//  Cada locución del guion ahora se puede ESCUCHAR con la voz del
//  navegador (gratis, sin Twilio), igual que en la pantalla de Inicio.
//  Solo una voz suena a la vez. Botón ▶ para reproducir, ⏹ para detener.
// =====================================================================

// --- Motor de voz (mismo que usa la pantalla de Inicio) --------------
function vozEspanol(): SpeechSynthesisVoice | undefined {
  const voces = window.speechSynthesis?.getVoices() ?? [];
  return voces.find((v) => /es[-_]MX/i.test(v.lang)) || voces.find((v) => /^es/i.test(v.lang));
}

function hablar(texto: string, alTerminar?: () => void) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = "es-MX";
  u.rate = 0.96;
  const voz = vozEspanol();
  if (voz) u.voice = voz;
  if (alTerminar) u.onend = alTerminar;
  synth.speak(u);
}

// --- Tarjeta de locución: texto + ▶ Reproducir + 📋 Copiar -----------
function Locucion({
  id,
  titulo,
  texto,
  color,
  hablandoId,
  onReproducir,
  onDetener,
  soportaVoz,
}: {
  id: string;
  titulo?: string;
  texto: string;
  color?: string;
  hablandoId: string | null;
  onReproducir: (id: string, texto: string) => void;
  onDetener: () => void;
  soportaVoz: boolean;
}) {
  const [copiado, setCopiado] = useState(false);
  const sonando = hablandoId === id;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* si el navegador no deja copiar, igual se puede seleccionar a mano */
    }
  };

  return (
    <div className="rounded-xl border border-black/5 bg-white p-3 shadow-sm">
      {titulo && (
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: color || "#0C2E66" }}>
          {titulo}
        </div>
      )}
      <p className="whitespace-pre-line text-sm text-tinta">{texto}</p>
      <div className="mt-2 flex items-center gap-2">
        {soportaVoz &&
          (sonando ? (
            <button
              onClick={onDetener}
              className="rounded-lg bg-dorado px-2.5 py-1 text-[11px] font-bold text-tinta transition hover:bg-dorado-light"
            >
              ⏹ Detener
            </button>
          ) : (
            <button
              onClick={() => onReproducir(id, texto)}
              className="rounded-lg bg-teal px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-teal-dark"
            >
              ▶ Reproducir
            </button>
          ))}
        <button
          onClick={copiar}
          className="rounded-lg border border-black/10 px-2.5 py-1 text-[11px] font-medium text-humo transition hover:bg-nube"
        >
          {copiado ? "✓ Copiado" : "📋 Copiar"}
        </button>
      </div>
    </div>
  );
}

const MENU = [
  { n: "1", t: "Seguimiento de su caso" },
  { n: "2", t: "Información de propiedades y servicios" },
  { n: "3", t: "Temas jurídicos de su expediente" },
  { n: "4", t: "Facturación" },
  { n: "5", t: "Devoluciones" },
  { n: "0", t: "Hablar con una persona" },
];

const AREAS = [
  {
    num: "1", nombre: "Atención", color: "#1E50A0", emoji: "🟦",
    texto: "Gracias por comunicarse. Su caso es importante y está protegido y documentado. En seguida le atiende su asesor.",
  },
  {
    num: "2", nombre: "Comercial", color: "#16A34A", emoji: "🟩",
    texto: "En DIIPA le ofrecemos soluciones jurídicas reales para adquirir, recuperar o regularizar un inmueble, con certeza legal y respaldo documentado. Un asesor le explicará, sin compromiso, cómo proteger e incrementar su patrimonio. Permanezca en la línea.",
  },
  {
    num: "3", nombre: "Jurídico", color: "#7C3AED", emoji: "🟪",
    texto: "Le comunicamos con nuestro equipo jurídico. Recuerde que cada paso de su proceso queda por escrito y respaldado. En un momento le atendemos.",
  },
  {
    num: "4", nombre: "Facturación", color: "#EA580C", emoji: "🟧",
    texto: "Le comunicamos con Facturación. Tenga a la mano su número de expediente. Todo pago se respalda con su comprobante fiscal.",
  },
  {
    num: "5", nombre: "Devoluciones", color: "#0891B2", emoji: "🟦",
    texto: "Su tranquilidad es lo primero. En DIIPA las devoluciones se atienden con un convenio por escrito, y su espera se compensa: usted nunca pierde su lugar ni su dinero, y todo queda registrado en su expediente. En un momento le atiende un asesor.",
  },
];

const ESPERA_FRASES = [
  "Gracias por su paciencia. Atendemos en orden de llegada; su lugar está asegurado.",
  "En DIIPA, el cliente siempre gana: trabajamos con honestidad y todo por escrito.",
  "Cada etapa de su proceso queda documentada y protegida en su expediente.",
  "Nuestra misión es darle certeza jurídica y soluciones reales. Gracias por confiar en nosotros.",
];

const BIENVENIDA =
  "Le damos la bienvenida a DIIPA, especialistas en certeza jurídica y soluciones inmobiliarias. Aquí su patrimonio está en buenas manos: trabajamos con honestidad y todo por escrito. Su llamada puede ser grabada para calidad y para el seguimiento de su expediente.";

const MENU_LOCUCION =
  "Para seguimiento de su caso, marque 1. Para información de propiedades y servicios, marque 2. Para temas jurídicos de su expediente, marque 3. Para pagos y facturación, marque 4. Para devoluciones, marque 5. Para hablar con una persona, marque 0.";

const HORARIO =
  "En este momento nuestras oficinas están cerradas. Atendemos de lunes a viernes, de 9:00 a 14:00 y de 15:00 a 18:00 horas. Déjenos su nombre, teléfono y número de expediente después del tono y le devolveremos la llamada. También puede escribirnos a contacto@inmueblesaccesibles.com.";

const BUZON =
  "En este momento todos nuestros asesores están ocupados. Su llamada es importante: déjenos su nombre, teléfono y expediente, y le devolveremos la llamada a la brevedad. Gracias por su confianza.";

function Titulo({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-2 font-display text-sm font-bold uppercase tracking-wider text-teal-dark">{children}</h2>;
}

// --- Áreas para enrutar la llamada de prueba (mismas claves que en Configuración) ---
const AREAS_RUTEO = [
  { clave: "direccion", nombre: "Dirección" },
  { clave: "juridico", nombre: "Jurídico" },
  { clave: "comercial", nombre: "Comercial" },
  { clave: "contabilidad", nombre: "Contabilidad" },
  { clave: "atencion", nombre: "Atención" },
  { clave: "tecnologia", nombre: "Tecnología" },
];

// --- Botón para PROBAR el timbre en la app (hace sonar al destino) ---
function PanelPrueba() {
  const [modo, setModo] = useState<"area" | "extension">("area");
  const [area, setArea] = useState("comercial");
  const [ext, setExt] = useState("");
  const [enviado, setEnviado] = useState(false);

  function probar() {
    if (modo === "extension") {
      if (!ext.trim()) return;
      emitirLlamada({ deNumero: "Prueba", paraExtension: ext.trim() });
    } else {
      emitirLlamada({ deNumero: "Prueba", paraArea: area });
    }
    setEnviado(true);
    setTimeout(() => setEnviado(false), 2500);
  }

  return (
    <div className="mb-5 rounded-xl border border-teal/20 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-wide text-teal-dark">🔔 Probar timbre en la app</div>
      <p className="mt-1 text-sm text-humo">Hace sonar la app de quien tenga esa extensión o esté en esa área.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label className="text-xs font-medium text-humo">Dirigir a</label>
          <select value={modo} onChange={(e) => setModo(e.target.value as "area" | "extension")} className="mt-1 block rounded-xl border border-black/10 px-3 py-2 text-sm">
            <option value="area">Un área</option>
            <option value="extension">Una extensión</option>
          </select>
        </div>
        {modo === "area" ? (
          <div>
            <label className="text-xs font-medium text-humo">Área</label>
            <select value={area} onChange={(e) => setArea(e.target.value)} className="mt-1 block rounded-xl border border-black/10 px-3 py-2 text-sm">
              {AREAS_RUTEO.map((a) => <option key={a.clave} value={a.clave}>{a.nombre}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className="text-xs font-medium text-humo">Extensión</label>
            <input value={ext} onChange={(e) => setExt(e.target.value)} placeholder="Ej. 200" className="mt-1 block w-28 rounded-xl border border-black/10 px-3 py-2 text-sm" />
          </div>
        )}
        <button onClick={probar} className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-dark">📞 Probar llamada</button>
        {enviado && <span className="text-sm font-semibold text-aqua-dark">¡Enviada! Suena en el destino.</span>}
      </div>
    </div>
  );
}

export default function Conmutador() {
  const [hablandoId, setHablandoId] = useState<string | null>(null);
  const [soportaVoz, setSoportaVoz] = useState(true);

  useEffect(() => {
    if (!("speechSynthesis" in window)) setSoportaVoz(false);
    else window.speechSynthesis.getVoices(); // precarga las voces
    return () => window.speechSynthesis?.cancel();
  }, []);

  // Reproduce una locución. Si ya sonaba otra, la corta y arranca esta.
  const reproducir = (id: string, texto: string) => {
    setHablandoId(id);
    hablar(texto, () => setHablandoId((cur) => (cur === id ? null : cur)));
  };

  const detener = () => {
    window.speechSynthesis?.cancel();
    setHablandoId(null);
  };

  // Demo: bienvenida + menú seguidos, tal cual arranca una llamada real.
  const reproducirInicioLlamada = () => {
    setHablandoId("flujo");
    hablar(BIENVENIDA, () => {
      hablar(MENU_LOCUCION, () => setHablandoId((cur) => (cur === "flujo" ? null : cur)));
    });
  };

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-extrabold text-tinta">Conmutador · Guion oficial</h1>
          <p className="mt-1 text-sm text-humo">
            Libreto de la línea telefónica de DIIPA. Pulsa <b>▶ Reproducir</b> para escuchar cómo suena cada parte.
          </p>
        </div>
        {soportaVoz && (
          hablandoId === "flujo" ? (
            <button
              onClick={detener}
              className="rounded-full bg-dorado px-4 py-2 font-display text-sm font-bold text-tinta shadow transition hover:bg-dorado-light"
            >
              ⏹ Detener
            </button>
          ) : (
            <button
              onClick={reproducirInicioLlamada}
              className="rounded-full bg-teal px-4 py-2 font-display text-sm font-bold text-white shadow transition hover:bg-teal-dark"
            >
              ▶ Escuchar inicio de llamada
            </button>
          )
        )}
      </div>

      {!soportaVoz && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          🔇 Este navegador no reproduce voz. Prueba en <b>Chrome</b> o <b>Edge</b>. El guion se puede leer y copiar igual.
        </div>
      )}

      <div className="mb-5 rounded-xl border border-teal/20 bg-teal-soft px-4 py-3 text-sm text-teal-dark">
        📞 <b>¿Marcar a un cliente?</b> El marcador se movió al módulo de <b>Llamadas</b> (botón "📞 Marcar"): ahí llamas y queda registrado solo.
      </div>

      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        ⚙️ <b>Automatización pendiente:</b> hoy la voz suena aquí en la app (demostración). Para que el conmutador conteste <b>solo</b> al teléfono real (menú, espera, buzón) se conectará con <b>Twilio</b> (lo arma Jhon con cuenta + número). Este guion es la base exacta.
      </div>

      <PanelPrueba />

      {/* Identidad */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-black/5 bg-white p-3 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-teal-dark">Misión</div>
          <p className="mt-1 text-sm text-tinta">Dar certeza jurídica y soluciones reales para que las personas recuperen, regularicen o adquieran su patrimonio inmobiliario, con honestidad y todo por escrito.</p>
        </div>
        <div className="rounded-xl border border-black/5 bg-white p-3 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-teal-dark">Visión</div>
          <p className="mt-1 text-sm text-tinta">Ser la empresa de confianza donde el cliente nunca pierde.</p>
        </div>
        <div className="rounded-xl border border-black/5 bg-white p-3 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wide text-teal-dark">Beneficios</div>
          <p className="mt-1 text-sm text-tinta">Acompañamiento legal real · todo documentado · sin falsas promesas · equipo jurídico especializado · certeza en cada paso.</p>
        </div>
      </div>

      <Titulo>1 · Bienvenida</Titulo>
      <Locucion
        id="bienvenida"
        texto={BIENVENIDA}
        hablandoId={hablandoId}
        onReproducir={reproducir}
        onDetener={detener}
        soportaVoz={soportaVoz}
      />

      <Titulo>2 · Menú principal</Titulo>
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        {MENU.map((m) => (
          <div key={m.n} className="flex items-center gap-3 rounded-xl border border-black/5 bg-white p-3 shadow-sm">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-soft font-display font-bold text-teal-dark">{m.n}</span>
            <span className="text-sm text-tinta">{m.t}</span>
          </div>
        ))}
      </div>
      <Locucion
        id="menu"
        titulo="Locución del menú"
        texto={MENU_LOCUCION}
        hablandoId={hablandoId}
        onReproducir={reproducir}
        onDetener={detener}
        soportaVoz={soportaVoz}
      />

      <Titulo>3 · Mensajes al pasar a cada área</Titulo>
      <div className="grid gap-3 sm:grid-cols-2">
        {AREAS.map((a) => (
          <Locucion
            key={a.num}
            id={`area-${a.num}`}
            titulo={`${a.emoji} ${a.num} · ${a.nombre}`}
            texto={a.texto}
            color={a.color}
            hablandoId={hablandoId}
            onReproducir={reproducir}
            onDetener={detener}
            soportaVoz={soportaVoz}
          />
        ))}
      </div>

      <Titulo>4 · Frases de espera (rotan ~25 s)</Titulo>
      <div className="space-y-2">
        {ESPERA_FRASES.map((f, i) => (
          <Locucion
            key={i}
            id={`espera-${i}`}
            texto={f}
            hablandoId={hablandoId}
            onReproducir={reproducir}
            onDetener={detener}
            soportaVoz={soportaVoz}
          />
        ))}
      </div>
      <div className="mt-3 rounded-xl bg-nube px-4 py-3 text-sm text-humo">
        <b className="text-tinta">Lógica de la espera:</b> de inmediato se le dice que su lugar está asegurado · las frases rotan (no es silencio ni música eterna) · si la espera pasa de ~1–2 min → "Si prefiere, marque 0 y le devolvemos la llamada sin perder su lugar."
      </div>

      <Titulo>5 · Fuera de horario</Titulo>
      <Locucion
        id="horario"
        texto={HORARIO}
        hablandoId={hablandoId}
        onReproducir={reproducir}
        onDetener={detener}
        soportaVoz={soportaVoz}
      />
      <p className="mt-2 text-xs text-humo">Horario: lunes a viernes, 9:00–14:00 y 15:00–18:00.</p>

      <Titulo>6 · Buzón (nadie contesta)</Titulo>
      <Locucion
        id="buzon"
        texto={BUZON}
        hablandoId={hablandoId}
        onReproducir={reproducir}
        onDetener={detener}
        soportaVoz={soportaVoz}
      />
    </div>
  );
}
