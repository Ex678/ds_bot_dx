const { EmbedBuilder, Events } = require('discord.js');
const axios = require('axios');
const { twitchClientId, twitchClientSecret, streamerUsername, discordChannelId } = require('../config.json');

let accessToken;
let wasLive = false;

async function getTwitchAccessToken() {
	const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
		params: {
			client_id: twitchClientId,
			client_secret: twitchClientSecret,
			grant_type: 'client_credentials',
		}
	});
	return res.data.access_token;
}

async function isStreamerLive() {
	const res = await axios.get(`https://api.twitch.tv/helix/streams?user_login=${streamerUsername}`, {
		headers: {
			'Client-ID': twitchClientId,
			'Authorization': `Bearer ${accessToken}`,
		}
	});
	return res.data.data.length > 0 ? res.data.data[0] : null;
}

async function notifyStream(channel, streamData) {
	const embed = new EmbedBuilder()
		.setColor(0x9146FF)
		.setTitle(`🔴 ${streamData.user_name} está en vivo`)
		.setURL(`https://www.twitch.tv/${streamData.user_name}`)
		.setDescription(`**${streamData.title}**`)
		.setImage(streamData.thumbnail_url.replace('{width}', '1280').replace('{height}', '720') + `?rand=${Date.now()}`)
		.addFields(
			{ name: '🎮 Jugando a', value: streamData.game_name || 'Desconocido', inline: true },
			{ name: '👥 Viewers', value: streamData.viewer_count.toString(), inline: true }
		)
		.setTimestamp()
		.setFooter({ text: 'Hecho con amor por Ex678', iconURL: 'https://static.twitchcdn.net/assets/favicon-32-e29e246c157142c94346.png' });

	await channel.send({ content: `🚨 @everyone`, embeds: [embed] });
}

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		accessToken = await getTwitchAccessToken();
		const channel = await client.channels.fetch(discordChannelId);

		setInterval(async () => {
			try {
				const streamData = await isStreamerLive();

				if (streamData && !wasLive) {
					wasLive = true;
					await notifyStream(channel, streamData);
				} else if (!streamData) {
					wasLive = false;
				}
			} catch (error) {
				console.error('Error al verificar el stream de Twitch:', error.message);
			}
		}, 15_000); // cada minuto
	},
};

