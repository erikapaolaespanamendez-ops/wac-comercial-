// CRM Prospectos · Botón de ayuda con el Script de llamada de calidad
import { useState } from "react";

export const SCRIPT: { titulo: string; texto: string }[] = [
  { titulo: "1. Saludo (10 seg)", texto: "“Hola [nombre], le habla [asesor] de DIIPA, especialistas en soluciones inmobiliarias con certeza jurídica. Vi que le interesó [el activo/garantía]. ¿Tiene 2 minutitos?”" },
  { titulo: "2. Perfilar (escuchar 70%)", texto: "¿Qué busca exactamente? · ¿Para vivir, invertir o regularizar? · ¿Manejaba algún presupuesto / forma de pago? · ¿Para cuándo le urge?" },
  { titulo: "3. Dar certeza (no promesas)", texto: "“Con nosotros todo va por escrito y acompañado legalmente. El cliente no pierde: cada paso queda documentado. No le prometo plazos que no dependen de mí, pero sí claridad en cada etapa.”" },
  { titulo: "4. Manejar la duda típica", texto: "“Entiendo su duda. Por eso lo primero es una cita sin compromiso, donde le mostramos el activo y el proceso, con documentos a la vista.”" },
  { titulo: "5. Cerrar el siguiente paso (SIEMPRE)", texto: "“¿Le queda mejor [mañana 10am] o [mañana 4pm] para mostrarle todo? …Perfecto, le mando confirmación por WhatsApp y nos vemos. Quedó agendado.”" },
  { titulo: "6. Si no contesta", texto: "WhatsApp: “Hola [nombre], le marcamos de DIIPA por su interés en [activo]. ¿Le acomoda hoy en la tarde o mañana?”" },
];

export default function ScriptBoton({ compacto }: { compacto?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button onClick={() => setAbierto(true)}
        className={"rounded-lg border border-dorado/40 bg-dorado/10 font-semibold text-tinta hover:bg-dorado/20 " + (compacto ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm")}>
        ❓ Script de llamada
      </button>
      {abierto && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-tinta/40 sm:items-center sm:p-4" onClick={() => setAbierto(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-extrabold text-tinta">📞 Script de llamada de calidad</h2>
              <button onClick={() => setAbierto(false)} className="rounded-md px-2 py-1 text-humo hover:bg-nube">✕</button>
            </div>
            <div className="space-y-2">
              {SCRIPT.map((s) => (
                <div key={s.titulo} className="rounded-lg bg-nube/50 p-2.5">
                  <p className="text-[12px] font-bold text-teal-dark">{s.titulo}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-tinta">{s.texto}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 rounded-lg bg-dorado/10 px-3 py-2 text-[11px] text-tinta">🚦 Escuchar más que hablar · nunca prometer resultados legales · no colgar sin agendar · registrar el toque al terminar.</p>
          </div>
        </div>
      )}
    </>
  );
}
