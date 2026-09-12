#!/usr/bin/env node
// ============================================================================
//  revisar-rendimiento.mjs
//
//  Candado contra las tres cosas que pusieron lenta la base (sep-2026):
//    1. setInterval suelto  -> encuestaba aunque la pestaña estuviera oculta.
//    2. select("*") sobre clientes fuera de data/clientes.ts -> 459 kB por carga.
//    3. Encuestado por debajo de 30 s -> el chat pedía cada 3 segundos.
//
//  Corre solo antes de cada build (script "prebuild"). Si algo vuelve a
//  aparecer, el build FALLA con el archivo y la línea exactos.
//
//  Para saltarlo a propósito en una línea justificada, pon el comentario:
//      // rendimiento-ok: <motivo>
//  en la misma línea o en la de arriba.
// ============================================================================

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = "src";
const PERMISO = "rendimiento-ok";
const MINIMO_MS = 30000; // nada debe encuestar más seguido que esto

// Archivos donde SÍ se permite lo que en otros lados está prohibido.
const EXCEPCIONES = {
  setInterval: [
    "src/lib/intervaloVisible.ts",          // es quien lo implementa
    "src/modules/ChatInterno/LlamadaChat.tsx",  // relojes de llamada activa
    "src/modules/ChatInterno/LlamadaJitsi.tsx",
    "src/modules/ChatInterno/GrabadorVoz.tsx",
    "src/modules/LlamarGrabar/LlamarGrabar.tsx",
    "src/modules/PruebaLlamada/PruebaLlamada.tsx",
    "src/modules/ChatInterno/LineaTwilio.tsx",
    "src/modules/Avisos/LlamadaEntrante.tsx",   // timbre de llamada
    "src/modules/Avisos/ConmutadorEntrante.tsx",
  ],
  selectClientes: ["src/data/clientes.ts"],    // la única puerta a la tabla
};

const fallas = [];

function archivos(dir) {
  const salida = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) salida.push(...archivos(p));
    else if (/\.(ts|tsx)$/.test(n)) salida.push(p);
  }
  return salida;
}

function permitido(lineas, i) {
  const actual = lineas[i] || "";
  const previa = lineas[i - 1] || "";
  return actual.includes(PERMISO) || previa.includes(PERMISO);
}

for (const ruta of archivos(RAIZ)) {
  const rel = relative(".", ruta).replace(/\\/g, "/");
  const lineas = readFileSync(ruta, "utf8").split("\n");

  lineas.forEach((linea, i) => {
    const n = i + 1;
    if (permitido(lineas, i)) return;

    // --- 1. setInterval suelto -------------------------------------------
    if (/\bsetInterval\s*\(/.test(linea) && !EXCEPCIONES.setInterval.includes(rel)) {
      fallas.push({
        rel, n,
        que: "setInterval suelto",
        arregla: 'usa intervaloVisible() de "src/lib/intervaloVisible" para que se detenga con la pestaña oculta',
      });
    }

    // --- 2. escritura a clientes que no invalida la caché ------------------
    //  Leer UN cliente por id está bien. Lo que rompe es ESCRIBIR sin avisarle
    //  a la caché: los demás módulos seguirían viendo el dato viejo.
    if (!EXCEPCIONES.selectClientes.includes(rel) && /from\(\s*["']clientes["']\s*\)/.test(linea)) {
      const bloque = lineas.slice(i, i + 18).join("\n");
      const esEscritura = /from\(\s*["']clientes["']\s*\)[\s\S]{0,80}?\.(update|insert|delete|upsert)\(/.test(bloque);
      if (esEscritura && !bloque.includes("invalidarClientes()")) {
        fallas.push({
          rel, n,
          que: "escritura a la tabla clientes sin invalidar la caché",
          arregla: 'llama invalidarClientes() justo después, o usa escribirClientes() de src/data/clientes.ts',
        });
      }

      // Lectura de la tabla COMPLETA fuera del módulo de datos.
      if (/from\(\s*["']clientes["']\s*\)/.test(linea)) {
        const sig = lineas.slice(i, i + 4).join(" ");
        const traeTodo = /\.select\(\s*["']\*["']/.test(sig) && !/\.eq\(|\.in\(|\.limit\(|maybeSingle|\.single\(/.test(sig);
        if (traeTodo) {
          fallas.push({
            rel, n,
            que: "carga la tabla clientes completa",
            arregla: "usa fetchClientes(), que comparte una sola copia entre módulos",
          });
        }
      }
    }

    // --- 3. encuestado demasiado seguido ----------------------------------
    const m = linea.match(/intervaloVisible\s*\([\s\S]*?,\s*([0-9_ ]+(?:\*[0-9_ ]+)*)\s*[,)]/);
    if (m) {
      let ms = NaN;
      try { ms = Function(`"use strict";return (${m[1]})`)(); } catch { /* ignora */ }
      if (Number.isFinite(ms) && ms < MINIMO_MS) {
        fallas.push({
          rel, n,
          que: `encuesta cada ${Math.round(ms / 1000)} s`,
          arregla: `el mínimo acordado son ${MINIMO_MS / 1000} s; si de verdad necesitas menos, justifícalo con // ${PERMISO}: motivo`,
        });
      }
    }
  });
}

if (fallas.length === 0) {
  console.log("✓ Revisión de rendimiento: sin hallazgos.");
  process.exit(0);
}

console.error("\n✖ Revisión de rendimiento: " + fallas.length + " hallazgo(s)\n");
for (const f of fallas) {
  console.error(`  ${f.rel}:${f.n}`);
  console.error(`     ${f.que}`);
  console.error(`     → ${f.arregla}\n`);
}
console.error("Estas reglas vienen de la revisión de sep-2026, cuando la base");
console.error("recibía 1.2 millones de peticiones y el chat encuestaba cada 3 s.\n");
process.exit(1);
