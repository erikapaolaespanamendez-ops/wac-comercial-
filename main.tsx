import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { cargarParametrosDevolucion } from "./data/parametrosDevolucion";

// Arranca la app y la "pega" dentro del <div id="root"> del index.html.
// Los parametros de Devoluciones se leen de la base UNA VEZ, antes de dibujar
// nada. Si fallan, la app arranca igual (el resto del sistema no depende de
// ellos) y son las pantallas de Devoluciones las que muestran el aviso y se
// niegan a calcular. Ver src/data/parametrosDevolucion.ts.
cargarParametrosDevolucion().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
