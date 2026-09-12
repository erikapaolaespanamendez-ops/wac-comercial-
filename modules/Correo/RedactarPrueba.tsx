import { useState } from "react";
import RedactarCorreo from "./RedactarCorreo";

// Botón TEMPORAL de prueba para el redactor de correo (luego se quita).
export default function RedactarPrueba({ correo, nombre }: { correo: string; nombre?: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button onClick={() => setAbierto(true)}
        className="mt-2 rounded-lg border border-teal/30 px-3 py-1.5 text-xs font-semibold text-teal-dark hover:bg-teal-soft">
        ✉️ Probar redactar correo
      </button>
      {abierto && (
        <RedactarCorreo
          paraCorreo={correo}
          paraNombre={nombre}
          asuntoInicial="Prueba JurisConecta"
          cuerpoInicial="hola esto es una prueba del redactor con la ia a ver si lo deja mas formal"
          onCerrar={() => setAbierto(false)}
        />
      )}
    </>
  );
}
