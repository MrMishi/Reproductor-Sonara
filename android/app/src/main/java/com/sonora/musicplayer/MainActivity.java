package com.sonora.musicplayer;

import android.os.Bundle;
import android.os.PowerManager;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

/**
 * ============================================================================
 * SONARA MUSIC - ACTIVIDAD PRINCIPAL NATIVA ANDROID (MainActivity.java)
 * ============================================================================
 * Gestiona la inicialización de Capacitor, plugins locales y garantiza
 * que el motor de audio y el WebView continúen reproduciendo música
 * ininterrumpidamente cuando el usuario bloquea la pantalla o suspende el móvil.
 */
public class MainActivity extends BridgeActivity {
    // WakeLock parcial para asegurar que la CPU no se congele durante la suspensión de pantalla
    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeFolderPickerPlugin.class);
        super.onCreate(savedInstanceState);

        // Permitir reproducción continua de audio en segundo plano y control por MediaSession sin bloqueo por gestos
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebSettings settings = getBridge().getWebView().getSettings();
                settings.setMediaPlaybackRequiresUserGesture(false);
            }
        } catch (Exception ignored) {
        }

        // Preparar WakeLock parcial para activarlo ÚNICAMENTE cuando la pantalla se suspenda
        // evitando consumo innecesario de batería mientras la pantalla esté encendida
        try {
            PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Sonora:AudioPlaybackWakeLock");
                wakeLock.setReferenceCounted(false);
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // Liberar WakeLock en primer plano con pantalla encendida para máximo ahorro de batería
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Garantizar que la reproducción de audio continúe cuando la pantalla se apaga / bloquea
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().resumeTimers();
                getBridge().getWebView().onResume();
            }
        } catch (Exception ignored) {
        }

        // Adquirir WakeLock con límite de seguridad (30 minutos) SOLO al suspender pantalla para no agotar la batería
        try {
            if (wakeLock != null && !wakeLock.isHeld()) {
                wakeLock.acquire(30 * 60 * 1000L);
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        // Mantener activos los temporizadores y el ciclo de audio al suspender el dispositivo
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().resumeTimers();
                getBridge().getWebView().onResume();
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onDestroy() {
        // Liberar el WakeLock al destruir la actividad para optimizar la batería
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Exception ignored) {
        }
        super.onDestroy();
    }
}
