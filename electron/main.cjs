const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { pathToFileURL } = require('url');

// 1. Registrar esquema de protocolo seguro 'app://' antes de que la aplicación esté lista.
// Esto permite que Chromium cargue módulos ES (type="module") y recursos empaquetados
// dentro de app.asar sin restricciones de CORS ni errores de origen null propios de file://.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

// 2. Mitigación de problemas de renderizado y pantalla negra en Windows:
// Permitir desactivar GPU si el usuario pasa el flag --disable-gpu o variables de entorno.
if (process.argv.includes('--disable-gpu') || process.env.SONORA_DISABLE_GPU === '1' || process.env.ELECTRON_DISABLE_GPU === '1') {
  console.log('[Electron] Aceleración por hardware desactivada por parámetro.');
  app.disableHardwareAcceleration();
}

// Configuración de Chromium para audio y compatibilidad de pantalla
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');
app.commandLine.appendSwitch('disable-software-rasterizer', 'false');

// Monitor de fallos del proceso de GPU: si la GPU falla en Windows, no dejar la ventana en negro
app.on('child-process-gone', (_event, details) => {
  if (details.type === 'GPU' && details.reason !== 'clean-exit') {
    console.warn('[Electron] Advertencia: El proceso de GPU se detuvo inesperadamente (' + details.reason + ').');
  }
});

/**
 * Encuentra el directorio donde residen los archivos compilados de la interfaz (dist).
 * Cubre desarrollo, producción empaquetada (.asar) y modo portable.
 */
function resolveDistDir() {
  const appPath = app.getAppPath();
  const resourcesDir = process.resourcesPath || '';

  const candidateDirs = [
    path.join(__dirname, '../dist'),
    path.join(__dirname, 'dist'),
    path.join(appPath, 'dist'),
    appPath,
    path.join(resourcesDir, 'app.asar/dist'),
    path.join(resourcesDir, 'app/dist'),
    path.join(process.cwd(), 'dist'),
  ];

  for (const dir of candidateDirs) {
    try {
      const testIndex = path.join(dir, 'index.html');
      if (fs.existsSync(testIndex)) {
        return dir;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Comprueba de forma no bloqueante si el servidor local de desarrollo Vite está activo.
 */
function isDevServerRunning(port = 3000) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}`, { timeout: 600 }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Configura el manejador del protocolo 'app://' para servir archivos estáticos desde dist/
 */
function registerAppProtocolHandler(distDir) {
  if (!distDir) return;

  protocol.handle('app', (request) => {
    try {
      const url = new URL(request.url);
      let relativePath = decodeURIComponent(url.pathname);

      if (relativePath.startsWith('/')) {
        relativePath = relativePath.slice(1);
      }
      if (!relativePath || relativePath === '/' || relativePath === 'index.html') {
        relativePath = 'index.html';
      }

      const candidateFile = path.join(distDir, relativePath);

      if (fs.existsSync(candidateFile)) {
        return net.fetch(pathToFileURL(candidateFile).toString());
      }

      // Si no existe el archivo estático solicitado, fallback a index.html (SPA)
      const fallbackIndex = path.join(distDir, 'index.html');
      if (fs.existsSync(fallbackIndex)) {
        return net.fetch(pathToFileURL(fallbackIndex).toString());
      }

      return new Response('Not Found', { status: 404 });
    } catch (err) {
      console.error('[Electron] Error en app:// protocol handler:', err);
      const fallbackIndex = path.join(distDir, 'index.html');
      return net.fetch(pathToFileURL(fallbackIndex).toString());
    }
  });
}

async function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Sonora Music Player',
    backgroundColor: '#0a0915',
    icon: path.join(__dirname, '../public/icon.png'),
    autoHideMenuBar: true,
    show: false, // Se muestra en 'ready-to-show' para evitar parpadeos
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
      sandbox: false,
    },
  });

  // Mostrar la ventana cuando el contenido esté listo para pintar
  let windowShown = false;
  mainWindow.once('ready-to-show', () => {
    if (!windowShown && !mainWindow.isDestroyed()) {
      windowShown = true;
      mainWindow.show();
    }
  });

  // Fallback de seguridad: si ready-to-show tarda más de 2 segundos, forzar visualización
  setTimeout(() => {
    if (!windowShown && !mainWindow.isDestroyed()) {
      windowShown = true;
      mainWindow.show();
    }
  }, 2000);

  // Determinar origen: servidor Vite local (dev) o protocolo app:// (dist)
  const isDev = !app.isPackaged && (await isDevServerRunning(3000));
  const distDir = resolveDistDir();

  if (isDev) {
    console.log('[Electron] Modo Desarrollo: Conectando a http://localhost:3000');
    mainWindow.loadURL('http://localhost:3000').catch((err) => {
      console.error('[Electron] Error al conectar con servidor de desarrollo:', err);
      loadPackagedOrFallback(mainWindow, distDir);
    });
  } else if (distDir) {
    loadPackagedOrFallback(mainWindow, distDir);
  } else {
    showNoBuildScreen(mainWindow);
  }

  // Manejo de errores de carga de la página
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Electron] Error cargando URL (${errorCode}): ${errorDescription} en ${validatedURL}`);
    if (!mainWindow.isDestroyed()) {
      showErrorScreen(mainWindow, errorDescription, errorCode);
    }
  });

  // Registrar advertencias y errores del renderer en la consola
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.warn(`[Renderer Warn/Error] ${message} (${sourceId}:${line})`);
    }
  });

  // Atajo F12 o Ctrl+Shift+I para abrir consola de diagnóstico
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
}

function loadPackagedOrFallback(mainWindow, distDir) {
  if (!distDir) {
    showNoBuildScreen(mainWindow);
    return;
  }

  console.log('[Electron] Cargando interfaz empaquetada desde:', distDir);

  // Intentar cargar mediante el protocolo registrado 'app://sonora/index.html'
  mainWindow.loadURL('app://sonora/index.html').catch((protoErr) => {
    console.warn('[Electron] app:// protocol falló, intentando file:// loadFile directo:', protoErr);
    const indexFile = path.join(distDir, 'index.html');
    mainWindow.loadFile(indexFile).catch((fileErr) => {
      console.error('[Electron] loadFile directo también falló:', fileErr);
      showErrorScreen(mainWindow, fileErr.message || 'No se pudo cargar la interfaz', -1);
    });
  });
}

function showNoBuildScreen(mainWindow) {
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Sonora Music - Inicio</title>
        <style>
          body { background: #0a0915; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
          .card { background: #131127; padding: 36px; border-radius: 20px; border: 1px solid #3b356e; max-width: 480px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
          h2 { color: #c084fc; margin-top: 0; }
          p { font-size: 14px; opacity: 0.85; line-height: 1.6; }
          code { background: #1f1b3d; padding: 4px 10px; border-radius: 6px; font-family: monospace; color: #e9d5ff; font-weight: bold; }
          button { background: #7c3aed; color: #fff; border: none; padding: 12px 24px; border-radius: 10px; cursor: pointer; font-weight: bold; margin-top: 18px; font-size: 13px; }
          button:hover { background: #9333ea; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Sonora Music Player</h2>
          <p>Los archivos de la interfaz no se encontraron en la carpeta <code>dist/</code>.</p>
          <p>Para solucionarlo en tu computadora, abre una terminal en el proyecto y compila ejecutando:</p>
          <p><code>npm run build</code></p>
          <p style="font-size:12px;opacity:0.65;margin-top:10px;">Si estás programando, también puedes ejecutar <code>npm run dev</code> para ver los cambios en tiempo real.</p>
          <button onclick="location.reload()">Reintentar Carga</button>
        </div>
      </body>
    </html>
  `)}`);
  mainWindow.show();
}

function showErrorScreen(mainWindow, description, code) {
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Sonora Music - Diagnóstico</title>
        <style>
          body { background: #0a0915; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
          .card { background: #16152b; padding: 36px; border-radius: 20px; border: 1px solid #332f5e; max-width: 480px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
          h2 { color: #f87171; margin-top: 0; }
          p { font-size: 13px; opacity: 0.85; line-height: 1.6; }
          .code-box { background: #0e0d1c; padding: 12px; border-radius: 8px; font-family: monospace; color: #fca5a5; font-size: 12px; text-align: left; overflow-x: auto; margin: 16px 0; border: 1px solid #2e2a4a; }
          button { background: #7c3aed; color: #fff; border: none; padding: 12px 24px; border-radius: 10px; cursor: pointer; font-weight: bold; margin-top: 8px; }
          button:hover { background: #9333ea; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Error al cargar Sonora Music</h2>
          <p>La ventana se abrió pero no pudo renderizar los componentes:</p>
          <div class="code-box">Detalle: ${description} (Código: ${code})</div>
          <p style="font-size:12px;opacity:0.7;">Presiona <kbd style="background:#222;padding:2px 6px;border-radius:4px;">F12</kbd> para abrir las herramientas de desarrollador.</p>
          <button onclick="location.reload()">Reintentar</button>
        </div>
      </body>
    </html>
  `)}`);
  mainWindow.show();
}

app.whenReady().then(() => {
  // Registrar el manejador de archivos para el protocolo 'app://'
  const distDir = resolveDistDir();
  if (distDir) {
    registerAppProtocolHandler(distDir);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
