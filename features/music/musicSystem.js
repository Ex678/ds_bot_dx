import { 
    AudioPlayerStatus,
    createAudioPlayer,
    createAudioResource,
    joinVoiceChannel,
    VoiceConnectionStatus,
    entersState
} from '@discordjs/voice';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import ytdl from '@distube/ytdl-core';
import { search } from 'youtube-search-without-api-key';

// Exportar variables para uso en otros módulos
export const guildPlayers = new Map();
export const guildQueues = new Map();

// Constantes para emojis y colores
export const EMOJIS = {
    PLAY: '▶️',
    PAUSE: '⏸️',
    SKIP: '⏭️',
    STOP: '⏹️',
    QUEUE: '📋',
    LEAVE: '👋',
    MUSIC: '🎵',
    TIME: '⏱️',
    USER: '👤',
    VOLUME: '🔊',
    ADDED: '✅',
    ERROR: '❌',
    NOW_PLAYING: '🎧',
    NEXT: '⏩',
    REPEAT: '🔁',
    WAVE: '〰️',
    NOTES: ['🎵', '🎶', '🎼', '🎹', '🎸', '🎺', '🥁', '🎻']
};

export const COLORS = {
    PRIMARY: 0x0099FF,
    SUCCESS: 0x00FF00,
    ERROR: 0xFF0000,
    WARNING: 0xFFAA00
};

/**
 * Obtiene o crea un reproductor de música para un servidor
 * @param {string} guildId - ID del servidor
 * @returns {Object} Objeto con el reproductor y la cola
 */
function getOrCreatePlayer(guildId) {
    let playerData = guildPlayers.get(guildId);
    let queueData = guildQueues.get(guildId);

    if (!playerData) {
        playerData = {
            player: createAudioPlayer(),
            connection: null,
            currentTrack: null,
            isPlaying: false,
            lastVoiceChannel: null,
            currentResource: null
        };
        guildPlayers.set(guildId, playerData);
    }

    if (!queueData) {
        queueData = {
            tracks: [],
            currentTrack: null,
            nowPlayingMessage: null
        };
        guildQueues.set(guildId, queueData);
    }

    return { playerData, queueData };
}

/**
 * Busca una canción en YouTube
 * @param {string} query - Término de búsqueda
 * @returns {Promise<Object>} Información de la canción
 */
async function searchSong(query) {
    try {
        const results = await search(query);
        if (!results || results.length === 0) {
            throw new Error('No se encontraron resultados.');
        }
        return results[0];
    } catch (error) {
        console.error('[Music System] Error al buscar canción:', error);
        throw error;
    }
}

/**
 * Crea un recurso de audio a partir de una URL de YouTube
 * @param {string} url - URL del video
 * @returns {Promise<Object>} Recurso de audio
 */
async function createYouTubeResource(url, playerData) {
    try {
        const stream = ytdl(url, {
            filter: 'audioonly',
            quality: 'highestaudio',
            highWaterMark: 1 << 25
        });

        const resource = createAudioResource(stream);
        
        playerData.currentResource = {
            stream: stream,
            resource: resource
        };

        return resource;
    } catch (error) {
        console.error('[Music System] Error al crear recurso de audio:', error);
        throw error;
    }
}

/**
 * Conecta el bot a un canal de voz
 * @param {Object} channel - Canal de voz
 * @param {string} guildId - ID del servidor
 * @returns {Object} Conexión de voz
 */
async function connectToChannel(channel, guildId) {
    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
    });

    try {
        await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

        // Configurar eventos de la conexión
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            const { playerData } = getOrCreatePlayer(guildId);
            if (playerData.isPlaying && playerData.lastVoiceChannel) {
                try {
                    // Intentar reconectar
                    playerData.connection = await connectToChannel(playerData.lastVoiceChannel, guildId);
                    playerData.connection.subscribe(playerData.player);
                } catch (error) {
                    console.error('[Music System] Error al reconectar:', error);
                    stopPlaying(guildId);
                }
            }
        });

        return connection;
    } catch (error) {
        connection.destroy();
        throw error;
    }
}

/**
 * Crea una barra de progreso visual
 * @param {number} current - Tiempo actual en segundos
 * @param {number} total - Duración total en segundos
 * @returns {string} Barra de progreso con formato
 */
function createProgressBar(current, total) {
    const length = 20;
    const progress = Math.round((current / total) * length);
    const emptyProgress = length - progress;

    const progressText = '▰'.repeat(progress);
    const emptyProgressText = '▱'.repeat(emptyProgress);
    const percentageText = Math.round((current / total) * 100);

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    return {
        bar: `${progressText}${emptyProgressText}`,
        percentage: percentageText,
        currentTime: formatTime(current),
        totalTime: formatTime(total),
        text: `\`${formatTime(current)} [${progressText}${emptyProgressText}] ${formatTime(total)}\``
    };
}

/**
 * Actualiza el mensaje de "reproduciendo ahora" con el progreso actual
 * @param {string} guildId - ID del servidor
 */
async function updateNowPlayingMessage(guildId) {
    const { playerData, queueData } = getOrCreatePlayer(guildId);
    
    if (!playerData.isPlaying || !queueData.nowPlayingMessage || !playerData.currentTrack) {
        return;
    }

    try {
        const track = playerData.currentTrack;
        const resource = playerData.currentResource.resource;
        
        // Calcular el progreso
        const playbackTime = resource.playbackDuration / 1000; // Convertir a segundos
        const duration = parseDuration(track.duration);
        const progress = createProgressBar(playbackTime, duration);

        // Actualizar el embed
        const embed = new EmbedBuilder()
            .setColor(COLORS.PRIMARY)
            .setTitle(`${EMOJIS.NOW_PLAYING} Reproduciendo ahora`)
            .setDescription(`${EMOJIS.MUSIC} **${track.title}**\n\n${progress.text}`)
            .setThumbnail(track.thumbnail)
            .addFields(
                { name: `${EMOJIS.TIME} Duración`, value: track.duration, inline: true },
                { name: `${EMOJIS.USER} Solicitado por`, value: track.requestedBy, inline: true },
                { name: `${EMOJIS.VOLUME} Volumen`, value: `${Math.round(playerData.audioEffects.volume * 100)}%`, inline: true }
            )
            .setTimestamp();

        const buttons = createControlButtons(playerData);

        await queueData.nowPlayingMessage.edit({
            embeds: [embed],
            components: [buttons]
        });
    } catch (error) {
        console.error('[Music System] Error al actualizar progreso:', error);
    }
}

/**
 * Convierte una duración en formato MM:SS a segundos
 * @param {string} duration - Duración en formato MM:SS
 * @returns {number} Duración en segundos
 */
function parseDuration(duration) {
    const [minutes, seconds] = duration.split(':').map(Number);
    return (minutes * 60) + seconds;
}

/**
 * Reproduce una canción
 * @param {Object} interaction - Interacción de Discord
 * @param {string} query - Término de búsqueda o URL
 */
async function playSong(interaction, query) {
    try {
        const { member, guildId } = interaction;
        
        if (!member.voice.channel) {
            throw new Error('¡Necesitas estar en un canal de voz!');
        }

        const { playerData, queueData } = getOrCreatePlayer(guildId);
        playerData.lastVoiceChannel = member.voice.channel;

        // Si no hay conexión o está en un canal diferente, crear una nueva
        if (!playerData.connection || 
            playerData.connection.joinConfig.channelId !== member.voice.channel.id) {
            if (playerData.connection) {
                playerData.connection.destroy();
            }
            playerData.connection = await connectToChannel(member.voice.channel, guildId);
            playerData.connection.subscribe(playerData.player);
        }

        // Buscar la canción
        const songInfo = await searchSong(query);
        const track = {
            url: songInfo.url,
            title: songInfo.title,
            thumbnail: songInfo.snippet.thumbnails.high.url,
            duration: songInfo.duration_raw,
            requestedBy: member.user.tag
        };

        // Añadir a la cola
        queueData.tracks.push(track);

        // Si no hay nada reproduciéndose, empezar a reproducir
        if (!playerData.isPlaying) {
            await startPlaying(interaction, guildId);
        } else {
            // Enviar mensaje de añadido a la cola
            const randomNote = EMOJIS.NOTES[Math.floor(Math.random() * EMOJIS.NOTES.length)];
            const embed = new EmbedBuilder()
                .setColor(COLORS.SUCCESS)
                .setTitle(`${EMOJIS.ADDED} Añadido a la cola ${randomNote}`)
                .setDescription(`**${track.title}**`)
                .setThumbnail(track.thumbnail)
                .addFields(
                    { name: `${EMOJIS.TIME} Duración`, value: track.duration, inline: true },
                    { name: `${EMOJIS.USER} Solicitado por`, value: track.requestedBy, inline: true }
                )
                .setFooter({ text: `Usa los controles debajo para gestionar la reproducción ${EMOJIS.VOLUME}` });

            const row = createControlButtons(playerData);
            await interaction.reply({ embeds: [embed], components: [row] });
        }
    } catch (error) {
        console.error('[Music System] Error al reproducir:', error);
        throw error;
    }
}

/**
 * Crea los botones de control
 * @param {Object} playerData - Datos del reproductor
 * @returns {ActionRowBuilder} Fila de botones
 */
function createControlButtons(playerData) {
    const row = new ActionRowBuilder();

    // Botón de pausa/reanudar
    row.addComponents(
        new ButtonBuilder()
            .setCustomId('music_pause')
            .setEmoji(playerData.player.state.status === AudioPlayerStatus.Playing ? EMOJIS.PAUSE : EMOJIS.PLAY)
            .setStyle(ButtonStyle.Primary)
    );

    // Botón de saltar
    row.addComponents(
        new ButtonBuilder()
            .setCustomId('music_skip')
            .setEmoji(EMOJIS.SKIP)
            .setStyle(ButtonStyle.Secondary)
    );

    // Botón de detener
    row.addComponents(
        new ButtonBuilder()
            .setCustomId('music_stop')
            .setEmoji(EMOJIS.STOP)
            .setStyle(ButtonStyle.Danger)
    );

    return row;
}

/**
 * Inicia la reproducción de la cola
 * @param {Object} interaction - Interacción de Discord
 * @param {string} guildId - ID del servidor
 */
async function startPlaying(interaction, guildId) {
    const { playerData, queueData } = getOrCreatePlayer(guildId);
    
    if (queueData.tracks.length === 0) {
        playerData.isPlaying = false;
        return;
    }

    try {
        // Obtener la siguiente canción
        const track = queueData.tracks.shift();
        queueData.currentTrack = track;
        playerData.currentTrack = track;

        // Crear y reproducir el recurso de audio
        const resource = await createYouTubeResource(track.url, playerData);
        playerData.player.play(resource);
        playerData.isPlaying = true;

        // Crear embed inicial
        const embed = new EmbedBuilder()
            .setColor(COLORS.PRIMARY)
            .setTitle(`${EMOJIS.NOW_PLAYING} Reproduciendo ahora`)
            .setDescription(`${EMOJIS.MUSIC} **${track.title}**\n\n\`0:00 [${('▱').repeat(20)}] ${track.duration}\``)
            .setThumbnail(track.thumbnail)
            .addFields(
                { name: `${EMOJIS.TIME} Duración`, value: track.duration, inline: true },
                { name: `${EMOJIS.USER} Solicitado por`, value: track.requestedBy, inline: true },
                { name: `${EMOJIS.VOLUME} Volumen`, value: `${Math.round(playerData.audioEffects.volume * 100)}%`, inline: true }
            )
            .setTimestamp();

        const buttons = createControlButtons(playerData);

        // Enviar o actualizar mensaje
        if (interaction.replied || interaction.deferred) {
            queueData.nowPlayingMessage = await interaction.channel.send({
                embeds: [embed],
                components: [buttons]
            });
        } else {
            queueData.nowPlayingMessage = await interaction.reply({
                embeds: [embed],
                components: [buttons],
                fetchReply: true
            });
        }

        // Iniciar actualización periódica
        const updateInterval = setInterval(() => {
            if (!playerData.isPlaying) {
                clearInterval(updateInterval);
                return;
            }
            updateNowPlayingMessage(guildId);
        }, 5000); // Actualizar cada 5 segundos

        // Configurar el manejador para cuando termine la canción
        playerData.player.once(AudioPlayerStatus.Idle, () => {
            clearInterval(updateInterval);
            startPlaying(interaction, guildId);
        });

    } catch (error) {
        console.error('[Music System] Error al reproducir:', error);
        if (interaction.replied || interaction.deferred) {
            await interaction.channel.send({
                content: `${EMOJIS.ERROR} ¡Error al reproducir la canción!`,
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: `${EMOJIS.ERROR} ¡Error al reproducir la canción!`,
                ephemeral: true
            });
        }
    }
}

/**
 * Pausa la reproducción
 * @param {string} guildId - ID del servidor
 * @returns {boolean} True si se pausó correctamente
 */
function pauseTrack(guildId) {
    const playerData = guildPlayers.get(guildId);
    if (playerData && playerData.player) {
        return playerData.player.pause();
    }
    return false;
}

/**
 * Reanuda la reproducción
 * @param {string} guildId - ID del servidor
 * @returns {boolean} True si se reanudó correctamente
 */
function resumeTrack(guildId) {
    const playerData = guildPlayers.get(guildId);
    if (playerData && playerData.player) {
        return playerData.player.unpause();
    }
    return false;
}

/**
 * Salta a la siguiente canción
 * @param {string} guildId - ID del servidor
 */
function skipTrack(guildId) {
    const playerData = guildPlayers.get(guildId);
    if (playerData && playerData.player) {
        playerData.player.stop();
    }
}

/**
 * Detiene la reproducción y limpia la cola
 * @param {string} guildId - ID del servidor
 */
function stopPlaying(guildId) {
    const playerData = guildPlayers.get(guildId);
    const queueData = guildQueues.get(guildId);

    if (playerData) {
        if (playerData.connection) {
            playerData.connection.destroy();
            playerData.connection = null;
        }
        if (playerData.player) {
            playerData.player.stop();
        }
        playerData.isPlaying = false;
        playerData.lastVoiceChannel = null;
    }

    if (queueData) {
        queueData.tracks = [];
        queueData.currentTrack = null;
    }
}

/**
 * Obtiene la cola de reproducción
 * @param {string} guildId - ID del servidor
 * @returns {Object} Cola de reproducción
 */
function getQueue(guildId) {
    return guildQueues.get(guildId);
}

/**
 * Maneja los botones de control
 * @param {Object} interaction - Interacción de Discord
 */
async function handleButton(interaction) {
    const { guildId } = interaction;
    const { playerData } = getOrCreatePlayer(guildId);

    if (!playerData.isPlaying) {
        return interaction.reply({
            content: `${EMOJIS.ERROR} ¡No hay música reproduciéndose!`,
            ephemeral: true
        });
    }

    try {
        switch (interaction.customId) {
            case 'music_pause':
                if (playerData.player.state.status === AudioPlayerStatus.Playing) {
                    pauseTrack(guildId);
                    await interaction.reply({
                        content: `${EMOJIS.PAUSE} Música pausada`,
                        ephemeral: true
                    });
                } else {
                    resumeTrack(guildId);
                    await interaction.reply({
                        content: `${EMOJIS.PLAY} Música reanudada`,
                        ephemeral: true
                    });
                }
                break;

            case 'music_skip':
                skipTrack(guildId);
                await interaction.reply({
                    content: `${EMOJIS.SKIP} Canción saltada`,
                    ephemeral: true
                });
                break;

            case 'music_stop':
                stopPlaying(guildId);
                await interaction.reply({
                    content: `${EMOJIS.STOP} Reproducción detenida`,
                    ephemeral: true
                });
                break;
        }

        // Actualizar los botones después de cualquier cambio
        if (playerData.queueData && playerData.queueData.nowPlayingMessage) {
            const buttons = createControlButtons(playerData);
            await playerData.queueData.nowPlayingMessage.edit({
                components: [buttons]
            });
        }

    } catch (error) {
        console.error('[Music System] Error al manejar botón:', error);
        await interaction.reply({
            content: `${EMOJIS.ERROR} ¡Hubo un error al procesar el comando!`,
            ephemeral: true
        });
    }
}

export {
    playSong,
    pauseTrack,
    resumeTrack,
    skipTrack,
    stopPlaying,
    getQueue,
    handleButton
}; 