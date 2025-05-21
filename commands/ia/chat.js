const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const OpenAI = require('openai');
const { openaiApiKey } = require('../../config.json');

// Memoria por usuario
const memory = new Map();

// Cliente OpenAI
const openai = new OpenAI({
	apiKey: openaiApiKey,
});

module.exports = {
	data: new SlashCommandBuilder()
		.setName('chat')
		.setDescription('Habla con ChatGPT')
		.addStringOption(option =>
			option.setName('mensaje')
				.setDescription('Tu mensaje para ChatGPT')
				.setRequired(true)),

	async execute(interaction) {
		const userId = interaction.user.id;
		const userMessage = interaction.options.getString('mensaje');

		// Obtener historial o crear uno
		if (!memory.has(userId)) {
			memory.set(userId, []);
		}
		const userHistory = memory.get(userId);

		// Agregar mensaje del usuario al historial
		userHistory.push({ role: 'user', content: userMessage });

		await interaction.deferReply();

		try {
			// Generar respuesta con OpenAI
			const completion = await openai.chat.completions.create({
				model: 'gpt-3.5-turbo',
				messages: [
					{ role: 'system', content: 'Eres un asistente amable y profesional en Discord.' },
					...userHistory,
				],
			});

			const gptReply = completion.choices[0].message.content;

			// Agregar respuesta de GPT al historial
			userHistory.push({ role: 'assistant', content: gptReply });

			// Crear embed bonito
			const embed = new EmbedBuilder()
				.setColor(0x5865F2)
				.setTitle('💬 Respuesta de ChatGPT')
				.setDescription(gptReply.slice(0, 4096)) // Discord permite hasta 4096 caracteres en description
				.setFooter({ text: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
				.setTimestamp();

			await interaction.editReply({ embeds: [embed] });
		} catch (error) {
			console.error('Error al llamar a OpenAI:', error);
			await interaction.editReply('❌ Ocurrió un error al contactar a ChatGPT.');
		}
	}
};

