import { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState
} from '@discordjs/voice';
import { EmbedBuilder } from 'discord.js';
import play from 'play-dl';
import logger from '../../utils/logger.js';

const queues = new Map();

class MusicQueue {
    constructor() {
        this.songs = [];
        this.player = createAudioPlayer();
        this.connection = null;
        this.volume = 100;
        this.loop = false;
        this.currentSong = null;
    }
}

async function playSong(queue, interaction) {
    if (!queue.songs.length) {
        if (queue.connection) {
            queue.connection.destroy();
            queues.delete(interaction.guildId);
        }
        return;
    }

    const song = queue.songs[0];
    try {
        let stream;
        if (song.url.includes('spotify.com')) {
            const searched = await play.search(song.title, { limit: 1 });
            if (!searched.length) throw new Error('No se encontró la canción en YouTube');
            stream = await play.stream(searched[0].url);
        } else {
            stream = await play.stream(song.url);
        }

        const resource = createAudioResource(stream.stream, {
            inputType: stream.type,
            inlineVolume: true
        });
        resource.volume.setVolume(queue.volume / 100);

        queue.player.play(resource);
        queue.currentSong = song;

        const embed = new EmbedBuilder()
            .setTitle('🎵 Reproduciendo')
            .setDescription(`**${song.title}**`)
            .setColor('#00ff00')
            .setThumbnail(song.thumbnail)
            .addFields(
                { name: 'Duración', value: song.duration, inline: true },
                { name: 'Solicitado por', value: song.requestedBy, inline: true }
            );

        await interaction.channel.send({ embeds: [embed] });

    } catch (error) {
        logger.error('Error al reproducir la canción:', error);
        queue.songs.shift();
        await interaction.channel.send('❌ Error al reproducir la canción. Pasando a la siguiente...');
        return playSong(queue, interaction);
    }
}

export async function play_music(interaction, url) {
    if (!interaction.member.voice.channel) {
        return await interaction.reply('❌ ¡Debes estar en un canal de voz!');
    }

    let queue = queues.get(interaction.guildId);
    if (!queue) {
        queue = new MusicQueue();
        queues.set(interaction.guildId, queue);
    }

    try {
        let songInfo;
        if (url.includes('spotify.com')) {
            if (url.includes('playlist')) {
                return await interaction.reply('❌ Las playlists de Spotify no están soportadas aún.');
            }
            const spotifyData = await play.spotify(url);
            songInfo = {
                title: `${spotifyData.name} - ${spotifyData.artists.join(', ')}`,
                url: url,
                thumbnail: spotifyData.thumbnail?.url || 'https://www.scdn.co/i/_global/twitter_card-default.jpg',
                duration: formatDuration(spotifyData.durationInMs),
                requestedBy: interaction.user.tag
            };
        } else {
            const validateURL = await play.validate(url);
            if (!validateURL) {
                // Tratar como búsqueda
                const searchResults = await play.search(url, { limit: 1 });
                if (!searchResults.length) {
                    return await interaction.reply('❌ No se encontró ninguna canción.');
                }
                const video = searchResults[0];
                songInfo = {
                    title: video.title,
                    url: video.url,
                    thumbnail: video.thumbnails[0].url,
                    duration: formatDuration(video.durationInSec * 1000),
                    requestedBy: interaction.user.tag
                };
            } else {
                const video = await play.video_info(url);
                songInfo = {
                    title: video.video_details.title,
                    url: video.video_details.url,
                    thumbnail: video.video_details.thumbnails[0].url,
                    duration: formatDuration(video.video_details.durationInSec * 1000),
                    requestedBy: interaction.user.tag
                };
            }
        }

        queue.songs.push(songInfo);
        await interaction.reply(`✅ **${songInfo.title}** ha sido añadida a la cola.`);

        if (!queue.connection) {
            queue.connection = joinVoiceChannel({
                channelId: interaction.member.voice.channel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });

            queue.connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(queue.connection, VoiceConnectionStatus.Signalling, 5_000),
                        entersState(queue.connection, VoiceConnectionStatus.Connecting, 5_000),
                    ]);
                } catch (error) {
                    queue.connection.destroy();
                    queues.delete(interaction.guildId);
                }
            });

            queue.connection.subscribe(queue.player);
        }

        if (queue.player.state.status === AudioPlayerStatus.Idle) {
            await playSong(queue, interaction);
        }

        queue.player.on(AudioPlayerStatus.Idle, () => {
            if (queue.loop && queue.currentSong) {
                queue.songs.push(queue.songs.shift());
            } else {
                queue.songs.shift();
            }
            playSong(queue, interaction);
        });

        queue.player.on('error', error => {
            logger.error('Error en el reproductor de audio:', error);
            queue.songs.shift();
            playSong(queue, interaction);
        });

    } catch (error) {
        logger.error('Error al procesar la canción:', error);
        await interaction.reply('❌ Ocurrió un error al procesar la canción.');
    }
}

export async function skip(interaction) {
    const queue = queues.get(interaction.guildId);
    if (!queue) {
        return await interaction.reply('❌ No hay canciones en reproducción.');
    }
    queue.player.stop();
    await interaction.reply('⏭️ Canción saltada.');
}

export async function stop(interaction) {
    const queue = queues.get(interaction.guildId);
    if (!queue) {
        return await interaction.reply('❌ No hay canciones en reproducción.');
    }
    queue.songs = [];
    queue.player.stop();
    queue.connection.destroy();
    queues.delete(interaction.guildId);
    await interaction.reply('⏹️ Reproducción detenida.');
}

export async function pause(interaction) {
    const queue = queues.get(interaction.guildId);
    if (!queue) {
        return await interaction.reply('❌ No hay canciones en reproducción.');
    }
    queue.player.pause();
    await interaction.reply('⏸️ Reproducción pausada.');
}

export async function resume(interaction) {
    const queue = queues.get(interaction.guildId);
    if (!queue) {
        return await interaction.reply('❌ No hay canciones en reproducción.');
    }
    queue.player.unpause();
    await interaction.reply('▶️ Reproducción reanudada.');
}

export async function queue(interaction) {
    const queue = queues.get(interaction.guildId);
    if (!queue || !queue.songs.length) {
        return await interaction.reply('❌ No hay canciones en la cola.');
    }

    const songs = queue.songs.map((song, index) => 
        `${index + 1}. ${song.title} (${song.duration}) - Pedida por ${song.requestedBy}`
    );

    const embed = new EmbedBuilder()
        .setTitle('🎵 Cola de reproducción')
        .setDescription(songs.join('\n'))
        .setColor('#00ff00')
        .setFooter({ text: `${queue.songs.length} canciones en la cola` });

    await interaction.reply({ embeds: [embed] });
}

export async function loop(interaction) {
    const queue = queues.get(interaction.guildId);
    if (!queue) {
        return await interaction.reply('❌ No hay canciones en reproducción.');
    }
    queue.loop = !queue.loop;
    await interaction.reply(`🔄 Modo bucle ${queue.loop ? 'activado' : 'desactivado'}.`);
}

export async function volume(interaction, volume) {
    const queue = queues.get(interaction.guildId);
    if (!queue) {
        return await interaction.reply('❌ No hay canciones en reproducción.');
    }
    if (volume < 0 || volume > 200) {
        return await interaction.reply('❌ El volumen debe estar entre 0 y 200.');
    }
    queue.volume = volume;
    if (queue.player.state.resource) {
        queue.player.state.resource.volume.setVolume(volume / 100);
    }
    await interaction.reply(`🔊 Volumen ajustado a ${volume}%.`);
}

function formatDuration(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));

    const parts = [];
    if (hours > 0) parts.push(hours.toString().padStart(2, '0'));
    parts.push(minutes.toString().padStart(2, '0'));
    parts.push(seconds.toString().padStart(2, '0'));

    return parts.join(':');
}

export async function handleButton(interaction) {
    const action = interaction.customId.split('_')[1];
    switch (action) {
        case 'skip':
            await skip(interaction);
            break;
        case 'stop':
            await stop(interaction);
            break;
        case 'pause':
            await pause(interaction);
            break;
        case 'resume':
            await resume(interaction);
            break;
        case 'loop':
            await loop(interaction);
            break;
    }
} 