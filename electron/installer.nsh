; ============================================================================
; SONORA MUSIC - SCRIPT NSIS PERSONALIZADO (installer.nsh)
; ============================================================================
; Proposito:
; Garantiza que al instalarse la aplicacion en Windows (PC) se genere
; y coloque el archivo ejecutable 'Unistaller.exe' (y 'Uninstaller.exe') directamente
; en el directorio de instalacion ($INSTDIR) junto a Sonora Music.exe,
; y que funcione al 100% para desinstalar la aplicacion limpiamente.
; ============================================================================

!include "LogicLib.nsh"

!macro customInstall
  DetailPrint "Configurando desinstalador Unistaller.exe en la carpeta de instalacion..."

  ; 1. Localizar el ejecutable del desinstalador generado por NSIS y duplicarlo como Unistaller.exe y Uninstaller.exe
  ${If} ${FileExists} "$INSTDIR\Uninstall ${PRODUCT_NAME}.exe"
    CopyFiles /SILENT "$INSTDIR\Uninstall ${PRODUCT_NAME}.exe" "$INSTDIR\Unistaller.exe"
    CopyFiles /SILENT "$INSTDIR\Uninstall ${PRODUCT_NAME}.exe" "$INSTDIR\Uninstaller.exe"
  ${ElseIf} ${FileExists} "$INSTDIR\Uninstall Sonora Music.exe"
    CopyFiles /SILENT "$INSTDIR\Uninstall Sonora Music.exe" "$INSTDIR\Unistaller.exe"
    CopyFiles /SILENT "$INSTDIR\Uninstall Sonora Music.exe" "$INSTDIR\Uninstaller.exe"
  ${EndIf}

  ; 2. Crear accesos directos en el Menu Inicio de Windows para desinstalar
  ${If} ${FileExists} "$SMPROGRAMS\Sonora Music"
    CreateShortcut "$SMPROGRAMS\Sonora Music\Desinstalar Sonora Music.lnk" "$INSTDIR\Unistaller.exe" "" "$INSTDIR\Unistaller.exe" 0
    CreateShortcut "$SMPROGRAMS\Sonora Music\Unistaller.lnk" "$INSTDIR\Unistaller.exe" "" "$INSTDIR\Unistaller.exe" 0
  ${ElseIf} ${FileExists} "$SMPROGRAMS\${SHORTCUT_NAME}"
    CreateShortcut "$SMPROGRAMS\${SHORTCUT_NAME}\Desinstalar Sonora Music.lnk" "$INSTDIR\Unistaller.exe" "" "$INSTDIR\Unistaller.exe" 0
    CreateShortcut "$SMPROGRAMS\${SHORTCUT_NAME}\Unistaller.lnk" "$INSTDIR\Unistaller.exe" "" "$INSTDIR\Unistaller.exe" 0
  ${EndIf}

  ; 3. Registrar Unistaller.exe en las entradas oficiales de desinstalacion del registro de Windows
  ; para que tambien se ejecute desde 'Configuracion de Windows > Aplicaciones instaladas'
  WriteRegStr SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString" '"$INSTDIR\Unistaller.exe"'
  WriteRegStr SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "QuietUninstallString" '"$INSTDIR\Unistaller.exe" /S'
!macroend

!macro customUnInstall
  DetailPrint "Limpiando desinstaladores y accesos directos de Sonora Music..."
  Delete "$INSTDIR\Unistaller.exe"
  Delete "$INSTDIR\Uninstaller.exe"
  Delete "$SMPROGRAMS\Sonora Music\Desinstalar Sonora Music.lnk"
  Delete "$SMPROGRAMS\Sonora Music\Unistaller.lnk"
  ${If} ${FileExists} "$SMPROGRAMS\${SHORTCUT_NAME}"
    Delete "$SMPROGRAMS\${SHORTCUT_NAME}\Desinstalar Sonora Music.lnk"
    Delete "$SMPROGRAMS\${SHORTCUT_NAME}\Unistaller.lnk"
  ${EndIf}
!macroend
