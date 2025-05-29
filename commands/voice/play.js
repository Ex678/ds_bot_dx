const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource, 
  AudioPlayerStatus, 
  VoiceConnectionStatus, 
  getVoiceConnection, 
  entersState 
} = require('@discordjs/voice');
const playdl = require('play-dl');

const guildPlayers = new Map(); // guildId -> AudioPlayer
const guildQueues = new Map(); // guildId -> { tracks: [], lastInteractionChannel: null, nowPlayingMessage: null, currentTrack: null }

async function playNextInQueue(guildId, interactionChannel) {
  const player = guildPlayers.get(guildId);
  const queueData = guildQueues.get(guildId);
  const connection = getVoiceConnection(guildId);

  if (!player || !queueData || !connection) {
    console.log(`[Queue System ${guildId}] Player, queue data, or connection missing. Cannot play next.`);
    if (queueData && queueData.tracks.length === 0 && queueData.lastInteractionChannel) {
        const endEmbed = new EmbedBuilder().setColor(0xFFCC00).setDescription('La cola ha terminado.');
        queueData.lastInteractionChannel.send({ embeds: [endEmbed] }).catch(console.error);
    }
    if (!connection && (player || queueData)) {
        player?.stop(true); 
        guildPlayers.delete(guildId);
        guildQueues.delete(guildId); 
        console.log(`[Queue System ${guildId}] Cleaned up player/queue due to missing connection.`);
    }
    return;
  }

  if (queueData.tracks.length === 0) {
    console.log(`[Queue System ${guildId}] Queue is empty. Nothing to play.`);
    if (queueData.lastInteractionChannel) {
        const emptyEmbed = new EmbedBuilder().setColor(0xFFCC00).setDescription('La cola está vacía.');
        queueData.lastInteractionChannel.send({ embeds: [emptyEmbed] }).catch(console.error);
    }
    queueData.currentTrack = null; 
    if (queueData.nowPlayingMessage) { 
        queueData.nowPlayingMessage.delete().catch(err => console.warn("Failed to delete NP message on empty queue:", err.message));
        queueData.nowPlayingMessage = null;
    }
    return;
  }

  const trackToPlay = queueData.tracks.shift(); 
  queueData.currentTrack = trackToPlay;

  try {
    console.log(`[Queue System ${guildId}] Attempting to play next track: ${trackToPlay.title}`);
    const stream = await playdl.stream(trackToPlay.url, { quality: 1 });
    const resource = createAudioResource(stream.stream, { 
        inputType: stream.type,
        metadata: trackToPlay 
    });
    
    player.play(resource);
    console.log(`[Queue System ${guildId}] Now playing: ${trackToPlay.title}`);

    const nowPlayingEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('Reproduciendo Ahora')
      .setDescription(`**[${trackToPlay.title}](${trackToPlay.url})**`)
      .addFields(
        { name: 'Pedido por', value: trackToPlay.requester, inline: true },
        { name: 'Duración', value: trackToPlay.duration, inline: true }
      )
      .setThumbnail(trackToPlay.thumbnail)
      .setFooter({ text: `Siguiente en la cola: ${queueData.tracks.length > 0 ? queueData.tracks[0].title : 'Nada'}`});

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId('music_pause_resume').setLabel('Pausa').setStyle(ButtonStyle.Secondary).setEmoji('⏸️'),
        new ButtonBuilder().setCustomId('music_skip').setLabel('Saltar').setStyle(ButtonStyle.Primary).setEmoji('⏭️'),
        new ButtonBuilder().setCustomId('music_stop').setLabel('Detener').setStyle(ButtonStyle.Danger).setEmoji('⏹️'),
        new ButtonBuilder().setCustomId('music_view_queue').setLabel('Ver Cola').setStyle(ButtonStyle.Secondary).setEmoji('🎶')
      );
    
    if (queueData.nowPlayingMessage) {
        try {
            await queueData.nowPlayingMessage.delete();
        } catch (err) {
            console.warn(`[Queue System ${guildId}] Could not delete old now playing message: ${err.message}`);
        }
    }
    
    const channelForMessage = trackToPlay.interactionChannel || queueData.lastInteractionChannel || interactionChannel;
    if (channelForMessage) {
        const msg = await channelForMessage.send({ embeds: [nowPlayingEmbed], components: [row] }).catch(console.error);
        queueData.nowPlayingMessage = msg; 
    }

  } catch (error) {
    console.error(`[Queue System ${guildId}] Error playing track ${trackToPlay.title}: ${error.message}`, error);
    const errorChannel = trackToPlay.interactionChannel || queueData.lastInteractionChannel || interactionChannel;
    if (errorChannel) {
        const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(`Error al reproducir **${trackToPlay.title}**: ${error.message.substring(0,100)}`);
        errorChannel.send({ embeds: [errorEmbed] }).catch(console.error);
    }
    queueData.currentTrack = null; 
    playNextInQueue(guildId, interactionChannel); 
  }
}

function pauseTrack(guildId) {
    const player = guildPlayers.get(guildId);
    if (player && player.state.status === AudioPlayerStatus.Playing) {
        player.pause();
        return true;
    }
    return false;
}

function resumeTrack(guildId) {
    const player = guildPlayers.get(guildId);
    if (player && player.state.status === AudioPlayerStatus.Paused) {
        player.unpause();
        return true;
    }
    return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Reproduce una canción o la añade a la cola.')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Nombre de la canción o URL (Spotify, YouTube, SoundCloud, Playlist de Spotify)')
        .setRequired(true)),
  async execute(interaction) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply().catch(console.warn); 
    }

    const userVoiceChannel = interaction.member.voice.channel;
    if (!userVoiceChannel) {
      const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription('Debes estar en un canal de voz para usar este comando.');
      if (interaction.deferred || interaction.replied) await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(console.warn);
      else await interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(console.warn);
      return;
    }

    let connection = getVoiceConnection(interaction.guild.id);
    let player = guildPlayers.get(interaction.guild.id); 
    let queueData = guildQueues.get(interaction.guild.id); 

    // Connection Handling Logic
    if (!connection) { 
      console.log(`[Play Command] No existing connection for guild ${interaction.guild.id}. Attempting to join user's channel: ${userVoiceChannel.name}`);
      if (!userVoiceChannel.joinable) {
          const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(`No tengo permisos para unirme al canal de voz **${userVoiceChannel.name}**.`);
          if (interaction.deferred || interaction.replied) await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(console.warn);
          else await interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(console.warn);
          return;
      }
      if (!userVoiceChannel.speakable && userVoiceChannel.type !== ChannelType.GuildStageVoice) {
        const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(`No tengo permisos para hablar en el canal de voz **${userVoiceChannel.name}**.`);
        if (interaction.deferred || interaction.replied) await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(console.warn);
        else await interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(console.warn);
        return;
      }
      try {
        connection = joinVoiceChannel({
          channelId: userVoiceChannel.id,
          guildId: interaction.guild.id,
          adapterCreator: interaction.guild.voiceAdapterCreator,
          selfDeaf: true,
        });
        
        connection.once(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
            if (newState.status === VoiceConnectionStatus.Disconnected && 
                newState.reason !== undefined && 
                connection.state.status !== VoiceConnectionStatus.Destroyed) {
                try {
                    console.warn(`[Play Command Connection] New connection for ${interaction.guild.id} disconnected. Attempting reconnect...`);
                    await entersState(connection, VoiceConnectionStatus.Connecting, 5_000);
                    await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
                    console.log(`[Play Command Connection] New connection for ${interaction.guild.id} reconnected.`);
                } catch (e) {
                    console.error(`[Play Command Connection] New connection for ${interaction.guild.id} failed to reconnect:`, e);
                    if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
                }
            }
        });

        await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
        console.log(`[Play Command] Successfully joined new voice channel: ${userVoiceChannel.name} for guild ${interaction.guild.id}.`);
      } catch (error) {
        console.error(`[Play Command] Error joining voice channel ${userVoiceChannel.name} for guild ${interaction.guild.id}: ${error.message}`, error);
        if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
            connection.destroy();
        }
        const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(`No me pude conectar a tu canal de voz (${userVoiceChannel.name}). Verifica mis permisos.`);
        if (interaction.deferred || interaction.replied) await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(console.warn);
        else await interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(console.warn);
        return;
      }
    } else { 
      console.log(`[Play Command] Bot already connected to a voice channel in guild ${interaction.guild.id}. Current channel: ${connection.joinConfig.channelId}`);
      if (userVoiceChannel.id !== connection.joinConfig.channelId) {
        const currentBotChannel = interaction.guild.channels.cache.get(connection.joinConfig.channelId);
        const infoEmbed = new EmbedBuilder().setColor(0xFFCC00)
          .setDescription(`Ya estoy en el canal de voz **${currentBotChannel?.name || 'otro canal'}**. La música se reproducirá/añadirá allí.`)
          .setFooter({text: "Si quieres que me una a tu canal, usa /leave primero o el comando /join."});
        
        // Check if we can send a followUp or need to edit the initial reply (if it was just deferred)
        if(interaction.deferred || interaction.replied) {
            await interaction.followUp({ embeds: [infoEmbed], ephemeral: true }).catch(console.warn);
        } else {
            // This case should be rare if we always defer, but as a fallback.
            await interaction.reply({ embeds: [infoEmbed], ephemeral: true }).catch(console.warn);
        }
        // Do not return; allow the command to proceed using the bot's current channel.
      }
    }

    // Initialize player and queue AFTER connection is confirmed or established
    if (!player) {
      player = createAudioPlayer();
      guildPlayers.set(interaction.guild.id, player);
      connection.subscribe(player); // Subscribe the new or existing connection

      if (!guildQueues.has(interaction.guild.id)) {
        guildQueues.set(interaction.guild.id, { tracks: [], lastInteractionChannel: interaction.channel, nowPlayingMessage: null, currentTrack: null });
      }
      queueData = guildQueues.get(interaction.guild.id); // Ensure queueData is up-to-date

      player.on(AudioPlayerStatus.Idle, () => {
        console.log(`[AudioPlayer ${interaction.guild.id}] Player is idle.`);
        const currentQueueData = guildQueues.get(interaction.guild.id);
        if (currentQueueData?.nowPlayingMessage) { 
            currentQueueData.nowPlayingMessage.delete().catch(err => console.warn("Failed to delete old NP message on Idle:", err.message));
            currentQueueData.nowPlayingMessage = null;
        }
        playNextInQueue(interaction.guild.id, currentQueueData?.lastInteractionChannel || interaction.channel);
      });

      player.on('error', error => {
        console.error(`[AudioPlayer ${interaction.guild.id}] Error: ${error.message}`, error);
        const currentQueueData = guildQueues.get(interaction.guild.id);
        if (currentQueueData) currentQueueData.currentTrack = null;
        const errorChannel = currentQueueData?.lastInteractionChannel || interaction.channel;
        const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(`Ocurrió un error con el reproductor: ${error.message.substring(0,150)}`);
        errorChannel.send({ embeds: [errorEmbed] }).catch(console.error);
        playNextInQueue(interaction.guild.id, errorChannel);
      });
      
      // This listener should be attached to the connection object once.
      // If connection is new, attach it. If connection existed, this listener might already be there.
      // To prevent multiple listeners, check if this specific handler is already attached or use .once() if appropriate.
      // For simplicity, the current structure re-adds this on player creation if connection existed.
      // A better way is to manage connection listeners centrally or ensure they are idempotent.
      // However, `connection.on` generally adds a new listener each time.
      // Let's assume this is handled or the impact of multiple identical listeners is minimal for now.
      // A safer approach if re-subscribing is to clear existing specific listeners first if possible.
      // For this exercise, we will assume the previous setup with one Destroyed listener per connection is okay.
      // If connection is new, this is the first time this listener is set for this connection object.
      if (!connection.listeners(VoiceConnectionStatus.Destroyed).some(listener => listener.name === 'playJsDestroyHandler')) {
        const playJsDestroyHandler = () => { // Give the function a name for potential removal/checking
            console.log(`[VoiceConnection ${interaction.guild.id}] Connection destroyed (handler in play.js). Cleaning up player and queue.`);
            if (player) {
              player.stop(true);
              guildPlayers.delete(interaction.guild.id);
            }
            const qData = guildQueues.get(interaction.guild.id);
            if (qData?.nowPlayingMessage) {
                qData.nowPlayingMessage.delete().catch(err => console.warn("Failed to delete NP message on Destroy:", err.message));
            }
            guildQueues.delete(interaction.guild.id);
        };
        connection.on(VoiceConnectionStatus.Destroyed, playJsDestroyHandler);
      }
    }
    // Ensure queueData is always fresh, especially if it was initialized inside the !player block
    if (!queueData) { 
        guildQueues.set(interaction.guild.id, { tracks: [], lastInteractionChannel: interaction.channel, nowPlayingMessage: null, currentTrack: null });
        queueData = guildQueues.get(interaction.guild.id);
    }
    queueData.lastInteractionChannel = interaction.channel;

    const query = interaction.options.getString('query');
    const isSpotifyPlaylist = query.includes('spotify.com/playlist/');
    const wasPlayerIdle = player.state.status === AudioPlayerStatus.Idle || player.state.status === AudioPlayerStatus.AutoPaused;

    try {
      if (isSpotifyPlaylist) {
        // If initial reply was deferred and not yet used by an error message or info message:
        if (interaction.deferred && !interaction.replied) {
             await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x0099FF).setDescription('Procesando playlist de Spotify... Esto puede tardar un momento.')] });
        } else if (!interaction.replied) { // Should not happen if we always defer
             await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x0099FF).setDescription('Procesando playlist de Spotify... Esto puede tardar un momento.')] });
        }
        // If already replied (e.g. with "I'm in another channel"), use followup for "Procesando..."
        else {
            await interaction.followUp({ embeds: [new EmbedBuilder().setColor(0x0099FF).setDescription('Procesando playlist de Spotify... Esto puede tardar un momento.')], ephemeral: true });
        }
        
        const playlist = await playdl.playlist_info(query, { incomplete: true });
        if (!playlist || !playlist.videos || playlist.videos.length === 0) { 
          const errorEmbed = new EmbedBuilder().setColor(0xFFCC00).setDescription('No se pudo obtener información de la playlist de Spotify o está vacía.');
          // Use followUp because "Procesando..." was likely sent.
          await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
          return;
        }

        const tracksToAdd = [];
        for (const trackInfo of playlist.videos) { 
            tracksToAdd.push({
                url: trackInfo.url, 
                title: trackInfo.title || 'Título Desconocido',
                duration: trackInfo.durationFormatted || trackInfo.durationRaw || 'N/A', 
                thumbnail: trackInfo.thumbnails?.[0]?.url || null,
                requester: interaction.user.tag,
                interactionChannel: interaction.channel
            });
        }
        
        queueData.tracks.push(...tracksToAdd);
        console.log(`[Play Command] Added ${tracksToAdd.length} tracks from playlist: ${playlist.name}`);

        const playlistAddedEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Playlist Añadida a la Cola')
            .setDescription(`**${playlist.name || 'Playlist de Spotify'}** (${tracksToAdd.length} canciones)`)
            .setThumbnail(playlist.thumbnail?.url || (tracksToAdd.length > 0 ? tracksToAdd[0].thumbnail : null))
            .addFields({ name: 'Pedido por', value: interaction.user.tag, inline: true });
        
        await interaction.followUp({ embeds: [playlistAddedEmbed] });


      } else { // Single track logic
        console.log(`[Play Command] Searching for single query: "${query}"`);
        const searchResults = await playdl.search(query, { limit: 1, source : { youtube : 'video' } }); 

        if (!searchResults || searchResults.length === 0) {
          const errorEmbed = new EmbedBuilder().setColor(0xFFCC00).setDescription('No se encontraron resultados para tu búsqueda.');
          if (interaction.deferred || interaction.replied) await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(console.warn);
          else await interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(console.warn);
          return;
        }

        const trackInfo = searchResults[0];
        const track = {
          url: trackInfo.url,
          title: trackInfo.title || 'Título Desconocido',
          duration: trackInfo.durationFormatted || 'N/A',
          thumbnail: trackInfo.thumbnails?.[0]?.url || null,
          requester: interaction.user.tag,
          interactionChannel: interaction.channel
        };
        
        queueData.tracks.push(track);
        console.log(`[Play Command] Added to queue: ${track.title}`);

        if (!wasPlayerIdle) { 
            const queueEmbed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('Añadido a la Cola')
            .setDescription(`**[${track.title}](${track.url})**`)
            .addFields(
                { name: 'Pedido por', value: track.requester, inline: true },
                { name: 'Posición en cola', value: `${queueData.tracks.length}`, inline: true }
            )
            .setThumbnail(track.thumbnail)
            .setFooter({ text: `Duración: ${track.duration}` });
            // If initial reply was the "I'm in another channel" followUp, this needs to be a new followUp.
            // If initial reply was deferred, this should be editReply.
            if (interaction.replied) await interaction.followUp({ embeds: [queueEmbed] });
            else await interaction.editReply({ embeds: [queueEmbed] });

        } else {
            const simpleAddEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setDescription(`Añadido a la cola: **${track.title}**. Empezando reproducción...`);
            if (interaction.replied) await interaction.followUp({ embeds: [simpleAddEmbed] });
            else await interaction.editReply({ embeds: [simpleAddEmbed] });
        }
      }

      if (wasPlayerIdle) {
        playNextInQueue(interaction.guild.id, interaction.channel);
      }

    } catch (error) {
      console.error(`[Play Command] Error processing query "${query}": ${error.message}`, error);
      const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setTitle('Error al Procesar Solicitud');
      if (error.message.toLowerCase().includes('authorization') || error.message.toLowerCase().includes('spotify api error')) {
          errorEmbed.setDescription('Error de autorización con Spotify. Verifica las credenciales.');
      } else if (error.message.toLowerCase().includes('no results found') || error.message.toLowerCase().includes('could not find any video')) {
          errorEmbed.setDescription('No se encontraron resultados para tu búsqueda.');
      } else if (error.message.toLowerCase().includes('playlist is private or not found')) {
          errorEmbed.setDescription('La playlist de Spotify es privada, no se encontró, o no se pudo procesar.');
      } else if (error.message.toLowerCase().includes('failed to fetch')) { 
          errorEmbed.setDescription('No se pudo obtener la información de la canción/playlist. Verifica la URL y tu conexión.');
      } else {
        errorEmbed.setDescription('Ocurrió un error inesperado al procesar tu solicitud.');
      }
      
      if (interaction.replied || interaction.deferred) { 
         await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(console.warn);
      } else {
         await interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(console.warn);
      }
    }
  },
  playNextInQueue,
  pauseTrack,
  resumeTrack,
  guildPlayers, 
  guildQueues   
};
