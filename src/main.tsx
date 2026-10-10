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

import React, { Component, ErrorInfo, ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = { hasError: false, error: null };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[Sonora Root Error]", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full min-h-screen bg-[#070709] text-white flex flex-col items-center justify-center p-6 text-center select-none font-sans">
          <div className="max-w-md w-full bg-[#12121a] border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 text-2xl font-bold">
              ⚠️
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Error al iniciar Sonora
            </h1>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Ocurrió un problema inesperado durante el inicio de la aplicación.
            </p>
            {this.state.error?.message && (
              <div className="w-full p-3 rounded-xl bg-black/50 border border-white/5 text-left overflow-auto max-h-32 text-[11px] font-mono text-red-300">
                {this.state.error.message}
              </div>
            )}
            <div className="flex gap-2 w-full mt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition-colors cursor-pointer shadow-lg shadow-purple-600/30"
              >
                Reintentar
              </button>
              <button
                onClick={this.handleReset}
                className="py-2.5 px-4 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-neutral-300 transition-colors cursor-pointer"
                title="Limpiar datos locales corruptos y reiniciar"
              >
                Restablecer
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Asegurar que el elemento raíz exista en el DOM
let rootElement = document.getElementById("root");
if (!rootElement) {
  rootElement = document.createElement("div");
  rootElement.id = "root";
  rootElement.className = "w-full min-h-screen flex flex-col";
  document.body.appendChild(rootElement);
}

const root = createRoot(rootElement);
root.render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>
);

