// Importando las clases de discord
const fs = require('node:fs');
const path = require('node:path');
const { Client, Events, GatewayIntentBits, Collection } = require('discord.js');
const { token } = require('./config.json');
const youtubeNotifier = require('./events/youtubeNotifier.js');
const { handleMessageForXP, checkAndHandleLevelUp, handleRoleRewards } = require('./features/levelingSystem.js');

// Creando una nueva instancia del cliente
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // Necesario para detectar nuevos miembros
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

//Importando events que no son comandos 
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
	if (file === 'youtubeNotifier.js') {
		console.log('[Index Event Loader] Skipping youtubeNotifier.js as it is loaded manually.');
		continue;
	}
	const filePath = path.join(eventsPath, file);
	const event = require(filePath);

	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args));
	} else {
		client.on(event.name, (...args) => event.execute(...args));
	}
}


//Creando collections de comandos


client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
    } else {
      console.warn(`[WARNING] El comando en ${filePath} no tiene "data" o "execute".`);
    }
  }
}

// Comandos de interacción (ej: /ping)
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`Comando ${interaction.commandName} no encontrado.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    const errorMessage = { content: '¡Ocurrió un error al ejecutar este comando!', ephemeral: true };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

// Evento: el bot está listo
client.once(Events.ClientReady, readyClient => {
  console.log(`✅ Bot iniciado como ${readyClient.user.tag}`);
  youtubeNotifier(readyClient);
});

// Evento: Mensaje creado (para sistema de niveles)
client.on(Events.MessageCreate, async message => {
  // Ya se maneja en handleMessageForXP, pero una comprobación temprana no hace daño.
  if (message.author.bot) return; 

  try {
    const updatedUserData = await handleMessageForXP(message);
    if (updatedUserData) {
      const finalUserData = await checkAndHandleLevelUp(message, updatedUserData);
      if (finalUserData && message.member) { // Ensure finalUserData is not null and member exists
        await handleRoleRewards(message.member, finalUserData);
      } else if (!message.member) {
        console.warn(`[Index] message.member is null for user ${message.author.id} in guild ${message.guildId}. Cannot process role rewards.`);
      }
    }
  } catch (error) {
    console.error('[Index] Error processing message for XP, Level Up, or Role Rewards:', error);
  }
});

const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("El bot está vivo.");
});

app.listen(3000, () => {
  console.log("Servidor HTTP escuchando en el puerto 3000");
});


// Iniciar sesión con el token del bot
client.login(token);

