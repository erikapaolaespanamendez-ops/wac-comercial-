// ============================================================================
//  intervaloVisible — intervalos que NO corren cuando la pestaña está oculta.
//
//  Motivo (04-sep-2026): la base recibía entre 760 y 1,800 peticiones POR HORA
//  a las 3 de la mañana, sin nadie trabajando. Eran pestañas abiertas
//  encuestando solas. Este ayudante detiene el ciclo cuando la pestaña pasa a
//  segundo plano y lo reanuda —con un disparo inmediato— al volver, para que
//  el usuario vea datos frescos sin esperar el siguiente tic.
//
//  Uso:
//    const parar = intervaloVisible(cargar, 60000);
//    return () => parar();
// ============================================================================

type Opciones = {
  /** Ejecuta la función apenas se monta, sin esperar el primer intervalo. */
  inmediato?: boolean;
  /** Vuelve a ejecutar al recuperar el foco de la pestaña. Por defecto sí. */
  alVolver?: boolean;
};

export function intervaloVisible(
  fn: () => void | Promise<void>,
  ms: number,
  opts: Opciones = {}
): () => void {
  const { inmediato = false, alVolver = true } = opts;
  let id: ReturnType<typeof setInterval> | null = null;
  let vivo = true;

  const visible = () =>
    typeof document === "undefined" || document.visibilityState !== "hidden";

  const correr = () => {
    if (!vivo || !visible()) return;
    try {
      const r = fn();
      if (r && typeof (r as Promise<void>).catch === "function") {
        (r as Promise<void>).catch(() => {});
      }
    } catch {
      /* un error en un tic no debe tumbar el ciclo */
    }
  };

  const arrancar = () => {
    if (id !== null || !vivo) return;
    id = setInterval(correr, ms);
  };

  const detener = () => {
    if (id === null) return;
    clearInterval(id);
    id = null;
  };

  const alCambiarVisibilidad = () => {
    if (!vivo) return;
    if (visible()) {
      arrancar();
      if (alVolver) correr(); // al regresar, refresca de una vez
    } else {
      detener();
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
  }

  if (inmediato) correr();
  if (visible()) arrancar();

  return () => {
    vivo = false;
    detener();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    }
  };
}
