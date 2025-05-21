// slowmode.js
const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('slowmode')
		.setDescription('Configura el modo lento en un canal')
		.addIntegerOption(option =>
			option.setName('segundos')
				.setDescription('Duración del modo lento en segundos (0 para desactivar)')
				.setMinValue(0)
				.setMaxValue(21600) // 6 horas
				.setRequired(true))
		.addChannelOption(option =>
			option.setName('canal')
				.setDescription('Canal al que aplicar el slowmode')
				.setRequired(false)),

	async execute(interaction) {
		const segundos = interaction.options.getInteger('segundos');
		const canal = interaction.options.getChannel('canal') || interaction.channel;

		if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
			return interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xff0000)
						.setTitle('⛔ Permiso denegado')
						.setDescription('No tenés permisos para modificar canales.')
				],
				ephemeral: true,
				flags: 1 << 6
			});
		}

		try {
			await canal.setRateLimitPerUser(segundos);

			const embed = new EmbedBuilder()
				.setColor(0x00bfff)
				.setTitle(segundos === 0 ? '🟢 Slowmode desactivado' : '🐌 Slowmode activado')
				.setDescription(`El slowmode fue ${segundos === 0 ? 'desactivado' : `configurado a ${segundos} segundos`} en ${canal}`)
				.setTimestamp()
				.setFooter({ text: interaction.user.username, iconURL: interaction.user.displayAvatarURL() });

			await interaction.reply({ embeds: [embed] });
		} catch (error) {
			console.error('Error configurando slowmode:', error);
			await interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xff0000)
						.setTitle('❌ Error')
						.setDescription('No se pudo aplicar el modo lento al canal.')
				],
				ephemeral: true,
				flags: 1 << 6
			});
		}
	}
};

