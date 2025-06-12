// Importando las clases de discord
import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { config } from './config.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';
import express from 'express';
import * as youtubeNotifier from './events/youtubeNotifier.js';
import { handleMessageForXP, checkAndHandleLevelUp, handleRoleRewards } from './features/levelingSystem.js';
import { initializeStorage, closeStorage } from './utils/storage.js';
import logger from './utils/logger.js';
import rateLimiter from './utils/rateLimiter.js';
import guildConfig from './utils/guildConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Crear una nueva instancia del cliente
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ],
});

// Importando events que no son comandos 
const eventsPath = join(__dirname, 'events');
const eventFiles = readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
	if (file === 'youtubeNotifier.js') {
		logger.info('[Event Loader] Skipping youtubeNotifier.js as it is loaded manually.');
		continue;
	}
	const filePath = join(eventsPath, file);
	const event = await import(filePath);

	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args));
	} else {
		client.on(event.name, (...args) => event.execute(...args));
	}
}

//Creando collections de comandos
client.commands = new Collection();

// Cargar comandos
const foldersPath = join(__dirname, 'commands');
const commandFolders = readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = join(foldersPath, folder);
    const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
        const filePath = join(commandsPath, file);
        const command = await import(filePath);
        
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            logger.info(`✓ Comando cargado: ${command.data.name}`);
        } else {
            logger.warn(`[WARNING] El comando en ${filePath} no tiene las propiedades requeridas 'data' o 'execute'.`);
        }
    }
}

// Manejar interacciones
client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);

            if (!command) {
                logger.warn(`No se encontró el comando ${interaction.commandName}`);
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                logger.error(`Error ejecutando el comando ${interaction.commandName}:`, error);
                
                const errorMessage = {
                    content: '❌ ¡Hubo un error al ejecutar este comando!',
                    ephemeral: true
                };

                if (!interaction.replied && interaction.deferred) {
                    await interaction.editReply(errorMessage);
                } else if (interaction.replied) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        } else if (interaction.isButton()) {
            // Manejar botones de música
            if (interaction.customId.startsWith('music_')) {
                const { handleButton } = await import('./features/music/musicSystem.js');
                await handleButton(interaction);
            }
        }
    } catch (error) {
        logger.error(`Error manejando interacción:`, error);
        
        const errorMessage = {
            content: '❌ ¡Hubo un error al procesar la interacción!',
            ephemeral: true
        };

        try {
            if (!interaction.replied && interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else if (interaction.replied) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        } catch (followupError) {
            logger.error(`No se pudo enviar respuesta de error:`, followupError);
        }
    }
});

// Evento: el bot está listo
client.once(Events.ClientReady, async readyClient => {
    try {
        // Inicializar sistemas
        await Promise.all([
            initializeStorage(),
            guildConfig.init()
        ]);

        // Configurar estado del bot
        client.user.setPresence({
            activities: [{ name: '/help | Versión 2.1', type: 2 }],
            status: 'online'
        });

        logger.info(`✅ Bot iniciado como ${readyClient.user.tag}`);
        
        // Iniciar notificador de YouTube
        await youtubeNotifier.execute(readyClient);
    } catch (error) {
        logger.error('Error al inicializar:', error);
        process.exit(1);
    }
});

// Manejar mensajes para XP
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.guild) return;

    try {
        const xpGained = await handleMessageForXP(message);
        if (xpGained) {
            const leveledUp = await checkAndHandleLevelUp(message);
            if (leveledUp) {
                await handleRoleRewards(message);
            }
        }
    } catch (error) {
        logger.error('Error al manejar XP del mensaje:', error);
    }
});

// Manejar cierre gracioso
process.on('SIGINT', async () => {
    logger.info('Recibida señal de cierre...');
    await closeStorage();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Recibida señal de terminación...');
    await closeStorage();
    process.exit(0);
});

// Iniciar el bot
client.login(config.token);

