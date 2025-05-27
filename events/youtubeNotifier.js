const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { EmbedBuilder } = require('discord.js');

let config = {};
let youtubeApiKey;

const configPath = path.join(__dirname, 'config.json');

try {
  if (fsSync.existsSync(configPath)) {
    config = require(configPath);
    if (config.youtubeApiKey) {
      youtubeApiKey = config.youtubeApiKey;
    } else {
      console.warn('[YouTube Notifier] youtubeApiKey no encontrada en config.json. Usando placeholder. El notificador no funcionará hasta que se configure una clave válida.');
    }
    if (!config.guildId) {
      console.warn('[YouTube Notifier] guildId no encontrado en config.json. Algunas funciones pueden no funcionar como se espera.');
    }
    if (!config.token) {
      console.warn('[YouTube Notifier] token no encontrado en config.json. El bot podría no iniciarse.');
    }
  } else {
    console.error('[YouTube Notifier] config.json no encontrado. El notificador no funcionará.');
  }
} catch (error) {
  console.error('[YouTube Notifier] Error al cargar config.json:', error);
}

const YOUTUBE_CHANNEL_ID = 'UCWqayy4sixf662hYgH9hUiA';
const DISCORD_ANNOUNCEMENT_CHANNEL_ID = '1177420370895187988';
const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const lastVideoIdPath = path.join(__dirname, 'lastVideoId.json');

let youtube;
if (youtubeApiKey !== 'YOUR_YOUTUBE_API_KEY_PLACEHOLDER') {
  youtube = google.youtube({ version: 'v3', auth: youtubeApiKey });
} else {
  console.warn('[YouTube Notifier] La API de YouTube no se inicializará porque se está usando una clave API de placeholder.');
}

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
  console.log('[YouTube Notifier] Iniciando ciclo checkNewVideos.');
  const apiKeyForLog = (youtubeApiKey && youtubeApiKey !== "YOUR_YOUTUBE_API_KEY_PLACEHOLDER") 
    ? `${youtubeApiKey.substring(0, 5)}...${youtubeApiKey.substring(youtubeApiKey.length - 5)}`
    : "No seteada o es placeholder";
  console.log(`[YouTube Notifier] Clave API usada: ${apiKeyForLog}`);

  if (!youtube || youtubeApiKey === 'YOUR_YOUTUBE_API_KEY_PLACEHOLDER') {
    console.error('[YouTube Notifier] No se puede buscar videos: youtubeApiKey no está configurada o es un placeholder.');
    return;
  }

  try {
    console.log(`[YouTube Notifier] Obteniendo videos del canal ID: ${YOUTUBE_CHANNEL_ID}`);
    const response = await youtube.search.list({
      part: 'snippet',
      channelId: YOUTUBE_CHANNEL_ID,
      order: 'date',
      maxResults: 1,
      type: 'video',
    });

    const items = response.data.items || [];
    console.log(`[YouTube Notifier] Respuesta de la API: ${items.length} items encontrados.`);

    if (items.length > 0) {
      const latestVideo = items[0];
      console.log(`[YouTube Notifier] Datos del último video: ${JSON.stringify(latestVideo.snippet)}`);
      const currentVideoId = latestVideo?.id?.videoId;

      if (currentVideoId && latestVideo.snippet) {
        const lastVideoId = await readLastVideoId();
        console.log(`[YouTube Notifier] Último video leído de archivo: ${lastVideoId}`);

        if (currentVideoId !== lastVideoId) {
          console.log(`[YouTube Notifier] ¡Nuevo video detectado! Anunciando...`);
          const discordChannel = await client.channels.fetch(DISCORD_ANNOUNCEMENT_CHANNEL_ID);

          if (discordChannel) {
            const videoUrl = `https://www.youtube.com/watch?v=${currentVideoId}`;
            const embed = new EmbedBuilder()
              .setTitle(`🔴 ¡Nuevo Video de ${latestVideo.snippet.channelTitle}!`)
              .setDescription(latestVideo.snippet.title)
              .setURL(videoUrl)
              .setImage(latestVideo.snippet.thumbnails.high.url)
              .setColor(0xFF0000)
              .setTimestamp(new Date(latestVideo.snippet.publishedAt))
              .setFooter({ text: '¡No te lo pierdas!' });

            try {
              await discordChannel.send({ content: '@everyone', embeds: [embed] });
              console.log('[YouTube Notifier] Video anunciado correctamente.');
              await writeLastVideoId(currentVideoId);
              console.log('[YouTube Notifier] lastVideoId actualizado correctamente.');
            } catch (sendError) {
              console.error('[YouTube Notifier] Error al enviar el anuncio a Discord:', sendError);
            }
          } else {
            console.error(`[YouTube Notifier] Canal de Discord con ID ${DISCORD_ANNOUNCEMENT_CHANNEL_ID} no encontrado.`);
          }
        } else {
          console.log('[YouTube Notifier] No hay videos nuevos.');
        }
      } else {
        console.warn('[YouTube Notifier] El video más reciente no tiene ID o snippet válido.');
      }
    } else {
      console.log('[YouTube Notifier] No se encontraron videos nuevos.');
    }
  } catch (error) {
    console.error('[YouTube Notifier] Error al obtener o procesar videos de YouTube:', error.message);
    if (error.response?.data?.error) {
      console.error('[YouTube Notifier] Detalles del error de la API de YouTube:', JSON.stringify(error.response.data.error));
    }
  }
}

module.exports = (client) => {
  client.once('ready', () => {
    console.log(`[YouTube Notifier] Conectado a Discord como ${client.user.tag}`);

    if (!youtube || youtubeApiKey === 'YOUR_YOUTUBE_API_KEY_PLACEHOLDER') {
      console.warn('[YouTube Notifier] El notificador de YouTube no se iniciará porque la clave API no está configurada.');
      return;
    }

    if (config.guildId && !client.guilds.cache.has(config.guildId)) {
      console.warn(`[YouTube Notifier] El bot no está en el servidor con ID ${config.guildId}.`);
    }

    client.channels.fetch(DISCORD_ANNOUNCEMENT_CHANNEL_ID)
      .then(channel => {
        if (!channel) {
          console.error(`[YouTube Notifier] Canal de anuncios con ID ${DISCORD_ANNOUNCEMENT_CHANNEL_ID} no encontrado.`);
        } else {
          console.log(`[YouTube Notifier] Canal de anuncios encontrado: ${channel.name}`);
        }
      })
      .catch(err => {
        console.error(`[YouTube Notifier] Error al buscar canal:`, err.message);
      });

    checkNewVideos(client);
    console.log('[YouTube Notifier] Revisión inicial ejecutada.');
    setInterval(() => checkNewVideos(client), CHECK_INTERVAL_MS);
    console.log(`[YouTube Notifier] Intervalo configurado: cada ${CHECK_INTERVAL_MS / 60000} minutos.`);
  });
};
