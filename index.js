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
    GatewayIntentBits.GuildVoiceStates
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
      console.error(`Error ejecutando ${interaction.commandName}:`, error);
      
      // No intentar responder si el error es de interacción desconocida o ya reconocida
      if (error.code !== 10062 && error.code !== 40060) {
        const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setTitle('Error de Comando').setDescription('¡Ocurrió un error al ejecutar este comando!');
        
        try {
          // Si la interacción está diferida pero no respondida completamente
          if (!interaction.replied && interaction.deferred) {
            await interaction.editReply({ embeds: [errorEmbed] });
          } 
          // Si la interacción ya ha recibido una respuesta completa
          else if (interaction.replied) {
            await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
          } 
          // Si la interacción aún no ha sido reconocida
          else {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
          }
        } catch (followupError) {
          // Si falla intentando responder, solo registramos el error
          console.error(`No se pudo enviar respuesta de error para el comando ${interaction.commandName}:`, followupError);
        }
      }
    }
  } else if (interaction.isButton()) {
    const customId = interaction.customId;
    const guildId = interaction.guildId;

    const player = playModule.guildPlayers.get(guildId);
    const queueData = playModule.guildQueues.get(guildId); 

    try {
      if (!player || !queueData) {
        if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(e => console.error(`[Interaction Error] Failed to deferUpdate for interaction ${interaction.id} (no player/queue): ${e.message}`, e));
        try { await interaction.followUp({ content: 'No hay un reproductor de música activo o cola para este servidor.', ephemeral: true }); } catch (e) { console.error(`[Interaction Error] Failed to followUp for interaction ${interaction.id} (no player/queue): ${e.message}`, e); }
        return;
      }
      
      if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(e => console.error(`[Interaction Error] Failed to deferUpdate for interaction ${interaction.id}: ${e.message}`, e));

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
                try { await queueData.nowPlayingMessage.edit({ embeds: [newEmbed], components: [newRow] }); } catch (e) { console.warn(`[Interaction Error] Failed to edit nowPlayingMessage for ${interaction.id} (pause): ${e.message}`, e); }
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
                try { await queueData.nowPlayingMessage.edit({ embeds: [newEmbed], components: [newRow] }); } catch (e) { console.warn(`[Interaction Error] Failed to edit nowPlayingMessage for ${interaction.id} (resume): ${e.message}`, e); }
            }
          } else { feedbackMessage = 'No se pudo reanudar.'; }
        } else {
          feedbackMessage = 'No hay música reproduciéndose o pausada para esta acción.';
        }
        try { await interaction.followUp({ content: feedbackMessage, ephemeral: true }); } catch (e) { console.error(`[Interaction Error] Failed to followUp for interaction ${interaction.id} (pause/resume feedback): ${e.message}`, e); }

      } else if (customId === 'music_skip') {
        if (player.state.status === VoiceAudioPlayerStatus.Idle && queueData.tracks.length === 0) {
          try { await interaction.followUp({ content: 'No hay nada reproduciendo para saltar.', ephemeral: true }); } catch (e) { console.error(`[Interaction Error] Failed to followUp for interaction ${interaction.id} (skip - nothing playing): ${e.message}`, e); }
          return;
        }
        player.stop(); 
        try { await interaction.followUp({ content: '⏭️ Canción saltada.', ephemeral: true }); } catch (e) { console.error(`[Interaction Error] Failed to followUp for interaction ${interaction.id} (skip success): ${e.message}`, e); }

      } else if (customId === 'music_stop') {
        player.stop(true); 
        queueData.tracks = []; 
        queueData.currentTrack = null; 
        if (queueData.nowPlayingMessage) {
            try { await queueData.nowPlayingMessage.delete(); } catch (err) { console.warn("Failed to delete NP message on button stop:", err.message); }
            queueData.nowPlayingMessage = null;
        }
        try { await interaction.followUp({ content: '⏹️ Música detenida y cola limpiada.', ephemeral: true }); } catch (e) { console.error(`[Interaction Error] Failed to followUp for interaction ${interaction.id} (stop success): ${e.message}`, e); }
        
      } else if (customId === 'music_view_queue') {
        // queueCommand.execute already handles its own replies and try/catch for them.
        // However, if queueCommand.execute itself throws an error before replying, it would be caught by the outer try/catch.
        await queueCommand.execute(interaction); 
      } else {
        try { await interaction.followUp({ content: 'Botón desconocido.', ephemeral: true }); } catch (e) { console.error(`[Interaction Error] Failed to followUp for interaction ${interaction.id} (unknown button): ${e.message}`, e); }
      }
    } catch (e) {
        console.error(`[Interaction Error] Error handling button interaction ${interaction.id}: ${e.message}`, e);
        // General fallback if any of the above try/catch for followUp itself fails or if an error occurs before a reply attempt.
        try {
          if (!interaction.replied && !interaction.deferred) { // Should ideally always be deferred by now
            await interaction.reply({ content: 'Hubo un error procesando esta acción.', ephemeral: true });
          } else if (!interaction.replied) { // Deferred but not yet replied with followUp
             await interaction.followUp({ content: 'Hubo un error procesando esta acción.', ephemeral: true });
          }
          // If already replied, nothing more to do here for this error.
        } catch (e2) {
            console.error(`[Interaction Error] Fallback reply failed for interaction ${interaction.id}: ${e2.message}`, e2);
        }
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

