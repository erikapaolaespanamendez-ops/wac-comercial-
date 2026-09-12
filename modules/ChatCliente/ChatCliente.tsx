// =====================================================================
//  ChatCliente  —  Chat con clientes por WhatsApp (número único de DIIPA).
//
//  FASE 0 (esqueleto): por ahora SOLO es la pantalla. Todavía NO está
//  conectado a Twilio/WhatsApp. En las siguientes fases se le agrega:
//    Fase 1 → recibir mensajes (webhook de Netlify → Supabase)
//    Fase 2 → enviar mensajes desde aquí
//    Fase 3 → la conversación de ida y vuelta (burbujas) ligada al cliente
//
//  Reglas: un solo número de la empresa; todos los asesores atienden desde
//  aquí, y cada mensaje queda marcado con quién lo contestó (campo `autor`).
// =====================================================================

export default function ChatCliente() {
  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      {/* Maqueta de cómo se verá: lista de conversaciones + hilo de mensajes.
          Por ahora ambas columnas están VACÍAS (todavía no hay conexión). */}
      <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[300px_1fr]">

        {/* Columna izquierda: lista de conversaciones (vacía por ahora) */}
        <aside className="rounded-3xl border border-black/5 bg-white p-4 shadow-sm">
          <h2 className="font-display text-sm font-extrabold text-tinta">Conversaciones</h2>
          <p className="mt-0.5 text-xs text-humo">Aquí aparecerán los clientes que escriban.</p>

          <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/10 bg-nube/60 px-4 py-10 text-center">
            <span className="text-3xl">💬</span>
            <p className="mt-2 text-xs text-humo">Aún no hay conversaciones.</p>
          </div>
        </aside>

        {/* Columna derecha: el hilo de mensajes (placeholder de Fase 0) */}
        <section className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-black/5 bg-white p-8 text-center shadow-sm">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl text-3xl text-white shadow"
            style={{ backgroundColor: "#25D366" }}
          >
            💬
          </div>

          <h1 className="mt-4 font-display text-lg font-extrabold text-tinta">
            Chat con Clientes por WhatsApp
          </h1>
          <p className="mt-2 max-w-sm text-sm text-humo">
            Desde aquí el equipo va a contestar los WhatsApp de los clientes,
            con un solo número de la empresa, y cada conversación quedará
            guardada y ligada a su expediente.
          </p>

          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-oro/30 bg-oro/10 px-3 py-1">
            <span className="h-2 w-2 rounded-full bg-oro" />
            <span className="text-xs font-semibold text-tinta">
              Fase 0 · módulo creado, falta conectar WhatsApp
            </span>
          </div>

          <p className="mt-4 text-xs text-humo">
            Siguiente paso: recibir mensajes de prueba desde el sandbox de Twilio.
          </p>
        </section>
      </div>
    </div>
  );
}
