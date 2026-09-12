# JurisConecta

Conmutador y CRM de DIIPA · Inmuebles Accesibles.

Hecho con **React + Vite + TypeScript + Tailwind** (ligero y fácil de publicar en Netlify).

## Módulos
- ✅ **Directorio del Equipo** — áreas, extensiones, presencia, llamar/chat (demo).
- ⏳ Clientes _(próximo)_
- ⏳ Llamadas _(próximo)_

## Para correrlo en tu compu (opcional)
```bash
npm install
npm run dev
```

## Para publicarlo
Netlify lo construye solo con `npm run build` y publica la carpeta `dist`
(ya configurado en `netlify.toml`).

## Dónde cambiar cosas
- **Colores de marca:** `tailwind.config.js`
- **Nombre y textos:** `src/brand.ts`
- **Personas y extensiones:** `src/data/equipo.ts`
- **Módulo Directorio:** `src/modules/Directorio/Directorio.tsx`
