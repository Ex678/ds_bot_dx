const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
    queueData.currentTrack = null; // Ensure current track is cleared
    if (queueData.nowPlayingMessage) { // Delete old now playing message if queue is now empty
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
        await interaction.deferReply().catch(console.warn); // Catch if defer fails (e.g. interaction already gone)
    }

    const userVoiceChannel = interaction.member.voice.channel;
    if (!userVoiceChannel) {
      const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription('Debes estar en un canal de voz para usar este comando.');
      // Use followUp if deferred, editReply otherwise.
      if (interaction.deferred || interaction.replied) await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(console.warn);
      else await interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(console.warn);
      return;
    }

    let connection = getVoiceConnection(interaction.guild.id);
    let player = guildPlayers.get(interaction.guild.id);
    let queueData = guildQueues.get(interaction.guild.id);

    if (!connection) {
      if (!userVoiceChannel.joinable) {
          const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription('No tengo permisos para unirme a tu canal de voz.');
          if (interaction.deferred || interaction.replied) await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(console.warn);
          else await interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(console.warn);
          return;
      }
      // Check speak permission before joining
      if (!userVoiceChannel.speakable && userVoiceChannel.type !== 'GUILD_STAGE_VOICE') { // Stage voice channels have different permission model for speaking (request to speak)
        const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription('No tengo permisos para hablar en tu canal de voz.');
        if (interaction.deferred || interaction.replied) await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(console.warn);
        else await interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(console.warn);
        return;
      }
      try {
        console.log(`[Play Command] Attempting to join voice channel: ${userVoiceChannel.name}`);
        connection = joinVoiceChannel({
          channelId: userVoiceChannel.id,
          guildId: interaction.guild.id,
          adapterCreator: interaction.guild.voiceAdapterCreator,
          selfDeaf: true,
        });
        // Add a Disconnected listener specifically for new connections during /play
        connection.once(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
            // Check if it's a recoverable disconnect or if the connection was destroyed by user/another command
            if (newState.status === VoiceConnectionStatus.Disconnected && 
                newState.reason !== undefined && // VoiceConnectionDisconnectReason might be imported for specific reasons
                connection.state.status !== VoiceConnectionStatus.Destroyed) {
                try {
                    console.warn(`[Play Command Connection] Voice Connection for ${interaction.guild.id} was disconnected. Attempting to reconnect...`);
                    await entersState(connection, VoiceConnectionStatus.Connecting, 5_000); // Try to connect again
                    await entersState(connection, VoiceConnectionStatus.Ready, 10_000); // Wait for ready
                    console.log(`[Play Command Connection] Voice Connection for ${interaction.guild.id} reconnected.`);
                } catch (e) {
                    console.error(`[Play Command Connection] Voice Connection for ${interaction.guild.id} failed to reconnect after disconnect:`, e);
                    connection.destroy(); // Destroy if reconnect fails
                }
            }
        });
        await entersState(connection, VoiceConnectionStatus.Ready, 20_000); // Reduced timeout
        console.log(`[Play Command] Successfully joined voice channel: ${userVoiceChannel.name}`);
      } catch (error) {
        console.error(`[Play Command] Error joining voice channel: ${error.message}`, error);
        if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
            connection.destroy();
        }
        const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription('No me pude conectar a tu canal de voz. Verifica mis permisos y que el canal sea accesible.');
        if (interaction.deferred || interaction.replied) await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(console.warn);
        else await interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(console.warn);
        return;
      }
    } else if (connection.joinConfig.channelId !== userVoiceChannel.id) {
      const errorEmbed = new EmbedBuilder().setColor(0xFFCC00).setDescription('Estoy en otro canal de voz. Por favor, únete a mi canal o usa `/leave` primero para que pueda unirme al tuyo.');
      if (interaction.deferred || interaction.replied) await interaction.followUp({ embeds: [errorEmbed], ephemeral: true }).catch(console.warn);
      else await interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(console.warn);
      return;
    }

    if (!player) {
      player = createAudioPlayer();
      guildPlayers.set(interaction.guild.id, player);
      connection.subscribe(player);

      if (!guildQueues.has(interaction.guild.id)) {
        guildQueues.set(interaction.guild.id, { tracks: [], lastInteractionChannel: interaction.channel, nowPlayingMessage: null, currentTrack: null });
      }
      queueData = guildQueues.get(interaction.guild.id);

      player.on(AudioPlayerStatus.Idle, () => {
        console.log(`[AudioPlayer ${interaction.guild.id}] Player is idle.`);
        const currentQueueData = guildQueues.get(interaction.guild.id);
        // currentQueueData.currentTrack = null; // Already set to null before calling playNextInQueue or after error in it
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
      
      connection.on(VoiceConnectionStatus.Destroyed, () => {
        console.log(`[VoiceConnection ${interaction.guild.id}] Connection destroyed. Cleaning up player and queue.`);
        if (player) {
          player.stop(true);
          guildPlayers.delete(interaction.guild.id);
        }
        const qData = guildQueues.get(interaction.guild.id);
        if (qData?.nowPlayingMessage) {
            qData.nowPlayingMessage.delete().catch(err => console.warn("Failed to delete NP message on Destroy:", err.message));
        }
        guildQueues.delete(interaction.guild.id);
      });
    }
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
        if (!interaction.replied) await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x0099FF).setDescription('Procesando playlist de Spotify... Esto puede tardar un momento.')] });
        
        const playlist = await playdl.playlist_info(query, { incomplete: true });
        if (!playlist || !playlist.videos || playlist.videos.length === 0) { // play-dl v2 uses playlist.videos
          const errorEmbed = new EmbedBuilder().setColor(0xFFCC00).setDescription('No se pudo obtener información de la playlist de Spotify o está vacía.');
          await interaction.editReply({ embeds: [errorEmbed] });
          return;
        }

        const tracksToAdd = [];
        for (const trackInfo of playlist.videos) { // play-dl v2 uses playlist.videos which are already somewhat processed
            tracksToAdd.push({
                url: trackInfo.url, // This should be the YouTube URL play-dl found
                title: trackInfo.title || 'Título Desconocido',
                duration: trackInfo.durationFormatted || trackInfo.durationRaw || 'N/A', // durationRaw might be in seconds
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
        
        // Use followup if initial reply was 'Procesando...'
        await interaction.followUp({ embeds: [playlistAddedEmbed] });


      } else { // Single track logic
        console.log(`[Play Command] Searching for single query: "${query}"`);
        const searchResults = await playdl.search(query, { limit: 1, source : { youtube : 'video' } }); 

        if (!searchResults || searchResults.length === 0) {
          const errorEmbed = new EmbedBuilder().setColor(0xFFCC00).setDescription('No se encontraron resultados para tu búsqueda.');
          await interaction.editReply({ embeds: [errorEmbed] });
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

        if (!wasPlayerIdle) { // If player was already playing, just confirm song added
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
            await interaction.editReply({ embeds: [queueEmbed] });
        } else {
            // If player was idle, playNextInQueue will be called and handle the "Now Playing" message.
            // We might just editReply with a simple confirmation here, or let playNextInQueue handle it.
            // For consistency, let playNextInQueue handle the "Now Playing" message.
            // The deferReply will be fulfilled by the "Now Playing" embed from playNextInQueue.
            // However, if the interaction was already replied to (e.g. "Procesando playlist"), this won't work.
            // This path is for single tracks when player was idle.
            // interaction.editReply might have already been used by "Procesando playlist" if it was a playlist.
            // This specific editReply for single track when idle might not be needed if playNextInQueue sends the message.
            // Let's send a minimal confirmation, playNextInQueue will send the full "Now Playing"
            const simpleAddEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setDescription(`Añadido a la cola: **${track.title}**. Empezando reproducción...`);
            await interaction.editReply({ embeds: [simpleAddEmbed] });
        }
      }

      if (wasPlayerIdle) {
        playNextInQueue(interaction.guild.id, interaction.channel);
      }

    } catch (error) {
      console.error(`[Play Command] Error processing query "${query}": ${error.message}`, error);
      const errorEmbed = new EmbedBuilder().setColor(0xFF0000);
      if (error.message.toLowerCase().includes('authorization') || error.message.toLowerCase().includes('spotify api error')) {
          errorEmbed.setDescription('Error de autorización con Spotify. Asegúrate de que las credenciales están bien configuradas.');
      } else if (error.message.toLowerCase().includes('no results found') || error.message.toLowerCase().includes('could not find any video')) {
          errorEmbed.setDescription('No se encontraron resultados para tu búsqueda o no se pudo extraer el video.');
      } else if (error.message.toLowerCase().includes('playlist is private or not found')) {
          errorEmbed.setDescription('La playlist de Spotify es privada o no se encontró.');
      }
      else {
        errorEmbed.setDescription('Ocurrió un error al intentar procesar tu solicitud.');
      }
      
      if (interaction.replied || interaction.deferred) { // Use followUp if already replied/deferred
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
