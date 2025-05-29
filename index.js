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

// Comandos de interacción (ej: /ping) & Button Handling
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js'); // For button handler replies
// It's better to get AudioPlayerStatus from @discordjs/voice directly if needed in index.js
const { AudioPlayerStatus: VoiceAudioPlayerStatus } = require('@discordjs/voice'); 
const playModule = require('./commands/voice/play.js'); 
const queueCommand = require('./commands/voice/queue.js');
// We don't need to require skip and stop commands here if their logic is simple enough to be inlined
// or if we call functions exported from playModule that cover their effects.

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`Comando ${interaction.commandName} no encontrado.`);
      const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setTitle('Error de Comando').setDescription(`Comando "${interaction.commandName}" no encontrado.`);
      return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error ejecutando ${interaction.commandName}:`,error);
      const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setTitle('Error de Comando').setDescription('¡Ocurrió un error al ejecutar este comando!');
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  } else if (interaction.isButton()) {
    const customId = interaction.customId;
    const guildId = interaction.guildId;

    const player = playModule.guildPlayers.get(guildId);
    const queueData = playModule.guildQueues.get(guildId); 

    try {
      if (!player || !queueData) {
        // Defer update before replying ephemerally if no player/queue
        if (!interaction.deferred) await interaction.deferUpdate().catch(console.warn);
        await interaction.followUp({ content: 'No hay un reproductor de música activo o cola para este servidor.', ephemeral: true });
        return;
      }
      
      // Defer update to acknowledge the button press immediately
      if (!interaction.deferred) await interaction.deferUpdate().catch(console.warn);

      let feedbackMessage = '';

      if (customId === 'music_pause_resume') {
        if (player.state.status === VoiceAudioPlayerStatus.Playing) {
          if (playModule.pauseTrack(guildId)) {
            feedbackMessage = '⏸️ Música pausada.';
            if (queueData.nowPlayingMessage) {
                const currentEmbed = queueData.nowPlayingMessage.embeds[0];
                const newEmbed = EmbedBuilder.from(currentEmbed).setFooter({ text: (currentEmbed.footer?.text || '').replace(' (Pausado)', '') + ' (Pausado)' });
                const newRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder().setCustomId('music_pause_resume').setLabel('Reanudar').setStyle(ButtonStyle.Success).setEmoji('▶️'),
                        new ButtonBuilder().setCustomId('music_skip').setLabel('Saltar').setStyle(ButtonStyle.Primary).setEmoji('⏭️'),
                        new ButtonBuilder().setCustomId('music_stop').setLabel('Detener').setStyle(ButtonStyle.Danger).setEmoji('⏹️'),
                        new ButtonBuilder().setCustomId('music_view_queue').setLabel('Ver Cola').setStyle(ButtonStyle.Secondary).setEmoji('🎶')
                    );
                queueData.nowPlayingMessage.edit({ embeds: [newEmbed], components: [newRow] }).catch(console.warn);
            }
          } else { feedbackMessage = 'No se pudo pausar.'; }
        } else if (player.state.status === VoiceAudioPlayerStatus.Paused) {
          if (playModule.resumeTrack(guildId)) {
            feedbackMessage = '▶️ Música reanudada.';
             if (queueData.nowPlayingMessage) {
                const currentEmbed = queueData.nowPlayingMessage.embeds[0];
                const newEmbed = EmbedBuilder.from(currentEmbed).setFooter({ text: (currentEmbed.footer?.text || '').replace(' (Pausado)', '') });
                const newRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder().setCustomId('music_pause_resume').setLabel('Pausa').setStyle(ButtonStyle.Secondary).setEmoji('⏸️'),
                        new ButtonBuilder().setCustomId('music_skip').setLabel('Saltar').setStyle(ButtonStyle.Primary).setEmoji('⏭️'),
                        new ButtonBuilder().setCustomId('music_stop').setLabel('Detener').setStyle(ButtonStyle.Danger).setEmoji('⏹️'),
                        new ButtonBuilder().setCustomId('music_view_queue').setLabel('Ver Cola').setStyle(ButtonStyle.Secondary).setEmoji('🎶')
                    );
                queueData.nowPlayingMessage.edit({ embeds: [newEmbed], components: [newRow] }).catch(console.warn);
            }
          } else { feedbackMessage = 'No se pudo reanudar.'; }
        } else {
          feedbackMessage = 'No hay música reproduciéndose o pausada para esta acción.';
        }
        await interaction.followUp({ content: feedbackMessage, ephemeral: true });

      } else if (customId === 'music_skip') {
        if (player.state.status === VoiceAudioPlayerStatus.Idle && queueData.tracks.length === 0) {
          await interaction.followUp({ content: 'No hay nada reproduciendo para saltar.', ephemeral: true });
          return;
        }
        player.stop(); // Triggers Idle, then playNextInQueue which sends new "Now Playing"
        await interaction.followUp({ content: '⏭️ Canción saltada.', ephemeral: true });

      } else if (customId === 'music_stop') {
        player.stop(true); // Stop the player entirely
        queueData.tracks = []; // Clear the queue
        queueData.currentTrack = null; // Clear current track info
        if (queueData.nowPlayingMessage) {
            // Delete the "Now Playing" message as music has stopped.
            queueData.nowPlayingMessage.delete().catch(err => console.warn("Failed to delete NP message on button stop:", err.message));
            queueData.nowPlayingMessage = null;
        }
        await interaction.followUp({ content: '⏹️ Música detenida y cola limpiada.', ephemeral: true });
        // Optionally, you could make the bot leave the voice channel here after a timeout or directly.
        // const connection = getVoiceConnection(guildId);
        // if (connection) connection.destroy();

      } else if (customId === 'music_view_queue') {
        // queueCommand.execute expects a full interaction object.
        // The button interaction object should work.
        await queueCommand.execute(interaction); 
      } else {
        await interaction.followUp({ content: 'Botón desconocido.', ephemeral: true });
      }
    } catch (e) {
        console.error("Error handling button interaction:", e);
        await interaction.followUp({ content: 'Hubo un error procesando esta acción.', ephemeral: true });
    }
  }
});

// Evento: el bot está listo
client.once(Events.ClientReady, async readyClient => { // Made async
  console.log(`✅ Bot iniciado como ${readyClient.user.tag}`);
  youtubeNotifier(readyClient);

  // Initialize Spotify Service
  const { initializeSpotifyClient } = require('./spotifyService.js'); // Path to your spotifyService.js
  try {
    const spotifyInitialized = await initializeSpotifyClient();
    if (spotifyInitialized) {
      console.log('[Main] Spotify Service and Play-DL Spotify support initialized successfully.');
    } else {
      console.warn('[Main] Spotify Service or Play-DL Spotify support failed to initialize. Spotify features may be limited.');
    }
  } catch (error) {
    console.error('[Main] Error during Spotify initialization:', error);
  }
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

