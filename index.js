// Importando las clases de discord
import { Client, Collection, Events, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import { config } from './config.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';
import express from 'express';
import * as youtubeNotifier from './events/youtubeNotifier.js';
import { handleMessageForXP, checkAndHandleLevelUp, handleRoleRewards } from './features/levelingSystem.js';
import { initializeDatabase, closeDatabase } from './database.js';
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
            logger.debug(`Comando cargado: ${command.data.name}`);
        } else {
            logger.warn(`[WARNING] El comando en ${filePath} no tiene "data" o "execute" requeridos.`);
        }
    }
}

// Manejar comandos slash e interacciones de botones
client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);

            if (!command) {
                logger.error(`Comando ${interaction.commandName} no encontrado.`);
                return interaction.reply({
                    content: '❌ ¡Comando no encontrado!',
                    ephemeral: true
                });
            }

            // Verificar rate limits
            const userId = interaction.user.id;
            if (rateLimiter.isRateLimited(userId)) {
                return interaction.reply({
                    content: '⚠️ ¡Estás usando comandos demasiado rápido! Por favor, espera un momento.',
                    ephemeral: true
                });
            }

            // Verificar cooldown específico del comando
            const cooldownAmount = command.cooldown || 3;
            const timeLeft = rateLimiter.checkCooldown(command.data.name, userId, cooldownAmount);
            
            if (timeLeft) {
                return interaction.reply({
                    content: `⏳ Por favor espera ${timeLeft} segundos antes de usar el comando \`${command.data.name}\` nuevamente.`,
                    ephemeral: true
                });
            }

            // Verificar configuración del servidor
            const guildSettings = interaction.guild ? guildConfig.getConfig(interaction.guild.id) : null;
            
            if (guildSettings?.disabledCommands.includes(command.data.name)) {
                return interaction.reply({
                    content: '❌ Este comando está deshabilitado en este servidor.',
                    ephemeral: true
                });
            }

            await command.execute(interaction, guildSettings);
            logger.info(`Comando ${command.data.name} ejecutado por ${interaction.user.tag}`);

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
            initializeDatabase(),
            guildConfig.init()
        ]);

        // Configurar estado del bot
        client.user.setPresence({
            activities: [{ name: '/help | Versión 2.0', type: 2 }],
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

// Evento: Mensaje creado (para sistema de niveles)
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.guild) return;

    try {
        const guildSettings = guildConfig.getConfig(message.guild.id);
        
        // Verificar si el sistema de niveles está habilitado
        if (guildSettings.levelSystem.enabled) {
            const updatedUserData = await handleMessageForXP(message, guildSettings.levelSystem);
            if (updatedUserData) {
                const finalUserData = await checkAndHandleLevelUp(message, updatedUserData, guildSettings);
                if (finalUserData && message.member) {
                    await handleRoleRewards(message.member, finalUserData, guildSettings.levelSystem.roleRewards);
                }
            }
        }
    } catch (error) {
        logger.error('[Index] Error procesando mensaje para XP/Nivel:', error);
    }
});

// Servidor HTTP mejorado
const app = express();

// Middleware básico de seguridad
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Endpoint de estado
app.get("/status", (req, res) => {
    const status = {
        status: "online",
        uptime: process.uptime(),
        serverCount: client.guilds.cache.size,
        userCount: client.users.cache.size,
        ping: client.ws.ping
    };
    res.json(status);
});

app.get("/", (req, res) => {
    res.send("El bot está vivo.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`Servidor HTTP escuchando en el puerto ${PORT}`);
});

// Manejar cierre gracioso
async function handleShutdown(signal) {
    logger.info(`Recibida señal ${signal}. Iniciando cierre gracioso...`);
    
    try {
        logger.info('Cerrando conexión con la base de datos...');
        await closeDatabase();
        
        logger.info('Guardando configuraciones...');
        await guildConfig.saveConfigs();
        
        logger.info('Desconectando bot...');
        client.destroy();
        
        logger.info('¡Hasta luego!');
        process.exit(0);
    } catch (error) {
        logger.error('Error durante el cierre:', error);
        process.exit(1);
    }
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
    logger.error('Excepción no capturada:', error);
    handleShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Promesa rechazada no manejada:', { reason, promise });
});

// Iniciar el bot
client.login(config.token).catch(error => {
    logger.error('Error al iniciar sesión:', error);
    process.exit(1);
});

