// KPIs Comercial (prospectos) · Fase 5 · vive dentro del módulo de KPIs
import { useEffect, useMemo, useState } from "react";
import { fetchProspectos, fetchTodosToques, ORIGENES, FASES_FUNNEL, type Prospecto, type Toque, type Fase } from "../../data/prospectos";

// Embudo (orden de avance). Solo hasta Apartado; los convertidos a Cliente se cuentan aparte.
const EMBUDO: Fase[] = FASES_FUNNEL;
const CITA_MAS: Fase[] = ["Cita", "Perfilado", "Apartado", "Contrato", "Cliente"];
const APARTADO_MAS: Fase[] = ["Apartado", "Contrato", "Cliente"];

const ICONO_ORIGEN: Record<string, string> = {
  Facebook: "📘", Instagram: "📷", Referido: "🤝", Campaña: "📣", Chatwoot: "💬", Otro: "•",
};

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const diaDe = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? null : d; };

export default function KpisProspectos() {
  const [lista, setLista] = useState<Prospecto[]>([]);
  const [toques, setToques] = useState<Toque[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([fetchProspectos(), fetchTodosToques()])
      .then(([p, t]) => { setLista(p); setToques(t); })
      .catch(() => setError(true))
      .finally(() => setCargando(false));
  }, []);

  // Primer toque por prospecto (para "tiempo al primer contacto").
  const primerToque = useMemo(() => {
    const m = new Map<string, Toque>();
    for (const t of [...toques].sort((a, b) => (a.fecha < b.fecha ? -1 : 1))) {
      if (!m.has(t.prospectoId)) m.set(t.prospectoId, t);
    }
    return m;
  }, [toques]);
  const conToque = useMemo(() => new Set(toques.map((t) => t.prospectoId)), [toques]);

  const k = useMemo(() => {
    const total = lista.length;
    const porOrigen = ORIGENES.map((o) => ({ origen: o, n: lista.filter((p) => p.origen === o).length }));
    const contactados = lista.filter((p) => conToque.has(p.id)).length;

    // Tiempo al primer contacto
    let mismoDia = 0, conMedicion = 0, sumaDias = 0;
    for (const p of lista) {
      const pt = primerToque.get(p.id);
      const lead = diaDe(p.fechaLead);
      if (!pt || !lead) continue;
      const t = diaDe(pt.fecha);
      if (!t) continue;
      conMedicion++;
      const dias = Math.floor((t.getTime() - lead.getTime()) / 86400000);
      sumaDias += Math.max(0, dias);
      if (dias <= 0) mismoDia++;
    }

    // Embudo + conversión
    const porFase = EMBUDO.map((f) => ({ fase: f, n: lista.filter((p) => p.fase === f).length }));
    const citas = lista.filter((p) => CITA_MAS.includes(p.fase)).length;
    const apartados = lista.filter((p) => APARTADO_MAS.includes(p.fase)).length;
    const clientes = lista.filter((p) => p.fase === "Cliente").length;
    const frios = lista.filter((p) => p.fase === "Frío").length;
    const perdidos = lista.filter((p) => p.fase === "Perdido").length;

    // % con siguiente paso agendado (tiene fecha_proximo en el futuro o un toque con siguiente paso)
    const conSiguiente = lista.filter((p) => !!p.fechaProximo).length;

    return {
      total, porOrigen, contactados,
      mismoDia, conMedicion, promedioDias: conMedicion ? Math.round((sumaDias / conMedicion) * 10) / 10 : 0,
      porFase, citas, apartados, clientes, frios, perdidos, conSiguiente,
    };
  }, [lista, conToque, primerToque]);

  // Por asesor
  const porAsesor = useMemo(() => {
    const m = new Map<string, { leads: number; contactados: number; citas: number; apartados: number; clientes: number }>();
    for (const p of lista) {
      const a = p.asesor?.trim() || "Sin asignar";
      if (!m.has(a)) m.set(a, { leads: 0, contactados: 0, citas: 0, apartados: 0, clientes: 0 });
      const o = m.get(a)!;
      o.leads++;
      if (conToque.has(p.id)) o.contactados++;
      if (CITA_MAS.includes(p.fase)) o.citas++;
      if (APARTADO_MAS.includes(p.fase)) o.apartados++;
      if (p.fase === "Cliente") o.clientes++;
    }
    return [...m.entries()].map(([asesor, v]) => ({ asesor, ...v })).sort((a, b) => b.leads - a.leads);
  }, [lista, conToque]);

  if (cargando) return <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center text-humo">Cargando prospectos…</div>;
  if (error) return <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-16 text-center text-amber-800">No se pudo cargar la información.</div>;
  if (k.total === 0) return <div className="rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center text-humo">Todavía no hay leads registrados en CRM Prospectos.</div>;

  const maxFase = Math.max(1, ...k.porFase.map((f) => f.n));

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card etiqueta="Leads totales" valor={k.total} />
        <Card etiqueta="Contactados" valor={`${k.contactados} · ${pct(k.contactados, k.total)}%`} color="text-teal" />
        <Card etiqueta="1er contacto mismo día" valor={`${k.mismoDia} · ${pct(k.mismoDia, k.conMedicion)}%`} color={pct(k.mismoDia, k.conMedicion) >= 50 ? "text-emerald-600" : "text-amber-600"} />
        <Card etiqueta="Prom. días al contacto" valor={k.promedioDias} sub="meta: 0 (mismo día)" />
      </div>

      {/* Por origen (Facebook / Instagram / …) */}
      <Bloque titulo="Leads por origen">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {k.porOrigen.map((o) => (
            <div key={o.origen} className="rounded-xl border border-black/5 bg-white px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-humo">{ICONO_ORIGEN[o.origen]} {o.origen}</div>
              <div className="font-display text-xl font-extrabold text-tinta">{o.n} <span className="text-xs font-medium text-humo">· {pct(o.n, k.total)}%</span></div>
            </div>
          ))}
        </div>
      </Bloque>

      {/* Embudo */}
      <Bloque titulo="Embudo (en qué fase están)">
        <div className="space-y-1.5">
          {k.porFase.map((f) => (
            <div key={f.fase} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-[13px] font-medium text-tinta">{f.fase}</span>
              <div className="h-5 flex-1 rounded-full bg-nube">
                <div className="flex h-5 items-center justify-end rounded-full bg-teal px-2 text-[11px] font-bold text-white" style={{ width: `${Math.max(8, (f.n / maxFase) * 100)}%` }}>{f.n || ""}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-humo">Frío: {k.frios} · Perdido: {k.perdidos}</p>
      </Bloque>

      {/* Conversión */}
      <Bloque titulo="Conversión">
        <div className="grid grid-cols-3 gap-2">
          <Card etiqueta="Lead → Cita" valor={`${pct(k.citas, k.total)}%`} sub={`${k.citas} citas`} color="text-violet-700" compacto />
          <Card etiqueta="Lead → Apartado" valor={`${pct(k.apartados, k.total)}%`} sub={`${k.apartados} apartados`} color="text-emerald-700" compacto />
          <Card etiqueta="Lead → Cliente" valor={`${pct(k.clientes, k.total)}%`} sub={`${k.clientes} clientes`} color="text-green-700" compacto />
        </div>
        <p className="mt-2 text-[12px] text-humo">{k.conSiguiente} de {k.total} leads ({pct(k.conSiguiente, k.total)}%) tienen un siguiente toque agendado.</p>
      </Bloque>

      {/* Por asesor */}
      <Bloque titulo="Por asesor">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left text-[11px] font-semibold uppercase tracking-wide text-humo">
                <th className="px-3 py-2">Asesor</th>
                <th className="px-3 py-2 text-center">Leads</th>
                <th className="px-3 py-2 text-center">Contact.</th>
                <th className="px-3 py-2 text-center">Citas</th>
                <th className="px-3 py-2 text-center">Apartados</th>
                <th className="px-3 py-2 text-center">Clientes</th>
              </tr>
            </thead>
            <tbody>
              {porAsesor.map((a) => (
                <tr key={a.asesor} className="border-b border-black/5 last:border-0">
                  <td className="px-3 py-2 font-medium text-tinta">{a.asesor}</td>
                  <td className="px-3 py-2 text-center">{a.leads}</td>
                  <td className="px-3 py-2 text-center text-teal-dark">{a.contactados}</td>
                  <td className="px-3 py-2 text-center text-violet-700">{a.citas}</td>
                  <td className="px-3 py-2 text-center text-emerald-700">{a.apartados}</td>
                  <td className="px-3 py-2 text-center text-green-700">{a.clientes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloque>
    </div>
  );
}

function Card({ etiqueta, valor, sub, color, compacto }: { etiqueta: string; valor: string | number; sub?: string; color?: string; compacto?: boolean }) {
  return (
    <div className={"rounded-2xl border border-black/5 bg-white shadow-sm " + (compacto ? "px-3 py-2" : "px-4 py-3")}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-humo">{etiqueta}</div>
      <div className={"font-display font-extrabold " + (compacto ? "text-lg" : "text-2xl") + " " + (color || "text-tinta")}>{valor}</div>
      {sub && <div className="text-[11px] text-humo">{sub}</div>}
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-3 shadow-sm">
      <p className="mb-2 font-display text-xs font-bold uppercase tracking-wider text-teal-dark">{titulo}</p>
      {children}
    </div>
  );
}
