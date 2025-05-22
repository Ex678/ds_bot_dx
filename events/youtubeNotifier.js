const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

// --- Configuration Loading ---
let config = {};
let youtubeApiKey = 'YOUR_YOUTUBE_API_KEY_PLACEHOLDER';
const configPath = path.join(__dirname, '..', 'config.json');

try {
  if (fs.existsSync(configPath)) {
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
    // Provide default values or handle the absence of config more gracefully if needed
  }
} catch (error) {
  console.error('[YouTube Notifier] Error al cargar config.json:', error);
}

// --- Constants ---
const YOUTUBE_CHANNEL_ID = 'UCWqayy4sixf662hYgH9hUiA'; // El canal de YouTube a monitorear
const DISCORD_ANNOUNCEMENT_CHANNEL_ID = '1177420370895187988'; // El canal de Discord para anuncios
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutos
const lastVideoIdPath = path.join(__dirname, 'lastVideoId.json');

// --- YouTube API Client Initialization ---
let youtube;
if (youtubeApiKey !== 'YOUR_YOUTUBE_API_KEY_PLACEHOLDER') {
  youtube = google.youtube({ version: 'v3', auth: youtubeApiKey });
} else {
  console.warn('[YouTube Notifier] La API de YouTube no se inicializará porque se está usando una clave API de placeholder.');
}

// --- State Management for Last Video ID ---
function readLastVideoId() {
  try {
    if (fs.existsSync(lastVideoIdPath)) {
      const data = fs.readFileSync(lastVideoIdPath, 'utf8');
      const jsonData = JSON.parse(data);
      return jsonData.lastVideoId || null;
    }
  } catch (error) {
    console.error('[YouTube Notifier] Error al leer lastVideoId.json:', error);
  }
  return null;
}

function writeLastVideoId(videoId) {
  try {
    fs.writeFileSync(lastVideoIdPath, JSON.stringify({ lastVideoId: videoId }), 'utf8');
  } catch (error)
    {
    console.error('[YouTube Notifier] Error al escribir en lastVideoId.json:', error);
  }
}

// --- Main Function to Check New Videos ---
async function checkNewVideos(client) {
  if (!youtube || youtubeApiKey === 'YOUR_YOUTUBE_API_KEY_PLACEHOLDER') {
    console.error('[YouTube Notifier] No se puede buscar videos: youtubeApiKey no está configurada o es un placeholder.');
    return;
  }

  try {
    console.log('[YouTube Notifier] Buscando nuevos videos...');
    const response = await youtube.search.list({
      part: 'snippet',
      channelId: YOUTUBE_CHANNEL_ID,
      order: 'date',
      maxResults: 1,
      type: 'video',
    });

    if (response.data.items && response.data.items.length > 0) {
      const latestVideo = response.data.items[0];
      if (latestVideo && latestVideo.id && latestVideo.id.videoId && latestVideo.snippet) {
        const currentVideoId = latestVideo.id.videoId;
        const lastVideoId = readLastVideoId();

        console.log(`[YouTube Notifier] Video más reciente encontrado: ${currentVideoId} (${latestVideo.snippet.title})`);
        console.log(`[YouTube Notifier] Último video procesado: ${lastVideoId}`);

        if (currentVideoId !== lastVideoId) {
          console.log(`[YouTube Notifier] ¡Nuevo video detectado! ID: ${currentVideoId}`);
          const discordChannel = await client.channels.fetch(DISCORD_ANNOUNCEMENT_CHANNEL_ID);

          if (discordChannel) {
            const videoUrl = `https://www.youtube.com/watch?v=${currentVideoId}`;
            const embed = new EmbedBuilder()
              .setTitle(`🔴 ¡Nuevo Video de ${latestVideo.snippet.channelTitle}!`)
              .setDescription(latestVideo.snippet.title)
              .setURL(videoUrl)
              .setImage(latestVideo.snippet.thumbnails.high.url)
              .setColor(0xFF0000) // Red
              .setTimestamp(new Date(latestVideo.snippet.publishedAt))
              .setFooter({ text: '¡No te lo pierdas!' });

            try {
                await discordChannel.send({ content: '@everyone', embeds: [embed] });
                console.log(`[YouTube Notifier] Nuevo video anunciado en Discord: ${latestVideo.snippet.title}`);
                writeLastVideoId(currentVideoId);
            } catch(sendError) {
                console.error('[YouTube Notifier] Error al enviar mensaje a Discord:', sendError);
            }
          } else {
            console.error(`[YouTube Notifier] Canal de Discord con ID ${DISCORD_ANNOUNCEMENT_CHANNEL_ID} no encontrado.`);
          }
        } else {
          console.log('[YouTube Notifier] No hay videos nuevos desde la última revisión.');
        }
      } else {
        console.warn('[YouTube Notifier] El video más reciente encontrado no tiene ID de video o snippet.');
      }
    } else {
      console.log('[YouTube Notifier] No se encontraron videos en la respuesta de la API.');
    }
  } catch (error) {
    console.error('[YouTube Notifier] Error al buscar nuevos videos o procesarlos:', error.message);
    if (error.response && error.response.data && error.response.data.error) {
        console.error('[YouTube Notifier] Detalles del error de la API de YouTube:', error.response.data.error.message);
    }
  }
}

// --- Discord Event Handler ---
module.exports = (client) => {
  client.once('ready', () => {
    console.log(`[YouTube Notifier] Conectado a Discord como ${client.user.tag}`);
    if (!youtube || youtubeApiKey === 'YOUR_YOUTUBE_API_KEY_PLACEHOLDER') {
        console.warn('[YouTube Notifier] El notificador de YouTube no se iniciará porque la clave API no está configurada.');
        return;
    }
    
    // Verificar que el bot esté en el guild especificado (opcional pero recomendado)
    if (config.guildId && !client.guilds.cache.has(config.guildId)) {
        console.warn(`[YouTube Notifier] El bot no está en el servidor (guildId: ${config.guildId}) especificado en config.json. El notificador podría no funcionar como se espera.`);
    }
    
    // Verificar si el canal de anuncios existe
    client.channels.fetch(DISCORD_ANNOUNCEMENT_CHANNEL_ID)
        .then(channel => {
            if (!channel) {
                console.error(`[YouTube Notifier] El canal de anuncios de Discord (ID: ${DISCORD_ANNOUNCEMENT_CHANNEL_ID}) no fue encontrado. Por favor, verifica el ID.`);
            } else {
                 console.log(`[YouTube Notifier] Canal de anuncios (${channel.name}) encontrado correctamente.`);
            }
        })
        .catch(err => {
            console.error(`[YouTube Notifier] Error al buscar el canal de anuncios de Discord (ID: ${DISCORD_ANNOUNCEMENT_CHANNEL_ID}):`, err.message);
            console.error('[YouTube Notifier] Asegúrate de que el ID del canal sea correcto y que el bot tenga permisos para verlo.');
        });


    checkNewVideos(client); // Check immediately on startup
    setInterval(() => checkNewVideos(client), CHECK_INTERVAL_MS);
    console.log(`[YouTube Notifier] YouTube Notifier está activo. Buscando videos cada ${CHECK_INTERVAL_MS / 60000} minutos.`);
  });
};
