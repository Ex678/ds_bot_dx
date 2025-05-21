const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('unban')
		.setDescription('Desbanea a un usuario por su ID')
		.addStringOption(option =>
			option.setName('id')
				.setDescription('ID del usuario a desbanear')
				.setRequired(true)),

	async execute(interaction) {
		const userId = interaction.options.getString('id');

		if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
			return interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xff0000)
						.setTitle('⛔ Permiso denegado')
						.setDescription('No tenés permisos para desbanear miembros.')
				],
				ephemeral: true,
				flags: 1 << 6
			});
		}

		try {
			await interaction.guild.bans.remove(userId);

			const embed = new EmbedBuilder()
				.setColor(0x00ff00)
				.setTitle('✅ Usuario desbaneado')
				.setDescription(`El usuario con ID \`${userId}\` fue desbaneado con éxito.`)
				.setTimestamp()
				.setFooter({ text: interaction.user.username, iconURL: interaction.user.displayAvatarURL() });

			await interaction.reply({ embeds: [embed] });
		} catch (error) {
			console.error('Error desbaneando:', error);

			await interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(0xff0000)
						.setTitle('❌ Error')
						.setDescription(`No se pudo desbanear al usuario con ID \`${userId}\`.`)
				],
				ephemeral: true,
				flags: 1 << 6
			});
		}
	}
};

