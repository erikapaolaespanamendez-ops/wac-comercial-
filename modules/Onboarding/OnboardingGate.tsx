import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { supabase } from "../../lib/supabase";
import { crearColaborador, subirFotoColaborador } from "../../data/colaboradores";
import { ROLES, GRUPOS_ROLES } from "../../data/roles";

const AREAS = [
  { clave: "direccion", nombre: "Dirección" },
  { clave: "juridico", nombre: "Jurídico" },
  { clave: "comercial", nombre: "Comercial" },
  { clave: "contabilidad", nombre: "Contabilidad" },
  { clave: "atencion", nombre: "Atención" },
  { clave: "tecnologia", nombre: "Tecnología" },
];

export default function OnboardingGate({ correo, nombre }: { correo: string; nombre: string }) {
  const [estado, setEstado] = useState<"cargando" | "falta" | "ok">("cargando");
  const [form, setForm] = useState<any>({ nombre: nombre || "", area: "direccion", rol: "" });
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const fotoRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let activo = true;
    async function revisar() {
      const c = (correo || "").toLowerCase();
      if (!c) { setEstado("ok"); return; }
      const { data } = await supabase.from("colaboradores").select("id").eq("correo", c).maybeSingle();
      if (!activo) return;
      if (data) { setEstado("ok"); return; }
      // Pre-selecciona el rol que el admin ya le haya asignado
      const { data: u } = await supabase.from("usuarios").select("rol").eq("email", c).maybeSingle();
      if (!activo) return;
      if (u?.rol && u.rol !== "pendiente") setForm((f: any) => ({ ...f, rol: u.rol }));
      setEstado("falta");
    }
    revisar();
    return () => { activo = false; };
  }, [correo]);

  function cambiar(campo: string, valor: any) {
    setForm((f: any) => ({ ...f, [campo]: valor }));
  }

  async function onFoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("La foto es muy grande (máximo 5 MB)."); return; }
    setSubiendoFoto(true);
    const url = await subirFotoColaborador(file);
    setSubiendoFoto(false);
    if (url) cambiar("foto_url", url);
    else alert("No se pudo subir la foto.");
  }

  async function guardar() {
    if (!form.nombre?.trim() || guardando) return;
    setGuardando(true);
    const c = (correo || "").toLowerCase();
    const rolDef = ROLES.find((r) => r.codigo === form.rol);
    const r = await crearColaborador({
      nombre: form.nombre.trim(),
      correo: c,
      puesto: rolDef?.nombre || "",
      area: form.area || "direccion",
      extension: form.extension || "",
      telefono: form.telefono || "",
      whatsapp: form.whatsapp || "",
      foto_url: form.foto_url || null,
      rol_sistema: "colaborador",
      activo: true,
    });
    // Guarda el rol elegido también en el acceso (para permisos)
    if (form.rol) {
      try { await supabase.from("usuarios").update({ rol: form.rol }).eq("email", c); } catch {}
    }
    setGuardando(false);
    if (r) setEstado("ok");
    else alert("No se pudo guardar. Revisa que tu nombre no esté repetido e intenta de nuevo.");
  }

  if (estado === "cargando" || estado === "ok") return null;

  const inputCls = "mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20";
  const labelCls = "text-xs font-medium text-humo";

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-tinta/50 p-4">
      <div className="my-6 w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl">
        <h2 className="font-display text-lg font-extrabold text-tinta">¡Bienvenido/a a JurisConecta! 👋</h2>
        <p className="mt-1 text-sm text-humo">Antes de entrar, completa tus datos. Así apareces en el Directorio y el conmutador del equipo.</p>

        <div className="mt-4 flex flex-col items-center gap-2">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-teal-soft text-2xl font-bold text-teal-dark">
            {form.foto_url ? <img src={form.foto_url} alt="foto" className="h-full w-full object-cover" /> : (form.nombre || "?").charAt(0).toUpperCase()}
          </div>
          <input ref={fotoRef} type="file" accept="image/*" className="hidden" onChange={onFoto} />
          <button onClick={() => fotoRef.current?.click()} disabled={subiendoFoto} className="rounded-lg border border-teal/30 px-3 py-1.5 text-xs font-semibold text-teal-dark hover:bg-teal-soft disabled:opacity-50">
            {subiendoFoto ? "Subiendo…" : "📷 Subir mi foto"}
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className={labelCls}>Nombre completo *</label>
            <input value={form.nombre || ""} onChange={(e) => cambiar("nombre", e.target.value)} className={inputCls} placeholder="Tu nombre completo" />
          </div>
          <div>
            <label className={labelCls}>Rol</label>
            <select value={form.rol || ""} onChange={(e) => cambiar("rol", e.target.value)} className={inputCls}>
              <option value="">— Elige tu rol —</option>
              {GRUPOS_ROLES.map((g) => (
                <optgroup key={g.clave} label={`${g.emoji} ${g.nombre}`}>
                  {ROLES.filter((r) => r.grupo === g.clave).map((r) => (
                    <option key={r.codigo} value={r.codigo}>{r.nombre}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelCls}>Área</label>
              <select value={form.area || ""} onChange={(e) => cambiar("area", e.target.value)} className={inputCls}>
                {AREAS.map((a) => (<option key={a.clave} value={a.clave}>{a.nombre}</option>))}
              </select>
            </div>
            <div className="flex-1">
              <label className={labelCls}>Extensión (conmutador)</label>
              <input value={form.extension || ""} onChange={(e) => cambiar("extension", e.target.value)} className={inputCls} placeholder="Ej. 100" />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelCls}>Teléfono</label>
              <input value={form.telefono || ""} onChange={(e) => cambiar("telefono", e.target.value)} className={inputCls} placeholder="10 dígitos" />
            </div>
            <div className="flex-1">
              <label className={labelCls}>WhatsApp</label>
              <input value={form.whatsapp || ""} onChange={(e) => cambiar("whatsapp", e.target.value)} className={inputCls} placeholder="10 dígitos" />
            </div>
          </div>
          <p className="text-xs text-humo">Tu correo <b className="break-all">{correo}</b> se guarda automáticamente.</p>
        </div>

        <button onClick={guardar} disabled={guardando || !form.nombre?.trim()} className="mt-5 w-full rounded-xl bg-teal px-4 py-3 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50">
          {guardando ? "Guardando…" : "Guardar y entrar"}
        </button>
      </div>
    </div>
  );
}
