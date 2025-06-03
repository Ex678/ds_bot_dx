// slowmode.js
import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';

export const data = new SlashCommandBuilder()
	.setName('slowmode')
	.setDescription('Establece el modo lento en el canal')
	.addIntegerOption(option =>
		option.setName('segundos')
			.setDescription('Segundos entre mensajes (0 para desactivar)')
			.setRequired(true)
			.setMinValue(0)
			.setMaxValue(21600));

export async function execute(interaction) {
	// Verificar permisos
	if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
		return interaction.reply({
			content: '❌ No tienes permisos para gestionar canales.',
			ephemeral: true
		});
	}

	const segundos = interaction.options.getInteger('segundos');

	try {
		await interaction.channel.setRateLimitPerUser(segundos);
		
		if (segundos === 0) {
			await interaction.reply('✅ Modo lento desactivado en este canal.');
		} else {
			await interaction.reply(`✅ Modo lento establecido a ${segundos} segundos en este canal.`);
		}
	} catch (error) {
		console.error('Error al establecer el modo lento:', error);
		await interaction.reply({
			content: '❌ No se pudo establecer el modo lento en este canal.',
			ephemeral: true
		});
	}
}

