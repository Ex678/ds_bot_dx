import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { EmbedBuilder, Events } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let config = {};

const configPath = join(__dirname, '../config.js');
try {
    if (fsSync.existsSync(configPath)) {
        const { youtubeApiKey, guildId, token } = await import(configPath);
        config = { youtubeApiKey, guildId, token };
        
        if (!youtubeApiKey) {
            console.warn('[YouTube Notifier] youtubeApiKey no encontrada en config.js. Esta clave ya no es necesaria para el notificador de YouTube mediante RSS.');
        }
        if (!guildId) {
            console.warn('[YouTube Notifier] guildId no encontrado en config.js. Algunas funciones pueden no funcionar como se espera.');
        }
        if (!token) {
            console.warn('[YouTube Notifier] token no encontrado en config.js. El bot podría no iniciarse.');
        }
    } else {
        console.error('[YouTube Notifier] config.js no encontrado. El notificador no funcionará.');
    }
} catch (error) {
    console.error('[YouTube Notifier] Error al cargar config.js:', error);
}

const YOUTUBE_CHANNEL_ID = 'UCWqayy4sixf662hYgH9hUiA';
const DISCORD_ANNOUNCEMENT_CHANNEL_ID = '1177420370895187988';
const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const lastVideoIdPath = join(__dirname, 'lastVideoId.json');

async function readLastVideoId() {
    try {
        await fs.access(lastVideoIdPath);
        const data = await fs.readFile(lastVideoIdPath, 'utf8');
        const jsonData = JSON.parse(data);
        return jsonData.lastVideoId || null;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('[YouTube Notifier] lastVideoId.json no encontrado. Devolviendo null.');
        } else {
            console.error('[YouTube Notifier] Error al leer lastVideoId.json:', error.message);
        }
        return null;
    }
}

async function writeLastVideoId(videoId) {
    try {
        await fs.writeFile(lastVideoIdPath, JSON.stringify({ lastVideoId: videoId }), 'utf8');
    } catch (error) {
        console.error('[YouTube Notifier] Error al escribir en lastVideoId.json:', error.message);
    }
}

async function checkNewVideos(client) {
    console.log('[YouTube Notifier] Iniciando ciclo checkNewVideos con RSS.');
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;

    try {
        console.log(`[YouTube Notifier] Obteniendo videos del canal ID: ${YOUTUBE_CHANNEL_ID}`);
        const response = await axios.get(rssUrl, { timeout: 10000 });
        const xmlData = response.data;

        const parsedData = await parseStringPromise(xmlData);
        const entries = parsedData.feed.entry;

        if (entries && entries.length > 0) {
            const latestEntry = entries[0];
            const currentVideoId = latestEntry['yt:videoId']?.[0];
            const videoTitle = latestEntry.title?.[0];
            const videoUrl = latestEntry.link?.[0]?.$?.href;
            const publishedDate = latestEntry.published?.[0];
            const thumbnailUrl = latestEntry['media:group']?.[0]?.['media:thumbnail']?.[0]?.$?.url;
            const channelTitle = parsedData.feed.author?.[0]?.name?.[0] || 'Canal de YouTube';

            if (currentVideoId && videoTitle && videoUrl && publishedDate && thumbnailUrl) {
                const lastVideoId = await readLastVideoId();

                if (currentVideoId !== lastVideoId) {
                    console.log(`[YouTube Notifier] ¡Nuevo video detectado!`);
                    const discordChannel = await client.channels.fetch(DISCORD_ANNOUNCEMENT_CHANNEL_ID);

                    if (discordChannel) {
                        const embed = new EmbedBuilder()
                            .setTitle(`🔴 ¡Nuevo Video de ${channelTitle}!`)
                            .setDescription(videoTitle)
                            .setURL(videoUrl)
                            .setImage(thumbnailUrl)
                            .setColor(0xFF0000)
                            .setTimestamp(new Date(publishedDate))
                            .setFooter({ text: '¡No te lo pierdas!' });

                        try {
                            await discordChannel.send({ content: '@everyone', embeds: [embed] });
                            console.log('[YouTube Notifier] Video anunciado correctamente.');
                            await writeLastVideoId(currentVideoId);
                        } catch (sendError) {
                            console.error('[YouTube Notifier] Error al enviar el anuncio a Discord:', sendError);
                        }
                    } else {
                        console.error(`[YouTube Notifier] Canal de Discord no encontrado.`);
                    }
                } else {
                    console.log('[YouTube Notifier] No hay videos nuevos.');
                }
            } else {
                console.warn('[YouTube Notifier] Datos incompletos en el video más reciente.');
            }
        } else {
            console.log('[YouTube Notifier] No se encontraron videos en el feed RSS.');
        }
    } catch (error) {
        console.error('[YouTube Notifier] Error al obtener videos:', error);
        if (error.response) {
            console.error('Detalles:', error.response.status, error.response.data);
        }
    }
}

export const name = Events.ClientReady;
export const once = true;

export async function execute(client) {
    console.log(`[YouTube Notifier] Iniciando para ${client.user.tag}...`);

    if (config.guildId && !client.guilds.cache.has(config.guildId)) {
        console.warn(`[YouTube Notifier] El bot no está en el servidor con ID ${config.guildId}.`);
    }

    try {
        const channel = await client.channels.fetch(DISCORD_ANNOUNCEMENT_CHANNEL_ID);
        if (!channel) {
            console.error('[YouTube Notifier] Canal de anuncios no encontrado.');
        } else {
            console.log(`[YouTube Notifier] Canal de anuncios encontrado: ${channel.name}`);
        }
    } catch (error) {
        console.error('[YouTube Notifier] Error al buscar canal:', error);
    }

    // Iniciar el ciclo de verificación
    await checkNewVideos(client);
    console.log('[YouTube Notifier] Revisión inicial completada.');
    
    setInterval(() => checkNewVideos(client), CHECK_INTERVAL_MS);
    console.log(`[YouTube Notifier] Intervalo configurado: cada ${CHECK_INTERVAL_MS / 60000} minutos.`);
}


