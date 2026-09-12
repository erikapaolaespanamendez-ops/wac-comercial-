// =====================================================================
//  CONFIGURACIÓN · Catálogo de administradoras
//  →  src/modules/Configuracion/Administradoras.tsx
//
//  Es el expediente de cada administradora con la que DIIPA compra
//  cartera: cómo se llama, quién es el contacto, qué exige y cómo se le
//  paga. Antes existía solo en la base y no había manera de verlo ni
//  corregirlo desde la aplicación.
//
//  PARTE 1 de dos. Aquí va el alta y la edición de la administradora.
//  Los catálogos que cuelgan de cada una vienen después, para no mover
//  muchas cosas a la vez.
//
//  DOS REGLAS QUE NO SE TOCAN:
//  · El CÓDIGO se asigna solo y no se puede cambiar. Es lo que ve quien
//    no tiene permiso de ver el nombre, y va escrito en garantías y
//    documentos: si se cambia, se rompe el rastro.
//  · No se BORRA ninguna. Se desactiva. Una administradora con cartera
//    comprada sigue haciendo falta aunque ya no se le compre más.
// =====================================================================
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

// Quién puede escribir en el catálogo. Verlo lo puede cualquiera que
// entre a Configuración; cambiarlo, solo dirección y administración.
const ROLES_EDITAN = ["Super_Admin", "DGE", "GAD"];

type Admin = {
  codigo: string;
  nombre: string;
  tipo: string | null;
  activo: boolean;
  interna: boolean;
  formato_referencia: string | null;
  contacto: string | null;
  correo_solicitudes: string | null;
  dias_respuesta: number | null;
  acepta_litigiosos: boolean;
  exige_carta_propuesta: boolean;
  maneja_precio_piso: boolean;
  notaria: string | null;
  datos_pago: string | null;
  notas: string | null;
};

const VACIA: Admin = {
  codigo: "", nombre: "", tipo: "ADM", activo: true, interna: false,
  formato_referencia: null, contacto: null, correo_solicitudes: null,
  dias_respuesta: null, acepta_litigiosos: true, exige_carta_propuesta: false,
  maneja_precio_piso: false, notaria: null, datos_pago: null, notas: null,
};

const campo = "w-full rounded-lg border border-black/10 bg-nube px-3 py-2 text-sm text-tinta outline-none focus:border-teal focus:bg-white";
const etiqueta = "mb-1 block text-xs text-humo";

export default function Administradoras({ miRol }: { miRol: string | null }) {
  const [lista, setLista] = useState<Admin[]>([]);
  const [uso, setUso] = useState<Record<string, number>>({});
  // Estado del corte mensual por administradora. Sale de la vista
  // v_corte_administradora, que lo calcula del origen de las garantías.
  // Las carteras de cada administradora, separadas por mes de corte.
  // Sale de garantia_origen: la misma cartera puede llegar por varias
  // administradoras y en varios meses, así que se agrupa aquí y no se
  // guarda repetido en ningún lado.
  type Entrega = { cartera: string; actor: string | null; mes: string | null; garantias: number };
  const [entregas, setEntregas] = useState<Record<string, Entrega[]>>({});
  const [abierta, setAbierta] = useState<string | null>(null);
  const [corte, setCorte] = useState<Record<string, { ultimo: string | null; estado: string; meses: number | null }>>({});
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [editando, setEditando] = useState<Admin | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [verInactivas, setVerInactivas] = useState(false);

  const puedeEditar = ROLES_EDITAN.includes(miRol || "");

  // ── Inactivar y eliminar ──
  // Inactivar es lo normal: la administradora se guarda pero deja de
  // ofrecerse. Se puede volver a activar.
  //
  // Eliminar SOLO se ofrece si nunca trajo garantías. Si ya trajo, su
  // código está escrito en el origen de cada una y en documentos: al
  // borrarla se perdería de dónde vino esa cartera. Ahí no hay botón,
  // hay que inactivarla.
  async function cambiarActivo(a: Admin, activa: boolean) {
    setAviso(null);
    const { error } = await supabase.from("administradora")
      .update({ activo: activa, actualizado_en: new Date().toISOString() })
      .eq("codigo", a.codigo);
    if (error) { setAviso("No se pudo cambiar: " + error.message); return; }
    await traer();
  }

  async function eliminar(a: Admin) {
    if ((uso[a.codigo] ?? 0) > 0) {
      setAviso("Esa administradora ya trajo garantías: no se elimina, se inactiva.");
      return;
    }
    if (!window.confirm("¿Eliminar " + a.nombre + " (" + a.codigo + ")? Su código no se vuelve a usar.")) return;
    setAviso(null);
    const { error } = await supabase.from("administradora").delete().eq("codigo", a.codigo);
    if (error) { setAviso("No se pudo eliminar: " + error.message); return; }
    await traer();
  }

  async function traer() {
    setCargando(true);
    const { data, error } = await supabase
      .from("administradora")
      .select("codigo,nombre,tipo,activo,interna,formato_referencia,contacto,correo_solicitudes,dias_respuesta,acepta_litigiosos,exige_carta_propuesta,maneja_precio_piso,notaria,datos_pago,notas")
      .order("codigo");
    if (error) setAviso("No se pudo leer el catálogo: " + error.message);
    else setLista((data ?? []) as Admin[]);

    // Cuántas garantías tiene cada una. Sirve para saber cuáles ya
    // tienen historia y cuáles siguen sin usarse.
    const { data: cart } = await supabase.from("cartera").select("id,administradora_codigo");
    const { data: gar } = await supabase.from("garantia").select("cartera_id");
    if (cart && gar) {
      const porCartera: Record<string, string> = {};
      for (const c of cart as { id: string; administradora_codigo: string | null }[]) {
        if (c.administradora_codigo) porCartera[c.id] = c.administradora_codigo;
      }
      const cuenta: Record<string, number> = {};
      for (const g of gar as { cartera_id: string | null }[]) {
        const cod = g.cartera_id ? porCartera[g.cartera_id] : null;
        if (cod) cuenta[cod] = (cuenta[cod] ?? 0) + 1;
      }
      setUso(cuenta);
    }
    const { data: ent } = await supabase
      .from("garantia_origen")
      .select("administradora_codigo,corte_mes,garantia_id,cartera:cartera_id(codigo,nombre,actor)");
    if (ent) {
      type Fila = { administradora_codigo: string | null; corte_mes: string | null; garantia_id: string;
                    cartera: { codigo: string | null; nombre: string; actor: string | null } | null };
      const mapa: Record<string, Record<string, Entrega>> = {};
      for (const o of ent as unknown as Fila[]) {
        if (!o.administradora_codigo) continue;
        const llave = (o.cartera?.nombre ?? "sin cartera") + "|" + (o.corte_mes ?? "");
        const grupo = (mapa[o.administradora_codigo] ??= {});
        grupo[llave] ??= {
          cartera: o.cartera?.nombre ?? "sin cartera",
          actor: o.cartera?.actor ?? null,
          mes: o.corte_mes,
          garantias: 0,
        };
        grupo[llave].garantias += 1;
      }
      setEntregas(Object.fromEntries(Object.entries(mapa).map(([k, v]) => [k, Object.values(v)])));
    }

    const { data: cortes } = await supabase
      .from("v_corte_administradora")
      .select("codigo,ultimo_corte,estado_corte,meses_sin_actualizar");
    if (cortes) {
      setCorte(Object.fromEntries(
        (cortes as { codigo: string; ultimo_corte: string | null; estado_corte: string; meses_sin_actualizar: number | null }[])
          .map((c) => [c.codigo, { ultimo: c.ultimo_corte, estado: c.estado_corte, meses: c.meses_sin_actualizar }]),
      ));
    }
    setCargando(false);
  }

  // El inventario de cada administradora llega CADA MES. Este es el
  // aviso de cuándo toca volver a pedirlo.
  function Corte({ codigo, hayGarantias }: { codigo: string; hayGarantias: boolean }) {
    const c = corte[codigo];
    if (!hayGarantias) return <span className="text-xs text-humo">—</span>;
    if (!c || c.estado === "sin corte") {
      return <span className="rounded-full bg-nube px-2 py-0.5 text-[11px] text-humo">sin corte cargado</span>;
    }
    const mes = c.ultimo
      ? new Date(c.ultimo + "T12:00:00").toLocaleDateString("es-MX", { month: "long", year: "numeric" })
      : "—";
    if (c.estado === "toca actualizar") {
      return (
        <span className="rounded-full bg-dorado-soft/60 px-2 py-0.5 text-[11px] font-semibold text-dorado-dark"
          title={"Último corte: " + mes + ". El inventario se pide cada mes."}>
          actualizar cartera{c.meses ? " · " + c.meses + " meses" : ""}
        </span>
      );
    }
    return <span className="text-[11px] text-humo">{mes}</span>;
  }

  useEffect(() => { void traer(); }, []);

  // El siguiente código libre. Nunca reutiliza uno dado de baja: si una
  // administradora se borró alguna vez, su número se queda como hueco a
  // propósito, porque pudo quedar escrito en documentos viejos.
  function siguienteCodigo(): string {
    const nums = lista
      .map((a) => parseInt(a.codigo.replace(/\D/g, ""), 10))
      .filter((n) => !isNaN(n));
    const sig = (nums.length ? Math.max(...nums) : 0) + 1;
    return "ADM-" + String(sig).padStart(3, "0");
  }

  async function guardar() {
    if (!editando) return;
    const nombre = editando.nombre.trim();
    if (!nombre) { setAviso("La administradora necesita nombre."); return; }

    const repetida = lista.some(
      (a) => a.nombre.trim().toUpperCase() === nombre.toUpperCase() && a.codigo !== editando.codigo,
    );
    if (repetida) { setAviso("Ya existe una administradora con ese nombre."); return; }

    setGuardando(true);
    setAviso(null);
    const fila = { ...editando, nombre, actualizado_en: new Date().toISOString() };

    const { error } = editando.codigo
      ? await supabase.from("administradora").update(fila).eq("codigo", editando.codigo)
      : await supabase.from("administradora").insert({ ...fila, codigo: siguienteCodigo() });

    setGuardando(false);
    if (error) { setAviso("No se pudo guardar: " + error.message); return; }
    setEditando(null);
    await traer();
  }

  const visibles = lista.filter((a) => verInactivas || a.activo);

  return (
    <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-base font-extrabold text-tinta">🏦 Administradoras</h2>
        <span className="text-sm text-humo">
          {lista.filter((a) => a.activo).length} activas · {lista.length} en total
        </span>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-humo">
            <input type="checkbox" checked={verInactivas}
              onChange={(e) => setVerInactivas(e.target.checked)} />
            Ver las inactivas
          </label>
          {puedeEditar && (
            <button onClick={() => { setEditando({ ...VACIA }); setAviso(null); }}
              className="rounded-lg bg-teal px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-dark">
              Nueva administradora
            </button>
          )}
        </div>
      </div>

      <p className="mt-1 text-sm text-humo">
        Con quiénes se compra cartera. El código se asigna solo y no se cambia:
        es lo que ve quien no tiene permiso de ver el nombre. El inventario de cada
        una se pide <strong>cada mes</strong>: la columna del corte avisa cuándo toca.
      </p>

      {aviso && (
        <p className="mt-3 rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700">{aviso}</p>
      )}

      {/* ── La ficha, cuando se está editando ── */}
      {editando && (
        <div className="mt-4 rounded-2xl border-2 border-teal/40 bg-nube/40 p-4">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-sm font-bold text-tinta">
              {editando.codigo ? "Editar " + editando.codigo : "Nueva administradora"}
            </h3>
            {!editando.codigo && (
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
              <label className={etiqueta}>Nombre *</label>
              <input className={campo} value={editando.nombre}
                onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                placeholder="SECORSE" />
            </div>
            <div>
              <label className={etiqueta}>Contacto</label>
              <input className={campo} value={editando.contacto ?? ""}
                onChange={(e) => setEditando({ ...editando, contacto: e.target.value || null })}
                placeholder="Nombre y teléfono" />
            </div>
            <div>
              <label className={etiqueta}>Correo de solicitudes</label>
              <input className={campo} value={editando.correo_solicitudes ?? ""}
                onChange={(e) => setEditando({ ...editando, correo_solicitudes: e.target.value || null })}
                placeholder="propuestas@administradora.com" />
            </div>
            <div>
              <label className={etiqueta}>Días de respuesta</label>
              <input className={campo} inputMode="numeric" value={editando.dias_respuesta ?? ""}
                onChange={(e) => setEditando({ ...editando, dias_respuesta: e.target.value ? Number(e.target.value) : null })}
                placeholder="15" />
            </div>
            <div>
              <label className={etiqueta}>Notaría</label>
              <input className={campo} value={editando.notaria ?? ""}
                onChange={(e) => setEditando({ ...editando, notaria: e.target.value || null })} />
            </div>
            <div className="md:col-span-2">
              <label className={etiqueta}>Notas</label>
              <textarea className={campo + " min-h-[62px]"} value={editando.notas ?? ""}
                onChange={(e) => setEditando({ ...editando, notas: e.target.value || null })}
                placeholder="Lo que haya que recordar al negociar con ella." />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-4 rounded-xl bg-white px-4 py-3">
            {([
              ["acepta_litigiosos", "Acepta litigiosos"],
              ["exige_carta_propuesta", "Exige carta propuesta"],
              ["maneja_precio_piso", "Maneja precio piso"],
              ["interna", "Es interna de DIIPA"],
              ["activo", "Activa"],
            ] as [keyof Admin, string][]).map(([k, t]) => (
              <label key={k} className="flex items-center gap-1.5 text-sm text-tinta">
                <input type="checkbox" checked={Boolean(editando[k])}
                  onChange={(e) => setEditando({ ...editando, [k]: e.target.checked })} />
                {t}
              </label>
            ))}
          </div>

          <button onClick={() => void guardar()} disabled={guardando}
            className="mt-3 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-dark disabled:bg-humo/40">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      )}

      {/* ── La lista ── */}
      {cargando ? (
        <p className="mt-4 text-sm text-humo/70">Cargando…</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-black/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-nube text-left text-xs text-humo">
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Contacto</th>
                <th className="px-3 py-2 text-right">Garantías</th>
                <th className="px-3 py-2">Último corte</th>
                <th className="px-3 py-2">Condiciones</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((a) => (
                <tr key={a.codigo} className={"border-t border-black/5 " + (a.activo ? "" : "opacity-50")}>
                  <td className="px-3 py-2 font-mono text-xs text-humo">{a.codigo}</td>
                  <td className="px-3 py-2 font-semibold text-tinta">
                    {a.nombre}
                    {a.interna && <span className="ml-1.5 text-xs font-normal text-humo">interna</span>}
                    {!a.activo && <span className="ml-1.5 text-xs font-normal text-rose-600">inactiva</span>}
                  </td>
                  <td className="px-3 py-2 text-humo">{a.contacto ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {(uso[a.codigo] ?? 0) > 0 ? (
                      <button onClick={() => setAbierta(abierta === a.codigo ? null : a.codigo)}
                        className="underline decoration-dotted">{uso[a.codigo]}</button>
                    ) : 0}
                  </td>
                  <td className="px-3 py-2"><Corte codigo={a.codigo} hayGarantias={(uso[a.codigo] ?? 0) > 0} /></td>
                  <td className="px-3 py-2 text-xs text-humo">
                    {[
                      a.acepta_litigiosos ? "litigiosos" : null,
                      a.exige_carta_propuesta ? "carta propuesta" : null,
                      a.maneja_precio_piso ? "precio piso" : null,
                      a.dias_respuesta ? a.dias_respuesta + " días" : null,
                    ].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {puedeEditar && (
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => { setEditando({ ...a }); setAviso(null); }}
                          className="rounded-lg border border-black/10 px-2.5 py-1 text-xs text-humo hover:bg-nube">
                          Editar
                        </button>
                        <button onClick={() => void cambiarActivo(a, !a.activo)}
                          title={a.activo ? "Deja de ofrecerse, pero se conserva" : "Vuelve a estar disponible"}
                          className="rounded-lg border border-black/10 px-2.5 py-1 text-xs text-humo hover:bg-nube">
                          {a.activo ? "Inactivar" : "Activar"}
                        </button>
                        {(uso[a.codigo] ?? 0) === 0 ? (
                          <button onClick={() => void eliminar(a)}
                            className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50">
                            Eliminar
                          </button>
                        ) : (
                          <span title="Ya trajo garantías: su código quedó escrito en el origen de cada una"
                            className="cursor-not-allowed rounded-lg border border-black/5 px-2.5 py-1 text-xs text-humo/40">
                            Eliminar
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {/* Sus carteras y de qué mes salió cada entrega. */}
              {visibles.filter((a) => abierta === a.codigo).map((a) => (
                <tr key={a.codigo + "-det"} className="border-t border-black/5 bg-nube/50">
                  <td colSpan={6} className="px-3 py-3">
                    <div className="text-xs font-semibold text-tinta">Carteras de {a.nombre}</div>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {(entregas[a.codigo] ?? []).map((e, i) => (
                        <div key={i} className="rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px]">
                          <span className="font-semibold text-tinta">{e.cartera}</span>
                          <span className="text-humo"> · {e.mes
                            ? new Date(e.mes + "T12:00:00").toLocaleDateString("es-MX", { month: "long", year: "numeric" })
                            : "sin mes de corte"}</span>
                          <span className="text-humo"> · {e.garantias} garantías</span>
                          <div className="text-[12px] text-humo">
                            {e.actor
                              ? <><span className="text-tinta">Actor:</span> {e.actor}</>
                              : <span className="text-dorado-dark">Falta el actor de esta cartera.</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!puedeEditar && (
        <p className="mt-3 text-xs text-humo">
          Puedes consultarlo. Darlas de alta o cambiarlas es de Dirección y Administración.
        </p>
      )}
    </section>
  );
}
