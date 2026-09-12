// Puente ligero para navegar a Control de Devoluciones desde la ficha del
// cliente (CrmCliente), sin importar desde dónde se haya abierto esa ficha
// (Clientes, Seguimiento, MiLista, etc.) — evita tener que pasar props por
// cada uno de esos módulos.
import type { Cliente } from "../data/clientes";

type Listener = (cliente: Cliente) => void;
let listener: Listener | null = null;

export function suscribirNavegarDevolucion(fn: Listener) {
  listener = fn;
}

export function irADevolucion(cliente: Cliente) {
  if (listener) listener(cliente);
  else console.warn("irADevolucion: nadie está escuchando (App.tsx no montó el suscriptor).");
}
