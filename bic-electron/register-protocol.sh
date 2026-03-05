#!/bin/bash

# Script para registrar manualmente el protocolo bic:// en Linux
# Útil para instalaciones con AppImage o cuando el post-install no se ejecuta

echo "=========================================="
echo "Registrando protocolo bic:// en Linux"
echo "=========================================="
echo ""

# Detectar la ruta del ejecutable
EXEC_PATH=""

# Buscar en ubicaciones comunes
if [ -f "/usr/bin/bic-electron" ]; then
    EXEC_PATH="/usr/bin/bic-electron"
elif [ -f "/opt/Bic/bic-electron" ]; then
    EXEC_PATH="/opt/Bic/bic-electron"
elif [ -f "$HOME/.local/bin/bic-electron" ]; then
    EXEC_PATH="$HOME/.local/bin/bic-electron"
else
    echo "No se encontró el ejecutable de Bic"
    echo "Por favor, especifique la ruta manualmente:"
    read -p "Ruta completa al ejecutable: " EXEC_PATH
    
    if [ ! -f "$EXEC_PATH" ]; then
        echo "Error: El archivo no existe: $EXEC_PATH"
        exit 1
    fi
fi

echo "Ejecutable encontrado: $EXEC_PATH"
echo ""

# Crear directorio de aplicaciones del usuario
mkdir -p "$HOME/.local/share/applications"

# Crear archivo .desktop
DESKTOP_FILE="$HOME/.local/share/applications/bic-electron.desktop"

cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Name=Bic
Comment=Aplicación de firma digital BIC
Exec=$EXEC_PATH %U
Icon=bic-electron
Type=Application
Categories=Office;
MimeType=x-scheme-handler/bic;
StartupNotify=true
Terminal=false
EOF

echo "Archivo .desktop creado: $DESKTOP_FILE"

# Actualizar base de datos de aplicaciones
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database "$HOME/.local/share/applications" 2>/dev/null
    echo "Base de datos de aplicaciones actualizada"
fi

# Registrar el manejador de protocolo
xdg-mime default bic-electron.desktop x-scheme-handler/bic

echo ""
echo "=========================================="
echo "Protocolo bic:// registrado correctamente"
echo "=========================================="
echo ""
echo "Para probar, ejecute en su navegador:"
echo "  bic://test"
echo ""
echo "O desde la terminal:"
echo "  xdg-open 'bic://test'"
echo ""
echo "Nota: Puede que necesite reiniciar su navegador"
echo "      para que los cambios surtan efecto"
echo ""

# Verificar el registro
echo "Verificando registro..."
HANDLER=$(xdg-mime query default x-scheme-handler/bic)
if [ "$HANDLER" = "bic-electron.desktop" ]; then
    echo "✓ Protocolo registrado correctamente"
else
    echo "⚠ Advertencia: El manejador registrado es: $HANDLER"
    echo "  Se esperaba: bic-electron.desktop"
fi

exit 0
