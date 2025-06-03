import { REST, Routes } from 'discord.js';
import { config } from './config.js';

const rest = new REST().setToken(config.token);

async function clearCommands() {
    try {
        console.log('Iniciando limpieza de comandos...');
        
        // Eliminar comandos globales
        console.log('1. Eliminando comandos globales...');
        await rest.put(
            Routes.applicationCommands(config.clientId),
            { body: [] }
        );
        console.log('✓ Comandos globales eliminados.');
        
        // Eliminar comandos del servidor
        console.log(`\n2. Eliminando comandos del servidor ${config.guildId}...`);
        await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: [] }
        );
        console.log('✓ Comandos del servidor eliminados.');

        console.log('\n¡Limpieza completada! Ahora ejecuta node deploy-commands.js para registrar los comandos nuevamente.');
    } catch (error) {
        console.error('\nError durante la limpieza:', error);
        if (error.code === 50001) {
            console.error('Error: El bot no tiene los permisos necesarios.');
        } else if (error.code === 50013) {
            console.error('Error: El bot no tiene permisos para gestionar comandos.');
        } else if (error.code === 10002) {
            console.error('Error: El servidor especificado no existe o el bot no tiene acceso a él.');
        }
    }
}

clearCommands(); 