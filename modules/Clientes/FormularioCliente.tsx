// ===================================================================
// FORMULARIO REGISTRAR CLIENTE → va en: src/modules/Clientes/FormularioCliente.tsx
// ===================================================================
import { useState, type ReactNode } from "react";
import { registrarCliente, ESTATUS, CODIGO, type Cliente, type Estatus, type Codigo, type Area, type TipoRegistro } from "../../data/clientes";
import { SUCURSALES } from "../../data/roles"; // 👈 NUEVO (Fase D.1)

const AREAS: Area[] = ["Comercial", "RAC", "Admin", "Jurídico", "UFC"];

interface FormState {
  nombre: string; curpRfc: string; ine: string; estadoCivil: string; conyuge: string; conyugeNotificado: boolean;
  telefono: string; telefono2: string; whatsapp: string; email: string; domicilio: string; comoConocio: string; refirio: string;
  autorizadoNombre: string; autorizadoTelefono: string; autorizadoCorreo: string;
  expediente: string; folioSiga: string; folioGarantiaSiga: string; creditoSiga: string;
  prospecto: string; garantia: string; fechaFirma: string;
  estatus: Estatus; codigo: Codigo; area: Area;
  tipo: TipoRegistro; direccionGarantia: string;
  sucursal: string; // 👈 NUEVO (Fase D.1)
}

const INICIAL: FormState = {
  nombre: "", curpRfc: "", ine: "", estadoCivil: "", conyuge: "", conyugeNotificado: false,
  telefono: "", telefono2: "", whatsapp: "", email: "", domicilio: "", comoConocio: "", refirio: "",
  autorizadoNombre: "", autorizadoTelefono: "", autorizadoCorreo: "",
  expediente: "", folioSiga: "", folioGarantiaSiga: "", creditoSiga: "",
  prospecto: "", garantia: "", fechaFirma: "",
  estatus: "apartado", codigo: "SVT", area: "Comercial",
  tipo: "cliente", direccionGarantia: "",
  sucursal: "", // 👈 NUEVO (Fase D.1): se elige al registrar
};

function Campo({ label, value, onChange, req, tipo }: { label: string; value: string; onChange: (v: string) => void; req?: boolean; tipo?: string }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-humo">{label}{req ? " *" : ""}</span>
      <input type={tipo || "text"} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20" />
    </label>
  );
}

function Titulo({ children }: { children: ReactNode }) {
  return <h4 className="mb-2 mt-1 text-xs font-bold uppercase tracking-wide text-teal-dark">{children}</h4>;
}

// 👇 Fase C: detecta duplicados.
//  - Garantía (GAR): NUNCA se puede repetir (sería fraude).
//  - Teléfono / correo: si ya existe esa persona, es el mismo registro.
function soloNum(s: string): string { return (s || "").replace(/\D/g, ""); }
function buscarDuplicado(existentes: Cliente[], f: { garantia: string; telefono: string; email: string }): { c: Cliente; motivo: string } | null {
  const gar = (f.garantia || "").trim().toUpperCase();
  const tel = soloNum(f.telefono);
  const mail = (f.email || "").trim().toLowerCase();
  for (const c of existentes) {
    if (gar && (c.garantia || "").trim().toUpperCase() === gar) return { c, motivo: `la garantía ${c.garantia} ya está registrada` };
    if (tel && soloNum(c.telefono) === tel) return { c, motivo: `el teléfono ${f.telefono} ya está en el sistema` };
    if (mail && (c.email || "").trim().toLowerCase() === mail) return { c, motivo: `el correo ${f.email} ya está en el sistema` };
  }
  return null;
}

export default function FormularioCliente({ onCerrar, onGuardado, existentes, onAbrirExistente }: { onCerrar: () => void; onGuardado: (c: Cliente) => void; existentes: Cliente[]; onAbrirExistente: (c: Cliente) => void }) {
  const [f, setF] = useState<FormState>(INICIAL);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [bloqueo, setBloqueo] = useState<{ c: Cliente; motivo: string } | null>(null);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  async function guardar() {
    if (!f.nombre.trim() || !f.telefono.trim() || !f.expediente.trim()) {
      setError("Faltan obligatorios: Nombre, Teléfono y Expediente.");
      return;
    }
    setError("");

    // 👇 Fase C: candado anti-duplicados (bloquea, no deja registrar)
    const dup = buscarDuplicado(existentes, f);
    if (dup) { setBloqueo(dup); return; }

    setGuardando(true);
    try {
      const nuevo = await registrarCliente(f);
      onGuardado(nuevo);
    } catch (e: any) {
      setError("No se pudo guardar: " + (e?.message || e));
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-tinta/40" onClick={onCerrar}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-nube shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/5 bg-white px-5 py-4">
          <h2 className="font-display text-xl font-extrabold text-tinta">Registrar cliente</h2>
          <button onClick={onCerrar} className="rounded-lg px-2 py-1 text-humo hover:bg-nube">✕</button>
        </div>

        <div className="space-y-5 p-5">

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <Titulo>Identificación</Titulo>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="Nombre completo" value={f.nombre} onChange={(v) => set("nombre", v)} req />
              <Campo label="CURP / RFC" value={f.curpRfc} onChange={(v) => set("curpRfc", v)} />
              <Campo label="INE" value={f.ine} onChange={(v) => set("ine", v)} />
              <Campo label="Estado civil" value={f.estadoCivil} onChange={(v) => set("estadoCivil", v)} />
              <Campo label="Cónyuge (si aplica)" value={f.conyuge} onChange={(v) => set("conyuge", v)} />
              <label className="flex items-center gap-2 sm:mt-5">
                <input type="checkbox" checked={f.conyugeNotificado} onChange={(e) => set("conyugeNotificado", e.target.checked)} />
                <span className="text-sm text-tinta">Cónyuge ya emplazado / notificado</span>
              </label>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <Titulo>Contacto</Titulo>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="Teléfono 1" value={f.telefono} onChange={(v) => set("telefono", v)} req />
              <Campo label="Teléfono 2" value={f.telefono2} onChange={(v) => set("telefono2", v)} />
              <Campo label="WhatsApp" value={f.whatsapp} onChange={(v) => set("whatsapp", v)} />
              <Campo label="Email" value={f.email} onChange={(v) => set("email", v)} />
              <div className="sm:col-span-2"><Campo label="Domicilio" value={f.domicilio} onChange={(v) => set("domicilio", v)} /></div>
              <Campo label="Cómo nos conoció" value={f.comoConocio} onChange={(v) => set("comoConocio", v)} />
              <Campo label="Quién lo refirió" value={f.refirio} onChange={(v) => set("refirio", v)} />
            </div>
            <div className="mt-3 rounded-xl bg-nube p-3">
              <Titulo>Persona autorizada (para dar información)</Titulo>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Campo label="Nombre" value={f.autorizadoNombre} onChange={(v) => set("autorizadoNombre", v)} />
                <Campo label="Teléfono" value={f.autorizadoTelefono} onChange={(v) => set("autorizadoTelefono", v)} />
                <Campo label="Correo" value={f.autorizadoCorreo} onChange={(v) => set("autorizadoCorreo", v)} />
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <Titulo>Expediente y vínculos con SIGA</Titulo>
            <div className="mb-3 rounded-xl bg-nube p-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-humo">🔎 Buscar en SIGA</span>
              <div className="mt-1 flex gap-2">
                <input disabled placeholder="Folio PROS, garantía o dirección…" className="flex-1 rounded-lg border border-black/10 bg-white/60 px-3 py-2 text-sm text-humo" />
                <button type="button" disabled className="shrink-0 rounded-lg bg-black/5 px-3 py-2 text-xs font-semibold text-humo">Próximamente</button>
              </div>
              <p className="mt-1 text-[11px] text-humo">Cuando SIGA esté conectado, esto traerá folios y dirección y los auto-rellena. Por ahora captúralos a mano abajo.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="Expediente" value={f.expediente} onChange={(v) => set("expediente", v)} req />
              <Campo label="Folio SIGA (cliente)" value={f.folioSiga} onChange={(v) => set("folioSiga", v)} />
              <Campo label="Folio de garantía SIGA" value={f.folioGarantiaSiga} onChange={(v) => set("folioGarantiaSiga", v)} />
              <Campo label="Número de crédito SIGA" value={f.creditoSiga} onChange={(v) => set("creditoSiga", v)} />
              <Campo label="Prospecto (PROS)" value={f.prospecto} onChange={(v) => set("prospecto", v)} />
              <Campo label="Garantía (GAR)" value={f.garantia} onChange={(v) => set("garantia", v)} />
              <div className="sm:col-span-2"><Campo label="Dirección de la garantía" value={f.direccionGarantia} onChange={(v) => set("direccionGarantia", v)} /></div>
              <Campo label="Fecha de firma" value={f.fechaFirma} onChange={(v) => set("fechaFirma", v)} tipo="date" />
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <Titulo>Clasificación</Titulo>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-humo">Estatus</span>
                <select value={f.estatus} onChange={(e) => set("estatus", e.target.value as Estatus)} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal">
                  {(Object.keys(ESTATUS) as Estatus[]).map((k) => <option key={k} value={k}>{ESTATUS[k].label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-humo">Código</span>
                <select value={f.codigo} onChange={(e) => set("codigo", e.target.value as Codigo)} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal">
                  {(Object.keys(CODIGO) as Codigo[]).map((k) => <option key={k} value={k}>{k} · {CODIGO[k]}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-humo">Área</span>
                <select value={f.area} onChange={(e) => set("area", e.target.value as Area)} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal">
                  {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              {/* 👇 NUEVO (Fase D.1): Sucursal — ordena la carpeta del expediente en Drive */}
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-humo">Sucursal</span>
                <select value={f.sucursal} onChange={(e) => set("sucursal", e.target.value)} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal">
                  <option value="">— Selecciona sucursal —</option>
                  {SUCURSALES.map((s) => <option key={s.clave} value={s.nombre}>{s.nombre}</option>)}
                </select>
              </label>
            </div>
          </section>

          {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}

          <div className="flex gap-2">
            <button onClick={guardar} disabled={guardando} className="flex-1 rounded-xl bg-teal px-4 py-3 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">{guardando ? "Guardando…" : "Guardar cliente"}</button>
            <button onClick={onCerrar} disabled={guardando} className="rounded-xl border border-black/10 px-4 py-3 text-sm font-semibold text-humo hover:bg-white disabled:opacity-50">Cancelar</button>
          </div>
        </div>
      </div>

      {bloqueo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-tinta/50 p-4" onClick={() => setBloqueo(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 text-2xl">⛔</div>
            <h3 className="font-display text-lg font-bold text-tinta">No se puede registrar</h3>
            <p className="mt-2 text-sm text-humo">Es un duplicado: {bloqueo.motivo}.</p>
            <div className="mt-3 rounded-xl border border-black/5 bg-nube p-3">
              <div className="text-sm font-semibold text-tinta">{bloqueo.c.nombre}</div>
              <div className="mt-0.5 text-[12px] text-humo">{[bloqueo.c.folio, bloqueo.c.garantia, bloqueo.c.telefono].filter(Boolean).join(" · ")}</div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => { const c = bloqueo.c; setBloqueo(null); onAbrirExistente(c); }} className="flex-1 rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-dark">Abrir el existente</button>
              <button onClick={() => setBloqueo(null)} className="rounded-xl border border-black/10 px-4 py-2.5 text-sm font-semibold text-humo hover:bg-nube">Volver</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
