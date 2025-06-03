import { REST, Routes } from 'discord.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Lista de comandos a excluir temporalmente
const EXCLUDED_COMMANDS = ['trivia', 'poll', 'event'];
const EXCLUDED_FOLDERS = ['games']; // La carpeta games solo tiene trivia por ahora

const commands = [];
const foldersPath = join(__dirname, 'commands');
const commandFolders = readdirSync(foldersPath);

console.log('Iniciando proceso de registro de comandos...');
console.log(`Client ID: ${config.clientId}`);
console.log(`Guild ID: ${config.guildId}`);
console.log('\nComandos excluidos temporalmente:', EXCLUDED_COMMANDS.join(', '));

for (const folder of commandFolders) {
    // Saltar carpetas excluidas
    if (EXCLUDED_FOLDERS.includes(folder)) {
        console.log(`\nSaltando carpeta ${folder} (excluida temporalmente)`);
        continue;
    }

    const commandsPath = join(foldersPath, folder);
    const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    console.log(`\nCargando comandos de la carpeta ${folder}:`);
    
    for (const file of commandFiles) {
        const filePath = join(commandsPath, file);
        const command = await import(filePath);
        
        if ('data' in command && 'execute' in command) {
            // Saltar comandos excluidos
            if (EXCLUDED_COMMANDS.includes(command.data.name)) {
                console.log(`⨯ Saltando comando: ${command.data.name} (excluido temporalmente)`);
                continue;
            }
            commands.push(command.data.toJSON());
            console.log(`✓ Comando cargado: ${command.data.name}`);
        } else {
            console.log(`✗ Error: El comando en ${filePath} no tiene las propiedades requeridas 'data' o 'execute'.`);
        }
    }
}

const rest = new REST().setToken(config.token);

try {
    console.log('\nIniciando registro de comandos...');
    console.log(`Registrando ${commands.length} comandos en el servidor ${config.guildId}...`);
    
    const data = await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commands }
    );

    console.log(`\n¡Éxito! Se registraron ${data.length} comandos en el servidor.`);
    console.log('\nComandos registrados:');
    data.forEach(cmd => {
        console.log(`- /${cmd.name}`);
    });
} catch (error) {
    console.error('\nError durante el registro:', error);
    if (error.code === 50001) {
        console.error('Error: El bot no tiene los permisos necesarios en el servidor.');
    } else if (error.code === 50013) {
        console.error('Error: El bot no tiene permisos para gestionar comandos en el servidor.');
    } else if (error.code === 10002) {
        console.error('Error: El servidor especificado no existe o el bot no tiene acceso a él.');
    }
} 