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

// Mapa para almacenar los reproductores de música por servidor
const guildPlayers = new Map();
// Mapa para almacenar las colas de reproducción por servidor
const guildQueues = new Map();

// Constantes para emojis y colores
const EMOJIS = {
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

const COLORS = {
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
            lastVoiceChannel: null
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
async function createYouTubeResource(url) {
    try {
        const stream = ytdl(url, {
            filter: 'audioonly',
            quality: 'highestaudio',
            highWaterMark: 1 << 25
        });
        return createAudioResource(stream);
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
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('music_pause_resume')
                .setLabel(playerData.player.state.status === 'playing' ? 'Pausar' : 'Reanudar')
                .setStyle(playerData.player.state.status === 'playing' ? ButtonStyle.Secondary : ButtonStyle.Success)
                .setEmoji(playerData.player.state.status === 'playing' ? EMOJIS.PAUSE : EMOJIS.PLAY),
            new ButtonBuilder()
                .setCustomId('music_skip')
                .setLabel('Saltar')
                .setStyle(ButtonStyle.Primary)
                .setEmoji(EMOJIS.SKIP),
            new ButtonBuilder()
                .setCustomId('music_stop')
                .setLabel('Detener')
                .setStyle(ButtonStyle.Danger)
                .setEmoji(EMOJIS.STOP),
            new ButtonBuilder()
                .setCustomId('music_queue')
                .setLabel('Ver Cola')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(EMOJIS.QUEUE),
            new ButtonBuilder()
                .setCustomId('music_leave')
                .setLabel('Salir')
                .setStyle(ButtonStyle.Danger)
                .setEmoji(EMOJIS.LEAVE)
        );
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

    const track = queueData.tracks.shift();
    queueData.currentTrack = track;
    playerData.isPlaying = true;

    try {
        const resource = await createYouTubeResource(track.url);
        playerData.player.play(resource);

        const randomNote = EMOJIS.NOTES[Math.floor(Math.random() * EMOJIS.NOTES.length)];
        const progressBar = `${EMOJIS.WAVE}${EMOJIS.WAVE}${EMOJIS.WAVE}${EMOJIS.WAVE}${EMOJIS.WAVE}`;

        const embed = new EmbedBuilder()
            .setColor(COLORS.PRIMARY)
            .setTitle(`${EMOJIS.NOW_PLAYING} Reproduciendo ahora ${randomNote}`)
            .setDescription(`**${track.title}**\n\n${progressBar}`)
            .setThumbnail(track.thumbnail)
            .addFields(
                { name: `${EMOJIS.TIME} Duración`, value: track.duration, inline: true },
                { name: `${EMOJIS.USER} Solicitado por`, value: track.requestedBy, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: `Usa los controles debajo para gestionar la reproducción ${EMOJIS.VOLUME}` });

        const row = createControlButtons(playerData);

        // Solo enviar mensaje si hay una interacción válida
        if (interaction && !interaction.replied && !interaction.deferred) {
            const message = await interaction.reply({ embeds: [embed], components: [row] });
            queueData.nowPlayingMessage = message;
        } else if (queueData.nowPlayingMessage) {
            // Si ya hay un mensaje de "now playing", actualizarlo
            try {
                await queueData.nowPlayingMessage.edit({ embeds: [embed], components: [row] });
            } catch (error) {
                console.error('[Music System] Error al actualizar mensaje:', error);
            }
        }

        // Configurar eventos del reproductor
        playerData.player.once(AudioPlayerStatus.Idle, () => {
            playerData.isPlaying = false;
            if (queueData.tracks.length > 0) {
                startPlaying(null, guildId);
            }
        });
    } catch (error) {
        console.error('[Music System] Error al iniciar reproducción:', error);
        playerData.isPlaying = false;
        throw error;
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
    try {
        const { customId, guildId } = interaction;
        const playerData = guildPlayers.get(guildId);

        if (!playerData || (!playerData.isPlaying && customId !== 'music_queue')) {
            return interaction.reply({ 
                content: '❌ ¡No hay nada reproduciéndose!', 
                ephemeral: true 
            });
        }

        switch (customId) {
            case 'music_pause_resume':
                if (playerData.player.state.status === 'playing') {
                    if (pauseTrack(guildId)) {
                        await interaction.reply({ 
                            content: `${EMOJIS.PAUSE} Música pausada`, 
                            ephemeral: true 
                        });
                    }
                } else {
                    if (resumeTrack(guildId)) {
                        await interaction.reply({ 
                            content: `${EMOJIS.PLAY} Música reanudada`, 
                            ephemeral: true 
                        });
                    }
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

            case 'music_leave':
                if (playerData.connection) {
                    playerData.connection.destroy();
                    playerData.connection = null;
                    playerData.lastVoiceChannel = null;
                    await interaction.reply({ 
                        content: `${EMOJIS.LEAVE} ¡Hasta la próxima! ${EMOJIS.WAVE}`, 
                        ephemeral: true 
                    });
                }
                break;

            case 'music_queue':
                const queueData = getQueue(guildId);
                if (!queueData || (!queueData.currentTrack && queueData.tracks.length === 0)) {
                    return interaction.reply({ 
                        content: `${EMOJIS.ERROR} ¡No hay canciones en la cola!`, 
                        ephemeral: true 
                    });
                }

                const randomNote = EMOJIS.NOTES[Math.floor(Math.random() * EMOJIS.NOTES.length)];
                const embed = new EmbedBuilder()
                    .setColor(COLORS.PRIMARY)
                    .setTitle(`${EMOJIS.QUEUE} Cola de Reproducción ${randomNote}`)
                    .setTimestamp();

                if (queueData.currentTrack) {
                    embed.addFields({
                        name: `${EMOJIS.NOW_PLAYING} Reproduciendo ahora:`,
                        value: `**${queueData.currentTrack.title}**\nSolicitado por: ${queueData.currentTrack.requestedBy}`
                    });
                }

                if (queueData.tracks.length > 0) {
                    const nextSongs = queueData.tracks
                        .slice(0, 10)
                        .map((track, index) => 
                            `${index + 1}. ${EMOJIS.NEXT} **${track.title}**\n${EMOJIS.USER} Solicitado por: ${track.requestedBy}`
                        )
                        .join('\n\n');

                    embed.addFields({
                        name: `${EMOJIS.QUEUE} Siguientes canciones:`,
                        value: nextSongs
                    });

                    if (queueData.tracks.length > 10) {
                        embed.setFooter({ 
                            text: `Y ${queueData.tracks.length - 10} canciones más... ${EMOJIS.NOTES[Math.floor(Math.random() * EMOJIS.NOTES.length)]}` 
                        });
                    }
                }

                await interaction.reply({ embeds: [embed], ephemeral: true });
                break;
        }

        // Actualizar los botones si el mensaje aún existe
        if (interaction.message && !interaction.message.ephemeral) {
            const row = createControlButtons(playerData);
            await interaction.message.edit({ components: [row] });
        }
    } catch (error) {
        console.error('[Music System] Error al procesar el botón:', error);
        await interaction.reply({ 
            content: '❌ ¡Hubo un error al procesar el control!', 
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
    handleButton,
    guildPlayers,
    guildQueues
}; 