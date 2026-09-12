// =====================================================================
//  CONFIGURACIÓN · Niveles del módulo comercial
//  →  src/modules/Configuracion/NivelesComercial.tsx
//
//  Aquí la DGE reparte, por rol y por pantalla, qué puede hacer cada
//  quien. Se guarda en la tabla `nivel_modulo` de la base, así que el
//  cambio surte efecto sin publicar nada.
// =====================================================================
import { useEffect, useMemo, useState } from "react";
import {
  listarNiveles, guardarNivel,
  NIVELES, NIVEL_NOMBRE, NIVEL_EXPLICACION, MODULO_COMERCIAL_NOMBRE,
  type Nivel, type NivelModulo, type ModuloComercial,
} from "../../data/niveles";
import { ROLES } from "../../data/roles";
import { useMiRol } from "../CrmCliente/_compartido";

const PANTALLAS: ModuloComercial[] = ["carteras", "administradoras", "catalogo_garantias"];

// Un color por nivel, para que la tabla se lea de un vistazo.
const COLOR_NIVEL: Record<Nivel, string> = {
  sin_acceso: "bg-nube text-humo",
  ver: "bg-teal-soft text-teal-dark",
  capturar: "bg-dorado/15 text-dorado-dark",
  validar: "bg-aqua-soft text-aqua-dark",
};

export default function NivelesComercial() {
  const miRol = useMiRol();
  const soloDGE = miRol === "DGE";

  const [filas, setFilas] = useState<NivelModulo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);

  useEffect(() => {
    listarNiveles().then((r) => { setFilas(r); setCargando(false); });
  }, []);

  // Solo los roles que tienen algo que ver con lo comercial. No tiene
  // caso enseñar los 30 roles del sistema.
  const rolesVisibles = useMemo(
    () => ROLES.filter((r) =>
      ["DGE", "DGC", "GRC", "GAD", "RAC", "ASE", "SUBGERENTE", "Super_Admin", "DTR"].includes(r.codigo),
    ),
    [],
  );

  function nivelDeFila(rol: string, modulo: ModuloComercial): Nivel {
    return filas.find((f) => f.rol === rol && f.modulo === modulo)?.nivel ?? "sin_acceso";
  }

  function banderaDeFila(rol: string, modulo: ModuloComercial, cual: "desbloquear" | "apertura"): boolean {
    const f = filas.find((x) => x.rol === rol && x.modulo === modulo);
    if (!f) return false;
    return cual === "desbloquear" ? f.puedeDesbloquear : f.puedePedirApertura;
  }

  async function cambiar(rol: string, modulo: ModuloComercial, cambios: Partial<NivelModulo>) {
    if (!soloDGE) return;
    const clave = rol + "-" + modulo;
    setGuardando(clave);

    const anterior = filas.find((f) => f.rol === rol && f.modulo === modulo);
    const nueva: NivelModulo = {
      rol, modulo,
      nivel: cambios.nivel ?? anterior?.nivel ?? "sin_acceso",
      puedeDesbloquear: cambios.puedeDesbloquear ?? anterior?.puedeDesbloquear ?? false,
      puedePedirApertura: cambios.puedePedirApertura ?? anterior?.puedePedirApertura ?? false,
    };

    // Se pinta primero y se guarda después, para que no se sienta lento.
    setFilas((prev) => {
      const otras = prev.filter((f) => !(f.rol === rol && f.modulo === modulo));
      return [...otras, nueva];
    });

    const ok = await guardarNivel(nueva, miRol || "");
    if (!ok && anterior) {
      // Si falló, se regresa a como estaba.
      setFilas((prev) => {
        const otras = prev.filter((f) => !(f.rol === rol && f.modulo === modulo));
        return [...otras, anterior];
      });
    }
    setGuardando(null);
  }

  if (cargando) {
    return <p className="py-10 text-center text-sm text-humo">Cargando niveles…</p>;
  }

  return (
    <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <h2 className="font-display text-base font-bold text-tinta">Módulo Comercial · quién puede qué</h2>
      <p className="mt-1 text-[12px] leading-relaxed text-humo">
        Cada nivel incluye al anterior. <strong>Capturar</strong> es editar dejando el dato pendiente
        de validación; <strong>validar</strong> es editar y cerrarlo.
      </p>

      {!soloDGE && (
        <p className="mt-3 rounded-lg bg-nube px-3 py-2 text-[12px] text-humo">
          Solo la Dirección General puede cambiar estos niveles. Aquí los ves, pero no se editan.
        </p>
      )}

      <div className="mt-4 space-y-4">
        {PANTALLAS.map((modulo) => (
          <div key={modulo} className="rounded-xl border border-black/10 p-3">
            <h3 className="font-display text-[13px] font-bold text-tinta">
              {MODULO_COMERCIAL_NOMBRE[modulo]}
            </h3>

            <div className="mt-2 space-y-1.5">
              {rolesVisibles.map((rol) => {
                const nivel = nivelDeFila(rol.codigo, modulo);
                const ocupado = guardando === rol.codigo + "-" + modulo;

                return (
                  <div
                    key={rol.codigo}
                    className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-nube"
                  >
                    <div className="min-w-[150px] flex-1">
                      <div className="text-[13px] font-medium text-tinta">{rol.codigo}</div>
                      <div className="text-[11px] text-humo">{rol.nombre}</div>
                    </div>

                    <div className="flex gap-1">
                      {NIVELES.map((n) => (
                        <button
                          key={n}
                          disabled={!soloDGE || ocupado}
                          onClick={() => cambiar(rol.codigo, modulo, { nivel: n })}
                          title={NIVEL_EXPLICACION[n]}
                          className={
                            "rounded-md px-2.5 py-1 text-[11px] font-medium transition " +
                            (nivel === n
                              ? COLOR_NIVEL[n] + " font-semibold"
                              : "text-humo hover:bg-nube") +
                            (soloDGE ? " cursor-pointer" : " cursor-default")
                          }
                        >
                          {NIVEL_NOMBRE[n]}
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-3 text-[11px] text-humo">
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          disabled={!soloDGE || ocupado}
                          checked={banderaDeFila(rol.codigo, modulo, "desbloquear")}
                          onChange={(e) => cambiar(rol.codigo, modulo, { puedeDesbloquear: e.target.checked })}
                        />
                        Desbloquear
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          disabled={!soloDGE || ocupado}
                          checked={banderaDeFila(rol.codigo, modulo, "apertura")}
                          onChange={(e) => cambiar(rol.codigo, modulo, { puedePedirApertura: e.target.checked })}
                        />
                        Pedir apertura
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-humo">
        El nivel dice qué puedes <em>hacer</em>. Lo que puedes <em>ver</em> de los datos sensibles
        —nombre de la administradora, número de crédito y mínimo— se controla aparte, en la tabla
        de visibilidad de campos.
      </p>
    </section>
  );
}
