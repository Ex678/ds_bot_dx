import { SlashCommandBuilder } from 'discord.js';
import { updateGuildSettings, getGuildSettings } from '../../utils/storage.js';

export const data = new SlashCommandBuilder()
    .setName('setxpsettings')
    .setDescription('Configura los ajustes de XP del servidor')
    .addIntegerOption(option =>
        option.setName('xp_por_mensaje')
            .setDescription('Cantidad de XP base por mensaje')
            .setMinValue(1)
            .setMaxValue(100))
    .addIntegerOption(option =>
        option.setName('cooldown')
            .setDescription('Tiempo en segundos entre mensajes que dan XP')
            .setMinValue(10)
            .setMaxValue(300));

export async function execute(interaction) {
    if (!interaction.member.permissions.has('MANAGE_GUILD')) {
        return await interaction.reply({
            content: '❌ No tienes permisos para usar este comando.',
            ephemeral: true
        });
    }

    const xpPerMessage = interaction.options.getInteger('xp_por_mensaje');
    const cooldown = interaction.options.getInteger('cooldown');

    const currentSettings = getGuildSettings(interaction.guildId);
    const newSettings = {
        ...currentSettings,
        xpSettings: {
            xpPerMessage: xpPerMessage || currentSettings.xpSettings.xpPerMessage,
            cooldown: cooldown || currentSettings.xpSettings.cooldown
        }
    };

    try {
        updateGuildSettings(interaction.guildId, newSettings);
        await interaction.reply({
            content: `✅ Configuración de XP actualizada:\n` +
                    `• XP por mensaje: ${newSettings.xpSettings.xpPerMessage}\n` +
                    `• Cooldown: ${newSettings.xpSettings.cooldown} segundos`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error al actualizar configuración de XP:', error);
        await interaction.reply({
            content: '❌ Hubo un error al actualizar la configuración.',
            ephemeral: true
        });
    }
} 