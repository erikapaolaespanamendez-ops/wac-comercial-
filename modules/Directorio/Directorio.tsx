import { useEffect, useMemo, useState } from "react";
import { fetchColaboradores, type Colaborador } from "../../data/colaboradores";
import { linkWhatsApp, linkCorreoGmail } from "../../lib/contacto";
import LlamarGrabar from "../LlamarGrabar/LlamarGrabar";

const AREAS = [
  { clave: "direccion", nombre: "Dirección", color: "#C9A227" },
  { clave: "juridico", nombre: "Jurídico", color: "#7C3AED" },
  { clave: "comercial", nombre: "Comercial", color: "#16A34A" },
  { clave: "contabilidad", nombre: "Contabilidad", color: "#1E50A0" },
  { clave: "atencion", nombre: "Atención", color: "#EA580C" },
  { clave: "tecnologia", nombre: "Tecnología", color: "#64748B" },
  { clave: "_otros", nombre: "Otros", color: "#64748B" },
];

function Avatar({ nombre, foto, size = 40 }: { nombre: string; foto?: string | null; size?: number }) {
  const inicial = (nombre || "?").charAt(0).toUpperCase();
  if (foto) {
    return <img src={foto} alt={nombre} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div className="shrink-0 rounded-full bg-teal-soft flex items-center justify-center font-display font-bold text-teal-dark"
      style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {inicial}
    </div>
  );
}

function Tarjeta({ c, onMarcar, onMensaje }: { c: Colaborador; onMarcar: (c: Colaborador) => void; onMensaje?: (nombre: string) => void }) {
  const msgWhats = `Hola, le contactamos de DIIPA · Inmuebles Accesibles.`;
  const asunto = `Contacto · DIIPA Inmuebles Accesibles`;
  const whats = c.whatsapp || c.telefono;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-black/5 bg-white p-3 shadow-sm transition hover:shadow-md">
      <Avatar nombre={c.nombre} foto={c.foto_url} />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-bold text-tinta">{c.nombre}</h3>
        <p className="truncate text-xs text-humo">{c.puesto || "—"}</p>
        {c.extension && (
          <span className="mt-0.5 inline-block rounded bg-nube px-1.5 py-0.5 text-[11px] font-semibold text-teal-dark">Ext {c.extension}</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onMensaje && (
          <button onClick={() => onMensaje(c.nombre)} title="Mensaje interno (chat)" className="flex h-8 w-8 items-center justify-center rounded-lg bg-aqua text-white transition hover:bg-aqua-dark">🗨️</button>
        )}
        {c.telefono && (
          <button onClick={() => onMarcar(c)} title="Llamar y grabar" className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal text-white transition hover:bg-teal-dark">📞</button>
        )}
        {whats && (
          <button onClick={() => window.open(linkWhatsApp(whats!, msgWhats), "_blank")} title="WhatsApp" className="flex h-8 w-8 items-center justify-center rounded-lg border border-teal/30 transition hover:bg-teal-soft">💬</button>
        )}
        {c.correo && (
          <button onClick={() => window.open(linkCorreoGmail(c.correo!, asunto), "_blank")} title="Correo" className="flex h-8 w-8 items-center justify-center rounded-lg border border-teal/30 transition hover:bg-teal-soft">✉️</button>
        )}
        {!c.telefono && !whats && !c.correo && !onMensaje && <span className="text-[10px] text-humo">Sin datos</span>}
      </div>
    </div>
  );
}

export default function Directorio({ onMensaje }: { onMensaje?: (nombre: string) => void }) {
  const [busqueda, setBusqueda] = useState("");
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [marcando, setMarcando] = useState<Colaborador | null>(null);

  useEffect(() => {
    fetchColaboradores()
      .then((data) => setColaboradores(data.filter((c) => c.activo)))
      .catch(() => setError(true))
      .finally(() => setCargando(false));
  }, []);

  const grupos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtrados = colaboradores.filter((c) =>
      !q ||
      c.nombre.toLowerCase().includes(q) ||
      (c.puesto || "").toLowerCase().includes(q) ||
      (c.extension || "").includes(q)
    );
    return AREAS.map((a) => ({
      ...a,
      personas: filtrados.filter((c) =>
        a.clave === "_otros"
          ? !AREAS.some((x) => x.clave !== "_otros" && x.clave === c.area)
          : c.area === a.clave
      ),
    })).filter((g) => g.personas.length > 0);
  }, [busqueda, colaboradores]);

  const total = grupos.reduce((n, g) => n + g.personas.length, 0);

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, área o extensión…"
          className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm shadow-sm outline-none transition placeholder:text-humo/70 focus:border-teal focus:ring-2 focus:ring-teal/20"
        />
      </div>

      {cargando ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center text-humo">Cargando el directorio…</div>
      ) : error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-16 text-center text-amber-800">No se pudo conectar con la base de datos.</div>
      ) : grupos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center text-humo">
          {colaboradores.length === 0 ? "Aún no hay colaboradores. Agrégalos en Configuración." : `No encontramos a nadie con "${busqueda}".`}
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map((g) => (
            <section key={g.clave}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="font-display text-sm font-bold uppercase tracking-wider" style={{ color: g.color }}>{g.nombre}</h2>
                <span className="h-px flex-1 bg-gradient-to-r from-black/10 to-transparent" />
                <span className="rounded-full bg-teal-soft px-2.5 py-0.5 text-xs font-semibold text-teal-dark">{g.personas.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {g.personas.map((c) => (
                  <Tarjeta key={c.id} c={c} onMarcar={(per) => setMarcando(per)} onMensaje={onMensaje} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="mt-8 text-center text-xs text-humo">{total} colaboradores · Toca 🗨️, 📞, 💬 o ✉️ para contactar.</p>

      {marcando && (
        <LlamarGrabar
          numero={marcando.telefono || ""}
          nombre={marcando.nombre}
          area={marcando.area}
          interno
          onCerrar={() => setMarcando(null)}
        />
      )}
    </div>
  );
}
