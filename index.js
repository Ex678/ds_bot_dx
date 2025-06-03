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

//Importando events que no son comandos 
const eventsPath = join(__dirname, 'events');
const eventFiles = readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
	if (file === 'youtubeNotifier.js') {
		console.log('[Index Event Loader] Skipping youtubeNotifier.js as it is loaded manually.');
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
        } else {
            console.log(`[WARNING] El comando en ${filePath} no tiene "data" o "execute" requeridos.`);
        }
    }
}

// Manejar comandos slash e interacciones de botones
client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`Comando ${interaction.commandName} no encontrado.`);
                return interaction.reply({
                    content: '❌ ¡Comando no encontrado!',
                    ephemeral: true
                });
            }

            await command.execute(interaction);
        } else if (interaction.isButton()) {
            // Manejar botones de música
            if (interaction.customId.startsWith('music_')) {
                const { handleButton } = await import('./features/music/musicSystem.js');
                await handleButton(interaction);
            }
        }
    } catch (error) {
        console.error(`Error manejando interacción:`, error);
        
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
            console.error(`No se pudo enviar respuesta de error:`, followupError);
        }
    }
});

// Evento: el bot está listo
client.once(Events.ClientReady, async readyClient => {
    try {
        // Inicializar base de datos
        await initializeDatabase();
        console.log(`✅ Bot iniciado como ${readyClient.user.tag}`);
        
        // Iniciar notificador de YouTube
        await youtubeNotifier.execute(readyClient);
    } catch (error) {
        console.error('Error al inicializar:', error);
        process.exit(1);
    }
});

// Evento: Mensaje creado (para sistema de niveles)
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.guild) return;

    try {
        const updatedUserData = await handleMessageForXP(message);
        if (updatedUserData) {
            const finalUserData = await checkAndHandleLevelUp(message, updatedUserData);
            if (finalUserData && message.member) {
                await handleRoleRewards(message.member, finalUserData);
            }
        }
    } catch (error) {
        console.error('[Index] Error procesando mensaje para XP/Nivel:', error);
    }
});

// Servidor HTTP simple para mantener el bot vivo
const app = express();

app.get("/", (req, res) => {
    res.send("El bot está vivo.");
});

app.listen(3000, () => {
    console.log("Servidor HTTP escuchando en el puerto 3000");
});

// Manejar cierre gracioso
process.on('SIGINT', async () => {
    console.log('\nCerrando conexión con la base de datos...');
    await closeDatabase();
    console.log('¡Hasta luego!');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nCerrando conexión con la base de datos...');
    await closeDatabase();
    console.log('¡Hasta luego!');
    process.exit(0);
});

// Iniciar el bot
client.login(config.token);

