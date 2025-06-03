import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';

export const data = new SlashCommandBuilder()
	.setName('unban')
	.setDescription('Desbanea a un usuario del servidor')
	.addStringOption(option =>
		option.setName('id')
			.setDescription('ID del usuario a desbanear')
			.setRequired(true));

export async function execute(interaction) {
	// Verificar permisos
	if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
		return interaction.reply({
			content: '❌ No tienes permisos para desbanear usuarios.',
			ephemeral: true
		});
	}

	const userId = interaction.options.getString('id');

	try {
		// Intentar desbanear al usuario
		await interaction.guild.members.unban(userId);
		await interaction.reply(`✅ Usuario con ID ${userId} ha sido desbaneado.`);
	} catch (error) {
		console.error('Error al desbanear:', error);
		await interaction.reply({
			content: '❌ No se pudo desbanear al usuario. Verifica que el ID sea correcto y que el usuario esté baneado.',
			ephemeral: true
		});
	}
}

