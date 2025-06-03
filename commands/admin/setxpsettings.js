import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { updateGuildSettings } from '../../database.js';

export const data = new SlashCommandBuilder()
    .setName('setxpsettings')
    .setDescription('Configura los ajustes del sistema de XP')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption(option =>
        option.setName('xp_base')
            .setDescription('XP base por mensaje')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100))
    .addIntegerOption(option =>
        option.setName('cooldown')
            .setDescription('Tiempo en segundos entre mensajes que dan XP')
            .setRequired(true)
            .setMinValue(10)
            .setMaxValue(3600));

export async function execute(interaction) {
    try {
        const xpPerMessage = interaction.options.getInteger('xp_base');
        const cooldown = interaction.options.getInteger('cooldown');

        await updateGuildSettings(interaction.guild.id, {
            xp_per_message: xpPerMessage,
            xp_cooldown_seconds: cooldown
        });

        await interaction.reply({
            content: `✅ Configuración actualizada:\n` +
                `• XP base por mensaje: **${xpPerMessage}**\n` +
                `• Cooldown entre mensajes: **${cooldown}** segundos`,
            ephemeral: true
        });

    } catch (error) {
        console.error('[SetXPSettings] Error:', error);
        await interaction.reply({
            content: '❌ Ocurrió un error al configurar los ajustes de XP.',
            ephemeral: true
        });
    }
} 