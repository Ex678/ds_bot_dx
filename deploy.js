// Requerimos los módulos necesarios
const { REST, Routes } = require('discord.js');
const { clientId, guildId, token } = require('./config.json');
const fs = require('node:fs');
const path = require('node:path');

// Array donde se guardarán los comandos listos para enviar a Discord
const commands = [];

const foldersPath = path.join(__dirname, 'commands');           // Ruta a la carpeta commands
const commandFolders = fs.readdirSync(foldersPath);            // Lee subcarpetas (como 'utility')

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);       // e.g. ./commands/utility
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        // Asegura que cada comando tenga `data` y `execute`
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());              // Convierte el builder en JSON
        } else {
            console.log(`[WARNING] El comando ${filePath} no tiene "data" o "execute".`);
        }
    }
}

// Crea un cliente REST con tu token
const rest = new REST().setToken(token);

// Función asincrónica para registrar los comandos en tu servidor
(async () => {
    try {
        console.log(`🔄 Registrando ${commands.length} comando(s)...`);

        const data = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId), // Comandos solo en tu servidor
            { body: commands },
        );

        console.log(`✅ ${data.length} comando(s) registrados correctamente.`);
    } catch (error) {
        console.error('❌ Error al registrar los comandos:', error);
    }
})();

