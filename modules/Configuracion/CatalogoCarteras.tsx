// =====================================================================
//  CONFIGURACIÓN · Catálogo de carteras
//  →  src/modules/Configuracion/CatalogoCarteras.tsx
//
//  Una CARTERA es el fondo dueño de los créditos: FOME II P2, SCRAP II,
//  ADAMANTINE, DECAROME. Es quien aparece demandando, o sea EL ACTOR.
//
//  El nombre completo del actor se escribe UNA VEZ aquí y todas sus
//  garantías lo heredan. Antes se pedía garantía por garantía y por eso
//  estaba lleno en 1 de 47.
//
//  LA ADMINISTRADORA QUE SE ELIGE AQUÍ ES DATO INFORMATIVO: dice con
//  quién se compra normalmente esa cartera, para ubicarla de un vistazo
//  y para que la pantalla de Comercial no la muestre "Sin administradora".
//  NO es el vínculo bueno. El vínculo bueno —de qué administradora, de
//  qué cartera y de qué mes llegó cada garantía— vive en el ORIGEN de
//  cada garantía (`garantia_origen`), porque el mismo fondo le vende a
//  varias y una garantía puede tener varios orígenes. La columna
//  "Ha llegado por" de la tabla es la que sale del origen: ésa es la
//  verdad, la de arriba es sólo la referencia.
//
//  QUÉ SE PUEDE BORRAR Y QUÉ NO:
//  · ARCHIVAR es lo normal. La cartera se conserva con todo y su
//    historia, pero deja de aparecer en Comercial. Se puede desarchivar.
//  · ELIMINAR sólo se ofrece si la cartera NUNCA tuvo garantías. Si ya
//    tuvo, su código quedó escrito en el origen de cada una y en los
//    documentos: al borrarla se perdería de dónde salió esa cartera.
//    Ahí no hay botón, hay que archivar.
// =====================================================================
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { accionPermitida } from "../../data/permisos";
import { listarVisibilidad, puedeVerCampo, type CampoVisibilidad } from "../../data/niveles";

// Quien puede cambiar el catalogo sale de la tabla de permisos
// (Configuracion > Roles y Permisos > accion "cartera_editar").
// Esta lista solo se usa si los permisos todavia no cargaron.
const ROLES_EDITAN = ["Super_Admin", "DGE", "GAD"];

type Cartera = {
  id?: string;
  codigo: string | null;
  nombre: string;
  actor: string | null;
  administradora_codigo: string | null;
  estatus: string | null;
  notas: string | null;
};

type Administradora = {
  codigo: string;
  nombre: string;
  activo: boolean;
};

const VACIA: Cartera = {
  codigo: null, nombre: "", actor: null, administradora_codigo: null,
  estatus: "activa", notas: null,
};

const campo = "w-full rounded-lg border border-black/10 bg-nube px-3 py-2 text-sm text-tinta outline-none focus:border-teal focus:bg-white";
const etiqueta = "mb-1 block text-xs text-humo";

export default function CarterasCatalogo({ miRol }: { miRol: string | null }) {
  const [lista, setLista] = useState<Cartera[]>([]);
  const [administradoras, setAdministradoras] = useState<Administradora[]>([]);
  const [garantias, setGarantias] = useState<Record<string, number>>({});
  const [admins, setAdmins] = useState<Record<string, string[]>>({});
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [editando, setEditando] = useState<Cartera | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [verArchivadas, setVerArchivadas] = useState(false);

  const [vis, setVis] = useState<CampoVisibilidad[]>([]);
  useEffect(() => { listarVisibilidad().then(setVis); }, []);

  const permiso = accionPermitida(miRol, "cartera_editar");
  const puedeEditar = permiso === null ? ROLES_EDITAN.includes(miRol || "") : permiso;

  // El nombre de la cartera es dato reservado: quien no lo puede ver trabaja
  // con el codigo. Puede corregir lo demas, pero el nombre le queda bloqueado.
  const veNombre = puedeVerCampo(vis, miRol, "cartera_nombre");
  function nombreVisible(k: Cartera): string {
    return veNombre ? k.nombre : (k.codigo ?? "—");
  }

  // El nombre de la administradora tambien es reservado (DGE, GAD y RAC).
  // Quien no lo ve trabaja con el codigo ADM-00N, en la lista y en la tabla.
  const veNombreAdmin = puedeVerCampo(vis, miRol, "administradora_nombre");
  function nombreAdmin(codigo: string | null): string {
    if (!codigo) return "—";
    if (!veNombreAdmin) return codigo;
    const a = administradoras.find((x) => x.codigo === codigo);
    return a ? codigo + " · " + a.nombre : codigo;
  }

  async function traer() {
    setCargando(true);
    const { data, error } = await supabase
      .from("cartera")
      .select("id,codigo,nombre,actor,administradora_codigo,estatus,notas")
      .order("codigo");
    if (error) { setAviso("No se pudo leer el catálogo: " + error.message); setCargando(false); return; }
    setLista((data ?? []) as Cartera[]);

    // El catálogo de administradoras, para poder elegir una. Se traen
    // todas, no sólo las activas: si una cartera vieja quedó apuntando a
    // una administradora ya inactiva, hay que poder seguir viéndola.
    const { data: adm } = await supabase
      .from("administradora")
      .select("codigo,nombre,activo")
      .order("codigo");
    if (adm) setAdministradoras(adm as Administradora[]);

    // Cuántas garantías tiene cada cartera. Se cuenta por el vínculo
    // directo `garantia.cartera_id`, que es el que está poblado, y se le
    // suman las que sólo aparecen en el origen. Es la cuenta que decide
    // si una cartera se puede eliminar, así que se cuentan TODAS,
    // incluidas las archivadas: una garantía archivada sigue siendo
    // historia de esa cartera.
    const porCartera: Record<string, Set<string>> = {};

    const { data: gar } = await supabase.from("garantia").select("id,cartera_id");
    if (gar) {
      for (const g of gar as { id: string; cartera_id: string | null }[]) {
        if (g.cartera_id) (porCartera[g.cartera_id] ??= new Set()).add(g.id);
      }
    }

    // Y por qué administradoras ha llegado cada cartera. Esto sale del
    // origen, no de la cartera: una misma cartera puede haber llegado
    // por varias.
    const { data: orig } = await supabase
      .from("garantia_origen")
      .select("cartera_id,administradora_codigo,garantia_id");
    if (orig) {
      const porAdmin: Record<string, Set<string>> = {};
      for (const o of orig as { cartera_id: string | null; administradora_codigo: string | null; garantia_id: string }[]) {
        if (!o.cartera_id) continue;
        (porCartera[o.cartera_id] ??= new Set()).add(o.garantia_id);
        if (o.administradora_codigo) (porAdmin[o.cartera_id] ??= new Set()).add(o.administradora_codigo);
      }
      setAdmins(Object.fromEntries(Object.entries(porAdmin).map(([k, v]) => [k, [...v].sort()])));
    }

    setGarantias(Object.fromEntries(Object.entries(porCartera).map(([k, v]) => [k, v.size])));
    setCargando(false);
  }

  useEffect(() => { void traer(); }, []);

  // El siguiente código libre. No reutiliza huecos: un código dado de
  // baja pudo quedar escrito en un documento viejo.
  function siguienteCodigo(): string {
    const nums = lista
      .map((c) => parseInt((c.codigo ?? "").replace(/\D/g, ""), 10))
      .filter((n) => !isNaN(n));
    return "CAR-" + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0");
  }

  async function guardar() {
    if (!editando) return;
    const nombre = editando.nombre.trim();
    if (!nombre) { setAviso("La cartera necesita nombre."); return; }
    if (lista.some((c) => c.nombre.trim().toUpperCase() === nombre.toUpperCase() && c.id !== editando.id)) {
      setAviso("Ya existe una cartera con ese nombre."); return;
    }

    setGuardando(true);
    setAviso(null);
    const fila = {
      nombre,
      codigo: editando.codigo,
      actor: editando.actor,
      administradora_codigo: editando.administradora_codigo,
      estatus: editando.estatus,
      notas: editando.notas,
      actualizado_en: new Date().toISOString(),
    };
    const { error } = editando.id
      ? await supabase.from("cartera").update(fila).eq("id", editando.id)
      : await supabase.from("cartera").insert({ ...fila, codigo: siguienteCodigo() });

    setGuardando(false);
    if (error) { setAviso("No se pudo guardar: " + error.message); return; }
    setEditando(null);
    await traer();
  }

  // ── Archivar y eliminar ──
  // Archivar es lo normal: la cartera se conserva con toda su historia
  // pero deja de aparecer en Comercial, porque esa pantalla ya filtra
  // las archivadas. Se puede desarchivar cuando se quiera.
  async function archivar(c: Cartera, siArchiva: boolean) {
    if (!c.id) return;
    setAviso(null);
    const { error } = await supabase.from("cartera")
      .update({ estatus: siArchiva ? "archivada" : "activa", actualizado_en: new Date().toISOString() })
      .eq("id", c.id);
    if (error) { setAviso("No se pudo cambiar: " + error.message); return; }
    await traer();
  }

  // Eliminar borra el renglón de verdad. Sólo se permite si la cartera
  // nunca tuvo garantías; si tuvo, su código quedó escrito en el origen
  // de cada una y borrarla dejaría garantías sin saber de dónde salieron.
  async function eliminar(c: Cartera) {
    if (!c.id) return;
    if ((garantias[c.id] ?? 0) > 0) {
      setAviso("Esa cartera ya tuvo garantías: no se elimina, se archiva.");
      return;
    }
    if (!window.confirm("¿Eliminar la cartera " + (c.codigo ?? c.nombre) + "? Su código no se vuelve a usar.")) return;
    setAviso(null);
    const { error } = await supabase.from("cartera").delete().eq("id", c.id);
    if (error) { setAviso("No se pudo eliminar: " + error.message); return; }
    await traer();
  }

  const visibles = lista.filter((c) => verArchivadas || c.estatus !== "archivada");
  const sinActor = visibles.filter((c) => !c.actor).length;

  return (
    <section className="mt-6 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-base font-extrabold text-tinta">📁 Carteras</h2>
        <span className="text-sm text-humo">
          {lista.filter((c) => c.estatus !== "archivada").length} activas · {lista.length} en total
        </span>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-humo">
            <input type="checkbox" checked={verArchivadas}
              onChange={(e) => setVerArchivadas(e.target.checked)} />
            Ver las archivadas
          </label>
          {puedeEditar && (
            <button onClick={() => { setEditando({ ...VACIA }); setAviso(null); }}
              className="rounded-lg bg-teal px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-dark">
              Nueva cartera
            </button>
          )}
        </div>
      </div>

      <p className="mt-1 text-sm text-humo">
        El fondo dueño de los créditos, que es quien demanda. La administradora que se
        elige aquí es con quién se compra normalmente esa cartera, como referencia: el
        mismo fondo puede venderle a varias, y de qué administradora llegó cada garantía
        se guarda en su origen, que es lo que muestra la columna “Ha llegado por”.
      </p>

      {sinActor > 0 && (
        <p className="mt-3 rounded-xl bg-dorado-soft/40 px-4 py-2 text-sm text-dorado-dark">
          {sinActor === 1 ? "Una cartera no tiene" : sinActor + " carteras no tienen"} nombre de actor.
          Sin él, sus garantías no pueden heredar quién demanda.
        </p>
      )}

      {aviso && <p className="mt-3 rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700">{aviso}</p>}

      {editando && (
        <div className="mt-4 rounded-2xl border-2 border-teal/40 bg-nube/40 p-4">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-sm font-bold text-tinta">
              {editando.id ? "Editar " + (editando.codigo ?? "") : "Nueva cartera"}
            </h3>
            {!editando.id && (
              <span className="rounded-full bg-white px-2 py-0.5 font-mono text-xs text-humo">
                le tocará {siguienteCodigo()}
              </span>
            )}
            <button onClick={() => setEditando(null)}
              className="ml-auto rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs text-humo hover:bg-nube">
              Cancelar
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className={etiqueta}>Nombre corto *</label>
              <input className={campo} value={veNombre ? editando.nombre : (editando.codigo ?? "")}
                disabled={!veNombre}
                onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                placeholder="FOME II P2" />
              <p className="mt-1 text-[11px] text-humo">
                {veNombre
                  ? "Como viene en la columna Cartera del archivo."
                  : "El nombre es dato reservado. Puedes corregir lo demás."}
              </p>
            </div>
            <div>
              <label className={etiqueta}>Código</label>
              <input className={campo + " font-mono"} value={editando.codigo ?? ""}
                onChange={(e) => setEditando({ ...editando, codigo: e.target.value.trim().toUpperCase() || null })}
                placeholder="CAR-001" />
              <p className="mt-1 text-[11px] text-humo">
                Es lo que ven quienes no tienen permiso del nombre. Cámbialo solo si llegó mal.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className={etiqueta}>Administradora · con quién se compra normalmente</label>
              <select className={campo} value={editando.administradora_codigo ?? ""}
                onChange={(e) => setEditando({ ...editando, administradora_codigo: e.target.value || null })}>
                <option value="">Sin administradora</option>
                {administradoras
                  .filter((a) => a.activo || a.codigo === editando.administradora_codigo)
                  .map((a) => (
                    <option key={a.codigo} value={a.codigo}>
                      {veNombreAdmin ? a.codigo + " · " + a.nombre : a.codigo}
                      {a.activo ? "" : " (inactiva)"}
                    </option>
                  ))}
              </select>
              <p className="mt-1 text-[11px] text-humo">
                Es referencia, para ubicarla. De qué administradora llegó cada garantía se
                guarda en su origen, y ahí una misma cartera puede tener varias.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className={etiqueta}>Nombre del actor · el fondo o banco, como aparece en la demanda</label>
              <textarea className={campo + " min-h-[62px]"} value={editando.actor ?? ""}
                onChange={(e) => setEditando({ ...editando, actor: e.target.value || null })}
                placeholder="Administradora FOME 2, S. de R.L. de C.V." />
              <p className="mt-1 text-[11px] text-humo">
                Se escribe una vez y lo heredan todas sus garantías. Escríbelo completo:
                de aquí lo toman los juicios.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className={etiqueta}>Notas</label>
              <textarea className={campo + " min-h-[52px]"} value={editando.notas ?? ""}
                onChange={(e) => setEditando({ ...editando, notas: e.target.value || null })} />
            </div>
          </div>

          <button onClick={() => void guardar()} disabled={guardando}
            className="mt-3 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:bg-humo/40">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      )}

      {cargando ? (
        <p className="mt-4 text-sm text-humo/70">Cargando…</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-black/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-nube text-left text-xs text-humo">
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Cartera</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Administradora</th>
                <th className="px-3 py-2">Ha llegado por</th>
                <th className="px-3 py-2 text-right">Garantías</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((c) => (
                <tr key={c.id} className={"border-t border-black/5 " + (c.estatus === "archivada" ? "opacity-50" : "")}>
                  <td className="px-3 py-2 font-mono text-xs text-humo">{c.codigo ?? "—"}</td>
                  <td className="px-3 py-2 font-semibold text-tinta">
                    {nombreVisible(c)}
                    {c.estatus === "archivada" && (
                      <span className="ml-1.5 text-xs font-normal text-rose-600">archivada</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-humo">
                    {c.actor ?? <span className="text-dorado-dark">falta capturarlo</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-humo">
                    {c.administradora_codigo
                      ? nombreAdmin(c.administradora_codigo)
                      : <span className="text-dorado-dark">sin asignar</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-humo">
                    {(admins[c.id ?? ""] ?? []).join(" · ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{garantias[c.id ?? ""] ?? 0}</td>
                  <td className="px-3 py-2 text-right">
                    {puedeEditar && (
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => { setEditando({ ...c }); setAviso(null); }}
                          className="rounded-lg border border-black/10 px-2.5 py-1 text-xs text-humo hover:bg-nube">
                          Editar
                        </button>
                        <button onClick={() => void archivar(c, c.estatus !== "archivada")}
                          title={c.estatus === "archivada"
                            ? "Vuelve a aparecer en Comercial"
                            : "Se conserva con su historia, pero deja de aparecer en Comercial"}
                          className="rounded-lg border border-black/10 px-2.5 py-1 text-xs text-humo hover:bg-nube">
                          {c.estatus === "archivada" ? "Desarchivar" : "Archivar"}
                        </button>
                        {(garantias[c.id ?? ""] ?? 0) === 0 ? (
                          <button onClick={() => void eliminar(c)}
                            className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50">
                            Eliminar
                          </button>
                        ) : (
                          <span title="Ya tuvo garantías: su código quedó escrito en el origen de cada una"
                            className="cursor-not-allowed rounded-lg border border-black/5 px-2.5 py-1 text-xs text-humo/40">
                            Eliminar
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!puedeEditar && (
        <p className="mt-3 text-xs text-humo">
          Puedes consultarlo. Darlas de alta o cambiarlas necesita el permiso
          “Carteras · Editar el catálogo”, en Roles y Permisos.
        </p>
      )}
    </section>
  );
}
