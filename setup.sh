#!/bin/bash

# Verificar si se proporcionó la IP del VPS
if [ "$#" -ne 1 ]; then
    echo "❌ Error: Debes proporcionar la IP del VPS"
    echo "Uso: ./setup.sh usuario@ip_del_vps"
    exit 1
fi

VPS_CONNECTION=$1

# Crear script remoto
echo "📝 Creando script de instalación remoto..."
cat > remote_setup.sh << 'EOL'
#!/bin/bash

# Actualizar el sistema
echo "🔄 Actualizando el sistema..."
apt-get update && apt-get upgrade -y

# Instalar Node.js y npm
echo "📦 Instalando Node.js y npm..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Instalar git
echo "📦 Instalando git..."
apt-get install -y git

# Clonar el repositorio
echo "📥 Clonando el repositorio..."
git clone https://github.com/Ex678/ds_bot_dx.git
cd ds_bot_dx

# Instalar dependencias
echo "📦 Instalando dependencias..."
npm install

# Configurar la base de datos
echo "🗄️ Configurando la base de datos..."
node database_setup.js

# Registrar comandos
echo "🔧 Registrando comandos..."
node deploy-commands.js

echo "✅ Instalación básica completada."
EOL

# Dar permisos de ejecución al script remoto
chmod +x remote_setup.sh

# Transferir el script al VPS
echo "📤 Transfiriendo script de instalación al VPS..."
scp remote_setup.sh "$VPS_CONNECTION:~/"

# Transferir config.js al VPS
echo "📤 Transfiriendo archivo de configuración al VPS..."
scp config.js "$VPS_CONNECTION:~/ds_bot_dx/"

# Ejecutar el script remoto
echo "🚀 Ejecutando instalación en el VPS..."
ssh "$VPS_CONNECTION" "sudo ./remote_setup.sh"

# Limpiar archivos temporales
rm remote_setup.sh

echo "✅ Configuración completada. Para iniciar el bot:"
echo "1. Conéctate al VPS: ssh $VPS_CONNECTION"
echo "2. Navega al directorio: cd ds_bot_dx"
echo "3. Instala PM2: npm install -g pm2"
echo "4. Inicia el bot: pm2 start index.js"

# Instrucciones adicionales de seguridad
echo -e "\n⚠️ IMPORTANTE - Seguridad:"
echo "1. Asegúrate de que config.js esté en .gitignore"
echo "2. Verifica los permisos del archivo config.js en el VPS:"
echo "   ssh $VPS_CONNECTION 'chmod 600 ~/ds_bot_dx/config.js'"
echo "3. Considera usar un archivo .env en el futuro para mayor seguridad" 