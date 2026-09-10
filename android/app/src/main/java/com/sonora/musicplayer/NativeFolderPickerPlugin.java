package com.sonora.musicplayer;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Plugin nativo de Capacitor para invocar DIRECTAMENTE el selector oficial de carpetas de Android
 * mediante el Intent nativo 'Intent.ACTION_OPEN_DOCUMENT_TREE' (Storage Access Framework - SAF).
 *
 * Al presionar "Seleccionar Carpeta", abre la ventana oficial del sistema Android (pantalla nativa del teléfono)
 * para que el usuario elija cualquier carpeta (almacenamiento interno o tarjeta SD) y presione "Usar esta carpeta".
 * Una vez concedido el permiso persistente, lee de forma recursiva los archivos de audio y devuelve sus URIs
 * nativas para que la aplicación las registre directamente sin pasar por cachés ni blobs.
 */
@CapacitorPlugin(name = "NativeFolderPicker")
public class NativeFolderPickerPlugin extends Plugin {

    private static final String TAG = "NativeFolderPicker";

    // Extensiones de audio compatibles admitidas
    private static final Set<String> SUPPORTED_AUDIO_EXTENSIONS = new HashSet<String>() {{
        add(".mp3");
        add(".m4a");
        add(".flac");
        add(".wav");
        add(".ogg");
        add(".opus");
        add(".aac");
        add(".webm");
        add(".wma");
    }};

    /**
     * Invoca directamente el Intent oficial del sistema Android: ACTION_OPEN_DOCUMENT_TREE (SAF).
     * Muestra la interfaz nativa del explorador de archivos del sistema para seleccionar un directorio.
     */
    @PluginMethod
    public void pickFolder(PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            intent.addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION |
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION |
                Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
            );

            startActivityForResult(call, intent, "handleFolderPickerResult");
        } catch (Exception e) {
            Log.e(TAG, "Error al lanzar Intent.ACTION_OPEN_DOCUMENT_TREE", e);
            call.reject("Error al abrir el selector de carpetas del sistema: " + e.getMessage());
        }
    }

    /**
     * Callback invocado cuando el usuario confirma la carpeta ("Usar esta carpeta") o cancela en el diálogo SAF.
     */
    @ActivityCallback
    private void handleFolderPickerResult(PluginCall call, ActivityResult result) {
        if (result == null || result.getResultCode() != Activity.RESULT_OK) {
            JSObject res = new JSObject();
            res.put("cancelled", true);
            res.put("files", new JSArray());
            call.resolve(res);
            return;
        }

        Intent data = result.getData();
        if (data == null || data.getData() == null) {
            JSObject res = new JSObject();
            res.put("cancelled", true);
            res.put("files", new JSArray());
            call.resolve(res);
            return;
        }

        Uri treeUri = data.getData();

        // 1. Conceder y persistir permisos de lectura a la URI seleccionada por el usuario
        try {
            int takeFlags = data.getFlags() & (
                Intent.FLAG_GRANT_READ_URI_PERMISSION |
                Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            );
            if (takeFlags == 0) {
                takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION;
            }
            getContext().getContentResolver().takePersistableUriPermission(treeUri, takeFlags);
        } catch (Exception e) {
            Log.w(TAG, "Aviso al persistir permisos de la URI SAF: " + e.getMessage());
        }

        // 2. Ejecutar la exploración del árbol de documentos en un hilo secundario para no congelar la UI
        new Thread(() -> {
            try {
                DocumentFile rootDoc = DocumentFile.fromTreeUri(getContext(), treeUri);
                String folderName = "Carpeta seleccionada";
                if (rootDoc != null && rootDoc.getName() != null && !rootDoc.getName().isEmpty()) {
                    folderName = rootDoc.getName();
                }

                List<JSObject> audioEntries = new ArrayList<>();
                if (rootDoc != null) {
                    scanDocumentDirectoryRecursively(rootDoc, "", audioEntries, 0);
                }

                JSObject response = new JSObject();
                response.put("cancelled", false);
                response.put("folderName", folderName);
                response.put("folderUri", treeUri.toString());

                JSArray filesArray = new JSArray();
                for (JSObject item : audioEntries) {
                    filesArray.put(item);
                }
                response.put("files", filesArray);
                response.put("totalCount", audioEntries.size());

                call.resolve(response);
            } catch (Exception e) {
                Log.e(TAG, "Error explorando la carpeta SAF seleccionada", e);
                call.reject("Error al leer el contenido de la carpeta: " + e.getMessage());
            }
        }).start();
    }

    /**
     * Recorre recursivamente los documentos y subdirectorios de la carpeta seleccionada en SAF
     */
    private void scanDocumentDirectoryRecursively(DocumentFile dir, String currentRelativePath, List<JSObject> results, int depth) {
        // Límite de profundidad de 10 niveles para seguridad y rendimiento
        if (depth > 10 || dir == null || !dir.isDirectory()) {
            return;
        }

        DocumentFile[] files = dir.listFiles();
        if (files == null) return;

        for (DocumentFile file : files) {
            if (file == null) continue;

            String name = file.getName();
            if (name == null || name.isEmpty() || name.startsWith(".")) {
                // Omitir archivos y carpetas ocultas
                continue;
            }

            if (file.isDirectory()) {
                String lowerName = name.toLowerCase(Locale.ROOT);
                // Omitir carpetas reservadas del sistema
                if (lowerName.equals("android") || lowerName.equals("lost.dir")) {
                    continue;
                }
                String nextRelativePath = currentRelativePath.isEmpty() ? name : currentRelativePath + " / " + name;
                scanDocumentDirectoryRecursively(file, nextRelativePath, results, depth + 1);
            } else if (file.isFile()) {
                if (isAudioFile(name, file.getType())) {
                    JSObject item = new JSObject();
                    item.put("name", name);
                    // URI nativa persistida concedida por el sistema SAF
                    item.put("uri", file.getUri().toString());
                    item.put("size", file.length());
                    item.put("lastModified", file.lastModified());
                    item.put("mimeType", file.getType() != null ? file.getType() : "audio/*");
                    item.put("relativePath", currentRelativePath);
                    results.add(item);
                }
            }
        }
    }

    /**
     * Valida si un archivo es audio basándose en su tipo MIME o extensión de archivo
     */
    private boolean isAudioFile(String name, String mimeType) {
        if (mimeType != null && mimeType.toLowerCase(Locale.ROOT).startsWith("audio/")) {
            return true;
        }
        String lowerName = name.toLowerCase(Locale.ROOT);
        for (String ext : SUPPORTED_AUDIO_EXTENSIONS) {
            if (lowerName.endsWith(ext)) {
                return true;
            }
        }
        return false;
    }
}
