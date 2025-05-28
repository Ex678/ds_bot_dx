const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const axios = require('axios');
const { parseStringPromise } = require('xml2js');
const { EmbedBuilder } = require('discord.js');

let config = {};

const configPath = path.join(__dirname, '../config.json');
try {
  if (fsSync.existsSync(configPath)) {
    config = require(configPath);
    // youtubeApiKey related warnings can be removed or adjusted if no longer needed elsewhere
    if (!config.youtubeApiKey) {
      console.warn('[YouTube Notifier] youtubeApiKey no encontrada en config.json. Esta clave ya no es necesaria para el notificador de YouTube mediante RSS.');
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

const YOUTUBE_CHANNEL_ID = 'UCWqayy4sixf662hYgH9hUiA'; // Test Channel: Google Developers
const DISCORD_ANNOUNCEMENT_CHANNEL_ID = '1177420370895187988'; // Test Discord Channel ID
const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const lastVideoIdPath = path.join(__dirname, 'lastVideoId.json');

// youtube variable and its initialization are removed as API is no longer used.

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
  console.log(`[YouTube Notifier] RSS URL: ${rssUrl}`); // Enhanced Logging

  try {
    console.log(`[YouTube Notifier] Obteniendo videos del canal ID: ${YOUTUBE_CHANNEL_ID} desde ${rssUrl}`);
    const response = await axios.get(rssUrl, { timeout: 10000 }); // Added timeout
    const xmlData = response.data;
    console.log(`[YouTube Notifier] Raw XML (Snippet): ${xmlData.substring(0, 500)}...`); // Enhanced Logging

    console.log('[YouTube Notifier] Parseando datos XML...');
    const parsedData = await parseStringPromise(xmlData);
    if (parsedData.feed && parsedData.feed.entry && parsedData.feed.entry.length > 0) { // Enhanced Logging
      console.log(`[YouTube Notifier] Parsed XML (First Entry): ${JSON.stringify(parsedData.feed.entry[0], null, 2)}`);
    } else {
      console.log('[YouTube Notifier] Parsed XML: No entries found or feed structure is unexpected.');
    }

    const entries = parsedData.feed.entry;

    if (entries && entries.length > 0) {
      const latestEntry = entries[0];
      const currentVideoId = latestEntry['yt:videoId']?.[0];
      const videoTitle = latestEntry.title?.[0];
      const videoUrl = latestEntry.link?.[0]?.$?.href;
      const publishedDate = latestEntry.published?.[0];
      const thumbnailUrl = latestEntry['media:group']?.[0]?.['media:thumbnail']?.[0]?.$?.url;
      const channelTitle = parsedData.feed.author?.[0]?.name?.[0] || 'Canal de YouTube'; // Fallback channel title

      // Enhanced Logging for extracted details
      console.log('[YouTube Notifier] Extracted Video Details:');
      console.log(`  ID: ${currentVideoId}`);
      console.log(`  Title: ${videoTitle}`);
      console.log(`  URL: ${videoUrl}`);
      console.log(`  Thumbnail URL: ${thumbnailUrl}`);
      console.log(`  Published Date: ${publishedDate}`);
      console.log(`  Channel Title: ${channelTitle}`);

      if (currentVideoId && videoTitle && videoUrl && publishedDate && thumbnailUrl) {
        const lastVideoId = await readLastVideoId();
        console.log(`[YouTube Notifier] Último video leído de archivo: ${lastVideoId}`);
        console.log(`[YouTube Notifier] Comparando: currentVideoId (${currentVideoId}) vs lastVideoId (${lastVideoId})`); // Enhanced Logging

        if (currentVideoId !== lastVideoId) {
          console.log(`[YouTube Notifier] ¡Nuevo video detectado! Anunciando...`);
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
        console.warn('[YouTube Notifier] El video más reciente del RSS no tiene todos los datos esperados.');
        console.log(`[YouTube Notifier] Datos extraídos: ID=${currentVideoId}, Title=${videoTitle}, URL=${videoUrl}, Published=${publishedDate}, Thumbnail=${thumbnailUrl}`);
      }
    } else {
      console.log('[YouTube Notifier] No se encontraron entradas de video en el feed RSS.');
    }
  } catch (error) {
    console.error('[YouTube Notifier] Error al obtener o procesar el feed RSS de YouTube:', error.message);
    if (error.response) { // Axios error specific
        console.error('[YouTube Notifier] Detalles del error de fetching RSS:', error.response.status, error.response.data);
    } else if (error.message.toLowerCase().includes('xml') || error.message.toLowerCase().includes('parsing')) { 
         console.error('[YouTube Notifier] Detalles del error de parseo XML:', error);
    } else if (error.code === 'ECONNABORTED') {
        console.error('[YouTube Notifier] Error de timeout al obtener el feed RSS.');
    }
  }
}

module.exports = (client) => {
  client.once('ready', () => {
    console.log(`[YouTube Notifier] Conectado a Discord como ${client.user.tag}`);

    // API Key check is removed as it's no longer needed for RSS method
    // if (!youtube || youtubeApiKey === 'YOUR_YOUTUBE_API_KEY_PLACEHOLDER') {
    //   console.warn('[YouTube Notifier] El notificador de YouTube no se iniciará porque la clave API no está configurada.');
    //   return;
    // }

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

// Mock client for testing as per subtask description
const mockClient = {
  channels: {
    fetch: async (channelId) => {
      console.log(`[Test Stub] Attempting to fetch channel ${channelId}`);
      // Simulate finding a channel
      return {
        send: async (message) => {
          console.log(`[Test Stub] Attempting to send message to channel ${channelId}:`, message.content, message.embeds[0].title);
          return { id: 'mockMessageId' }; // Simulate a sent message object
        },
        name: 'mock-channel'
      };
    }
  },
  user: { tag: 'TestBot#0000' } // For the ready event log
};

// Test execution block
if (require.main === module) {
  (async () => {
    console.log('[YouTube Notifier Test] Running in direct execution mode for testing.');
    // Ensure lastVideoId.json is in a state to detect a new video (e.g., delete it or ensure it has an old ID)
    try {
      await fs.unlink(lastVideoIdPath);
      console.log(`[YouTube Notifier Test] Deleted ${lastVideoIdPath} for a clean test run.`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`[YouTube Notifier Test] ${lastVideoIdPath} not found, which is fine for a clean test run.`);
      } else {
        console.error(`[YouTube Notifier Test] Error deleting ${lastVideoIdPath}:`, error);
      }
    }
    await checkNewVideos(mockClient);
    console.log('[YouTube Notifier Test] Test execution of checkNewVideos completed.');
  })();
}
