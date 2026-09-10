/**
 * ============================================================================
 * SONARA MUSIC - PUNTO DE ENTRADA PRINCIPAL (main.tsx)
 * ============================================================================
 * Función y propósito:
 * Este archivo es el punto de inicio de la aplicación web y móvil (Capacitor).
 * Inicializa el árbol de componentes de React 18 en el elemento HTML con id="root".
 *
 * ¿Cómo funciona?:
 * 1. Importa los estilos globales de Tailwind CSS ('./index.css').
 * 2. Utiliza `createRoot` de 'react-dom/client' con `<StrictMode>` para ayudar
 *    a detectar problemas de renderizado y efectos no sincronizados durante el desarrollo.
 * 3. Monta el componente raíz `<App />`, que orquesta el reproductor de audio,
 *    el motor de ecualización, el escaneo nativo y la interfaz de usuario.
 *
 * Para futuras actualizaciones manuales:
 * - Si se añaden proveedores globales (Context Providers) de temas o estado,
 *   deben envolver a `<App />` dentro de `createRoot(...).render(...)`.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

