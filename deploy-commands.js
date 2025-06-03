import { REST, Routes } from 'discord.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const commands = [];
const foldersPath = join(__dirname, 'commands');
const commandFolders = readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = join(foldersPath, folder);
    const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
        const filePath = join(commandsPath, file);
        const command = await import(filePath);
        
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        } else {
            console.log(`[WARNING] El comando en ${filePath} no tiene las propiedades requeridas 'data' o 'execute'.`);
        }
    }
}

const rest = new REST().setToken(config.token);

try {
    // Primero, eliminar todos los comandos existentes
    console.log('Eliminando comandos existentes...');
    
    // Eliminar comandos globales
    await rest.put(
        Routes.applicationCommands(config.clientId),
        { body: [] }
    );
    
    // Eliminar comandos del servidor
    await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: [] }
    );
    
    console.log('Comandos existentes eliminados.');

    // Luego, registrar los nuevos comandos globalmente
    console.log(`Registrando ${commands.length} comandos (/).`);

    const data = await rest.put(
        Routes.applicationCommands(config.clientId),
        { body: commands }
    );

    console.log(`¡Éxito! Se registraron ${data.length} comandos (/).`);
} catch (error) {
    console.error('Error:', error);
} 