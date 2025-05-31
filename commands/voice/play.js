const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags } = require('discord.js');
const { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource, 
  AudioPlayerStatus, 
  VoiceConnectionStatus, 
  getVoiceConnection, 
  entersState,
  StreamType
} = require('@discordjs/voice');
const playdl = require('play-dl');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');

const MAX_QUEUE_SIZE = 100; // Definir el límite máximo de la cola

// Define y crea el directorio temporal para audio
const TEMP_AUDIO_DIR = path.join(__dirname, '..', '..', 'temp_audio');

if (!fs.existsSync(TEMP_AUDIO_DIR)) {
  try {
    fs.mkdirSync(TEMP_AUDIO_DIR, { recursive: true });
    console.log(`[File System] Directorio temporal creado en: ${TEMP_AUDIO_DIR}`);
  } catch (err) {
    console.error(`[File System] Error al crear directorio temporal ${TEMP_AUDIO_DIR}:`, err);
    // Considera si el bot debe detenerse o manejar esto de otra forma si no puede crear el dir
  }
} else {
  console.log(`[File System] Directorio temporal ya existe en: ${TEMP_AUDIO_DIR}`);
}

function extractYouTubeVideoId(url) {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname === 'youtu.be') {
      return parsedUrl.pathname.slice(1).split('?')[0]; // Remove query params like ?si=...
    }
    if (parsedUrl.hostname === 'www.youtube.com' || parsedUrl.hostname === 'youtube.com') {
      if (parsedUrl.pathname === '/watch') {
        return parsedUrl.searchParams.get('v');
      }
      if (parsedUrl.pathname.startsWith('/embed/')) {
        return parsedUrl.pathname.split('/')[2].split('?')[0];
      }
      if (parsedUrl.pathname.startsWith('/v/')) {
        return parsedUrl.pathname.split('/')[2].split('?')[0];
      }
      // Handle shorts e.g. /shorts/VIDEO_ID
      if (parsedUrl.pathname.startsWith('/shorts/')) {
        return parsedUrl.pathname.split('/')[2].split('?')[0];
      }
    }
  } catch (e) {
    console.error('[Util] Error parsing YouTube URL in extractYouTubeVideoId:', e.message);
  }
  // Fallback for potentially shortened URLs or non-standard formats if primary parsing fails
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  console.warn(`[Util] Could not extract YouTube video ID from URL: ${url} using any known method.`);
  return null;
}

async function cleanupFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    try {
      await fs.promises.unlink(filePath);
      console.log(`[File Cleanup] Archivo temporal borrado: ${filePath}`);
    } catch (err) {
      console.error(`[File Cleanup] Error al borrar archivo temporal ${filePath}:`, err);
    }
  }
}

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
        try { await queueData.lastInteractionChannel.send({ embeds: [endEmbed] }); } catch (e) { console.error(`[Interaction Error] Failed to send "queue ended" message for guild ${guildId}: ${e.message}`, e); }
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
        try { await queueData.lastInteractionChannel.send({ embeds: [emptyEmbed] }); } catch (e) { console.error(`[Interaction Error] Failed to send "queue empty" message for guild ${guildId}: ${e.message}`, e); }
    }
    queueData.currentTrack = null; 
    if (queueData.nowPlayingMessage) { 
        try { await queueData.nowPlayingMessage.delete(); } catch (e) { console.warn("Failed to delete NP message on empty queue:", e.message); }
        queueData.nowPlayingMessage = null;
    }
    return;
  }

  const trackToPlay = queueData.tracks.shift(); 
  queueData.currentTrack = trackToPlay;

  try {
    // Validate the track URL before attempting to stream
    const validationResult = await playdl.validate(trackToPlay.url);
    if (validationResult === false) { // Simplified condition based on play-dl documentation for YouTube URLs
      console.error(`[Queue System ${guildId}] URL validation failed for "${trackToPlay.title}" (URL: ${trackToPlay.url}). playdl.validate() returned: ${validationResult}. Skipping track.`);
      const errorChannel = queueData?.lastInteractionChannel || trackToPlay.interactionChannel || interactionChannel;
      if (errorChannel) {
        const validationEmbed = new EmbedBuilder()
          .setColor(0xFFCC00)
          .setTitle('Error de Reproducción')
          .setDescription(`No se pudo procesar la canción **${trackToPlay.title}** (URL inválida o no soportada). Saltando a la siguiente.`);
        try {
          await errorChannel.send({ embeds: [validationEmbed] });
        } catch (e) {
          console.error(`[Interaction Error] Failed to send "validation failed" message for guild ${guildId}: ${e.message}`, e);
        }
      }
      queueData.currentTrack = null; // Clear current track as it's skipped
      playNextInQueue(guildId, interactionChannel); // Try next song
      return;
    }

    console.log(`[Queue System ${guildId}] Attempting to play next track: ${trackToPlay.title} (URL validated)`);

    let streamData; // This will hold the actual readable stream
    let streamData; // This will hold the readable stream or file path
    let streamType = StreamType.Arbitrary; // Default

    if (trackToPlay.url.includes('youtube.com/') || trackToPlay.url.includes('youtu.be/')) {
      console.log(`[Queue System ${guildId}] Identified YouTube URL for ${trackToPlay.title}. Attempting to download with ytdl-core.`);

      const videoId = extractYouTubeVideoId(trackToPlay.url);
      if (!videoId) {
        console.error(`[Queue System ${guildId}] Could not extract video ID from YouTube URL: ${trackToPlay.url}`);
        const errorChannel = queueData?.lastInteractionChannel || trackToPlay.interactionChannel || interactionChannel;
        if (errorChannel) {
            const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(`No se pudo extraer el ID del video de YouTube para **${trackToPlay.title}**. Saltando.`);
            try { await errorChannel.send({ embeds: [errorEmbed] }); } catch (e) { console.error(`[Interaction Error] Failed to send "extract video ID error" message for guild ${guildId}: ${e.message}`, e); }
        }
        if(queueData) queueData.currentTrack = null;
        playNextInQueue(guildId, interactionChannel);
        return;
      }

      const filePath = path.join(TEMP_AUDIO_DIR, `${videoId}.opus`);
      trackToPlay.filePath = filePath; // Store for potential cleanup

      try {
        console.log(`[Queue System ${guildId}] Starting download for ${trackToPlay.title} to ${filePath}`);
        const audioStream = ytdl(trackToPlay.url, {
          filter: 'audioonly',
          quality: 'highestaudio',
        });
        const writer = fs.createWriteStream(filePath);

        await new Promise((resolve, reject) => {
          audioStream.on('error', (err) => {
            writer.destroy(); // Ensure writer is destroyed on audioStream error
            reject(new Error(`ytdl stream error during download: ${err.message}`));
          });
          writer.on('finish', resolve);
          writer.on('error', (err) => {
            // audioStream.destroy(); // Optionally destroy audioStream if writer fails.
            reject(new Error(`File system error during download: ${err.message}`));
          });
          audioStream.pipe(writer);
        });

        console.log(`[Queue System ${guildId}] Successfully downloaded ${trackToPlay.title} to ${filePath}`);
        streamData = filePath; // streamData is now the file path
        streamType = StreamType.Arbitrary; // Let @discordjs/voice infer from file path
                                        // For .opus files, StreamType.OggOpus could be more specific if Arbitrary struggles.

      } catch (downloadError) {
        console.error(`[Queue System ${guildId}] Error downloading YouTube audio for ${trackToPlay.title} (URL: ${trackToPlay.url}): ${downloadError.message}`, downloadError);
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch (e) { console.error(`[File System] Failed to clean up partial download ${filePath}: ${e.message}`); }
        }
        trackToPlay.filePath = undefined;

        const errorChannel = queueData?.lastInteractionChannel || trackToPlay.interactionChannel || interactionChannel;
        if (errorChannel) {
          const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(`Error al descargar la canción de YouTube **${trackToPlay.title}**: ${downloadError.message.substring(0,100)}`);
          try { await errorChannel.send({ embeds: [errorEmbed] }); } catch (e) { console.error(`[Interaction Error] Failed to send "download error" message for guild ${guildId}: ${e.message}`, e); }
        }
        if(queueData) queueData.currentTrack = null;
        playNextInQueue(guildId, interactionChannel);
        return;
      }
    } else {
      console.log(`[Queue System ${guildId}] Non-YouTube URL detected for ${trackToPlay.title}. Using play-dl.`);
      let videoInfo;
      try {
        console.log(`[Queue System ${guildId}] Fetching video info via play-dl for: ${trackToPlay.title} (URL: ${trackToPlay.url})`);
        videoInfo = await playdl.video_basic_info(trackToPlay.url);
        console.log(`[Queue System ${guildId}] Successfully fetched video info via play-dl for: ${trackToPlay.title}`);
      } catch (infoError) {
        console.error(`[Queue System ${guildId}] Error fetching video info via play-dl for ${trackToPlay.title} (URL: ${trackToPlay.url}): ${infoError.message}`, infoError);
        const errorChannel = queueData?.lastInteractionChannel || trackToPlay.interactionChannel || interactionChannel;
        if (errorChannel) {
          const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(`Error al obtener información (play-dl) para **${trackToPlay.title}**. Saltando canción.`);
          try { await errorChannel.send({ embeds: [errorEmbed] }); } catch (e) { console.error(`[Interaction Error] Failed to send "play-dl info error" message for guild ${guildId}: ${e.message}`, e); }
        }
        if(queueData) queueData.currentTrack = null;
        playNextInQueue(guildId, interactionChannel);
        return;
      }
      const pdlStreamObject = await playdl.stream_from_info(videoInfo, { quality: 1 });
      streamData = pdlStreamObject.stream; // This is the readable stream
      streamType = pdlStreamObject.type;
    }

    const resource = createAudioResource(streamData, {
        inputType: streamType,
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
        try { await queueData.nowPlayingMessage.delete(); } catch (err) { console.warn(`[Queue System ${guildId}] Could not delete old now playing message: ${err.message}`); }
    }
    
    const channelForMessage = queueData.lastInteractionChannel || trackToPlay.interactionChannel || interactionChannel;
    if (channelForMessage) {
        try {
            const msg = await channelForMessage.send({ embeds: [nowPlayingEmbed], components: [row] });
            if(queueData) queueData.nowPlayingMessage = msg; 
        } catch (e) {
            console.error(`[Interaction Error] Failed to send "Now Playing" message for guild ${guildId}: ${e.message}`, e);
        }
    }

  } catch (error) {
    console.error(`[Queue System ${guildId}] Error playing track ${trackToPlay.title}: ${error.message}`, error);
    const errorChannel = queueData?.lastInteractionChannel || trackToPlay.interactionChannel || interactionChannel;
    if (errorChannel) {
        let errorMessage = `Error al reproducir **${trackToPlay.title}**: ${error.message.substring(0,100)}`;
        // Check for specific TypeError related to "Invalid URL"
        // The original trace mentions "AudioPlayerError [TypeError]: Invalid URL"
        // play-dl itself might throw a TypeError for invalid URLs before it even gets to AudioPlayer.
        if ((error.name && error.name.includes('TypeError')) && error.message.includes('Invalid URL')) {
            errorMessage = `Error al intentar obtener la transmisión de audio para **${trackToPlay.title}**: La URL resultó inválida o no se pudo acceder al contenido.`;
        } else if (error.message.includes('Sign in to confirm your age')) {
            errorMessage = `Error al reproducir **${trackToPlay.title}**: El video tiene restricción de edad y requiere inicio de sesión.`;
        } else if (error.message.includes('private video')) {
            errorMessage = `Error al reproducir **${trackToPlay.title}**: Este video es privado.`;
        } else if (error.message.includes('Premiere')) {
            errorMessage = `Error al reproducir **${trackToPlay.title}**: Este video es un estreno y aún no está disponible.`;
        }

        const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(errorMessage);
        try { await errorChannel.send({ embeds: [errorEmbed] }); } catch (e) { console.error(`[Interaction Error] Failed to send "error playing track" message for guild ${guildId}: ${e.message}`, e); }
    }
    if(queueData) queueData.currentTrack = null; 
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
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply(); 
        }
    } catch (e) {
        console.error(`[Interaction Error] Failed to deferReply for interaction ${interaction.id}: ${e.message}`, e);
        return; // Cannot proceed if defer fails
    }

    const userVoiceChannel = interaction.member.voice.channel;
    if (!userVoiceChannel) {
      const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription('Debes estar en un canal de voz para usar este comando.');
      try { await interaction.editReply({ embeds: [errorEmbed] }); } catch (e) { console.error(`[Interaction Error] Failed to editReply for interaction ${interaction.id} (user not in VC): ${e.message}`, e); }
      return;
    }

    let connection = getVoiceConnection(interaction.guild.id);
    let player = guildPlayers.get(interaction.guild.id); 
    let queueData = guildQueues.get(interaction.guild.id); 

    if (!connection) { 
      console.log(`[Play Command] No existing connection for guild ${interaction.guild.id}. Attempting to join user's channel: ${userVoiceChannel.name}`);
      if (!userVoiceChannel.joinable) {
          const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(`No tengo permisos para unirme al canal de voz **${userVoiceChannel.name}**.`);
          try { await interaction.editReply({ embeds: [errorEmbed] }); } catch (e) { console.error(`[Interaction Error] Failed to editReply for interaction ${interaction.id} (not joinable): ${e.message}`, e); }
          return;
      }
      if (!userVoiceChannel.speakable && userVoiceChannel.type !== ChannelType.GuildStageVoice) {
        const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(`No tengo permisos para hablar en el canal de voz **${userVoiceChannel.name}**.`);
        try { await interaction.editReply({ embeds: [errorEmbed] }); } catch (e) { console.error(`[Interaction Error] Failed to editReply for interaction ${interaction.id} (not speakable): ${e.message}`, e); }
        return;
      }
      try {
        console.log(`[PLAY - JOIN] Attempting to join voice channel. Guild ID: ${interaction.guild.id}, Channel ID: ${userVoiceChannel.id}`);
        connection = joinVoiceChannel({
          channelId: userVoiceChannel.id,
          guildId: interaction.guild.id,
          adapterCreator: interaction.guild.voiceAdapterCreator,
          selfDeaf: true,
        });
        console.log(`[PLAY - JOIN] Voice channel joined, awaiting Ready state. Guild ID: ${interaction.guild.id}, Channel ID: ${userVoiceChannel.id}`);
        
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
        console.log(`[PLAY - JOIN] Voice connection Ready. Guild ID: ${interaction.guild.id}, Channel ID: ${userVoiceChannel.id}`);
      } catch (error) {
        console.error(`[PLAY - JOIN] Failed to reach Ready state for voice connection. Guild ID: ${interaction.guild.id}, Channel ID: ${userVoiceChannel.id}. Error: ${error.message}`, error);
        if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
            connection.destroy();
        }
        const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(`No me pude conectar a tu canal de voz (${userVoiceChannel.name}). Verifica mis permisos.`);
        try { await interaction.editReply({ embeds: [errorEmbed] }); } catch (e) { console.error(`[Interaction Error] Failed to editReply for interaction ${interaction.id} (join VC error): ${e.message}`, e); }
        return;
      }
    } else { 
      console.log(`[Play Command] Bot already connected to a voice channel in guild ${interaction.guild.id}. Current channel: ${connection.joinConfig.channelId}`);
      if (userVoiceChannel.id !== connection.joinConfig.channelId) {
        const currentBotChannel = interaction.guild.channels.cache.get(connection.joinConfig.channelId);
        const infoEmbed = new EmbedBuilder().setColor(0xFFCC00)
          .setDescription(`Ya estoy en el canal de voz **${currentBotChannel?.name || 'otro canal'}**. La música se reproducirá/añadirá allí.`)
          .setFooter({text: "Si quieres que me una a tu canal, usa /leave primero o el comando /join."});
        try { await interaction.followUp({ embeds: [infoEmbed], flags: [MessageFlags.Ephemeral] }); } catch (e) { console.error(`[Interaction Error] Failed to followUp for interaction ${interaction.id} (bot in other channel): ${e.message}`, e); }
      }
    }

    if (!player) {
      player = createAudioPlayer();
      guildPlayers.set(interaction.guild.id, player);
      connection.subscribe(player); 

      if (!guildQueues.has(interaction.guild.id)) {
        guildQueues.set(interaction.guild.id, { tracks: [], lastInteractionChannel: interaction.channel, nowPlayingMessage: null, currentTrack: null });
      }
      queueData = guildQueues.get(interaction.guild.id); 

      player.on(AudioPlayerStatus.Idle, async () => { // Made async
        const guildId = interaction.guild.id; // or get it from player if possible, or pass it
        console.log(`[AudioPlayer ${guildId}] Player is idle.`);
        const currentQueueData = guildQueues.get(guildId); // Use guildId from context

        if (currentQueueData) {
            const oldTrack = currentQueueData.currentTrack; // Track that just finished
            if (oldTrack && oldTrack.filePath) {
                await cleanupFile(oldTrack.filePath);
                oldTrack.filePath = undefined; // Clear the path from the track object
            }

            if (currentQueueData.nowPlayingMessage) {
                try {
                    await currentQueueData.nowPlayingMessage.delete();
                } catch(e){
                    console.warn(`[AudioPlayer ${guildId}] Failed to delete old NP message on Idle: ${e.message}`);
                }
                currentQueueData.nowPlayingMessage = null;
            }
        }
        // Ensure interaction.channel is available or use a stored channel from queueData
        playNextInQueue(guildId, currentQueueData?.lastInteractionChannel || interaction.channel);
      });

      player.on('error', async error => { // Made async for consistency if cleanup is added here
        console.error(`[AudioPlayer ${interaction.guild.id}] Error: ${error.message}`, error);
        const currentQueueData = guildQueues.get(interaction.guild.id);
        if (currentQueueData) currentQueueData.currentTrack = null;
        const errorChannel = currentQueueData?.lastInteractionChannel || interaction.channel;
        const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(`Ocurrió un error con el reproductor: ${error.message.substring(0,150)}`);
        try { errorChannel.send({ embeds: [errorEmbed] }).catch(console.error); } catch(e) { console.error(`[Interaction Error] Failed to send player error message for guild ${interaction.guild.id}: ${e.message}`, e); }
        playNextInQueue(interaction.guild.id, errorChannel);
      });
      
      if (!connection.listeners(VoiceConnectionStatus.Destroyed).some(listener => listener.name === 'playJsDestroyHandler')) {
        const playJsDestroyHandler = async () => { // Made async
            const guildId = interaction.guild.id; // or get from connection context if available
            console.log(`[VoiceConnection ${guildId}] Connection destroyed (handler in play.js). Cleaning up player and queue.`);

            const qData = guildQueues.get(guildId);
            if (qData) {
                // Clean up the currently playing track, if any and if downloaded
                if (qData.currentTrack && qData.currentTrack.filePath) {
                    await cleanupFile(qData.currentTrack.filePath);
                    qData.currentTrack.filePath = undefined;
                }
                // Clean up any tracks remaining in the queue that might have been downloaded
                for (const track of qData.tracks) {
                    if (track.filePath) {
                        await cleanupFile(track.filePath);
                        track.filePath = undefined;
                    }
                }
                // Clean up now playing message
                if (qData.nowPlayingMessage) {
                    try {
                        await qData.nowPlayingMessage.delete();
                    } catch(e) {
                        console.warn(`[VoiceConnection ${guildId}] Failed to delete NP message on Destroy: ${e.message}`);
                    }
                }
                guildQueues.delete(guildId); // Delete queue data for the guild
            }

            if (player) {
              player.stop(true); // Stop the player
              guildPlayers.delete(guildId); // Delete player instance for the guild
            }
        };
        connection.on(VoiceConnectionStatus.Destroyed, playJsDestroyHandler);
      }
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
        try {
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x0099FF).setDescription('Procesando playlist de Spotify... Esto puede tardar un momento.')] });
        } catch (e) {
          console.error(`[Interaction Error] Failed to editReply for interaction ${interaction.id} (processing Spotify playlist): ${e.message}`, e);
          try { await interaction.followUp({ content: 'Procesando playlist de Spotify...', flags: [MessageFlags.Ephemeral] }); } catch (e2) { console.error(`[Interaction Error] FollowUp also failed for ${interaction.id}: ${e2.message}`, e2); }
        }
        
        const playlist = await playdl.playlist_info(query, { incomplete: true });
        if (!playlist || !playlist.videos || playlist.videos.length === 0) { 
          const errorEmbed = new EmbedBuilder().setColor(0xFFCC00).setDescription('No se pudo obtener información de la playlist de Spotify o está vacía.');
          try { await interaction.followUp({ embeds: [errorEmbed], flags: [MessageFlags.Ephemeral] }); } catch (e) { console.error(`[Interaction Error] Failed to followUp for interaction ${interaction.id} (playlist info error): ${e.message}`, e); }
          return;
        }

        // Comprobación del límite de la cola para playlists
        if (queueData.tracks.length + playlist.videos.length > MAX_QUEUE_SIZE) {
          console.log(`[Queue System ${interaction.guild.id}] Playlist too large for current queue. Current: ${queueData.tracks.length}, Adding: ${playlist.videos.length}, Max: ${MAX_QUEUE_SIZE}`);
          const playlistTooLargeEmbed = new EmbedBuilder()
            .setColor(0xFFCC00)
            .setDescription(`La playlist es demasiado larga para el espacio disponible en la cola (máximo ${MAX_QUEUE_SIZE} canciones en total). No se añadieron canciones de la playlist.`);
          try { await interaction.followUp({ embeds: [playlistTooLargeEmbed], flags: [MessageFlags.Ephemeral] }); } catch(eMsg) { console.error('[Interaction Error] Failed to send playlist too large message:', eMsg); }
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
        
        queueData.tracks.push(...tracksToAdd); // tracksToAdd ya está correctamente filtrado o es la lista completa
        console.log(`[Play Command] Added ${tracksToAdd.length} tracks from playlist: ${playlist.name}`);

        const playlistAddedEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Playlist Añadida a la Cola')
            .setDescription(`**${playlist.name || 'Playlist de Spotify'}** (${tracksToAdd.length} canciones)`)
            .setThumbnail(playlist.thumbnail?.url || (tracksToAdd.length > 0 ? tracksToAdd[0].thumbnail : null))
            .addFields({ name: 'Pedido por', value: interaction.user.tag, inline: true });
        
        try { await interaction.followUp({ embeds: [playlistAddedEmbed] }); } catch (e) { console.error(`[Interaction Error] Failed to followUp for interaction ${interaction.id} (playlist added): ${e.message}`, e); }

      } else { // Single track logic
        console.log(`[Play Command] Searching for single query: "${query}"`);
        const searchResults = await playdl.search(query, { limit: 1, source : { youtube : 'video' } }); 

        if (!searchResults || searchResults.length === 0) {
          const errorEmbed = new EmbedBuilder().setColor(0xFFCC00).setDescription('No se encontraron resultados para tu búsqueda.');
          try { await interaction.editReply({ embeds: [errorEmbed] }); } catch (e) { console.error(`[Interaction Error] Failed to editReply for interaction ${interaction.id} (no search results): ${e.message}`, e); }
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

        // Comprobación del límite de la cola para pistas individuales
        if (queueData.tracks.length >= MAX_QUEUE_SIZE) {
          console.log(`[Queue System ${interaction.guild.id}] Queue is full. Max size: ${MAX_QUEUE_SIZE}. Cannot add: ${track.title}`);
          const queueFullEmbed = new EmbedBuilder()
            .setColor(0xFFCC00)
            .setDescription(`La cola está llena (máximo ${MAX_QUEUE_SIZE} canciones). No se pudo añadir **${track.title}**.`);
          try {
            // Prefer followUp for additional messages after initial reply/editReply
            await interaction.followUp({ embeds: [queueFullEmbed], flags: [MessageFlags.Ephemeral] });
          } catch(eFollowUp) {
            console.error('[Interaction Error] Failed to send queue full message (followUp):', eFollowUp);
            // Fallback or further error handling if followUp fails
          }
          return;
        }
        
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
            try { await interaction.editReply({ embeds: [queueEmbed] }); } catch (e) { console.error(`[Interaction Error] Failed to editReply for interaction ${interaction.id} (track added to queue): ${e.message}`, e); }
        } else { 
            const simpleAddEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setDescription(`Añadido a la cola: **${track.title}**. Empezando reproducción...`);
            try { await interaction.editReply({ embeds: [simpleAddEmbed] }); } catch (e) { console.error(`[Interaction Error] Failed to editReply for interaction ${interaction.id} (starting playback): ${e.message}`, e); }
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
      
      try {
        if (interaction.replied && !interaction.deferred) { 
            await interaction.followUp({ embeds: [errorEmbed], flags: [MessageFlags.Ephemeral], components: [] });
        } else { 
             await interaction.editReply({ embeds: [errorEmbed], components: [] });
        }
      } catch (e) {
          console.error(`[Interaction Error] Failed to send final error message for interaction ${interaction.id}: ${e.message}`, e);
          try {
            await interaction.channel.send({ embeds: [errorEmbed], components: [] });
          } catch (e2) {
            console.error(`[Interaction Error] Channel.send also failed for interaction ${interaction.id}: ${e2.message}`, e2);
          }
      }
    }
  },
  playNextInQueue,
  pauseTrack,
  resumeTrack,
  guildPlayers, 
  guildQueues   
};
