import { SlashCommandBuilder } from 'discord.js';
import { updateGuildSettings, getGuildSettings } from '../../utils/storage.js';

export const data = new SlashCommandBuilder()
    .setName('setlevelchannel')
    .setDescription('Configura el canal para anuncios de nivel')
    .addChannelOption(option =>
        option.setName('canal')
            .setDescription('El canal donde se enviarán los anuncios de nivel')
            .setRequired(true));

export async function execute(interaction) {
    if (!interaction.member.permissions.has('MANAGE_GUILD')) {
        return await interaction.reply({
            content: '❌ No tienes permisos para usar este comando.',
            ephemeral: true
        });
    }

    const channel = interaction.options.getChannel('canal');

    // Verificar que es un canal de texto
    if (!channel.isTextBased()) {
        return await interaction.reply({
            content: '❌ Por favor, selecciona un canal de texto.',
            ephemeral: true
        });
    }

    const currentSettings = getGuildSettings(interaction.guildId);
    const newSettings = {
        ...currentSettings,
        levelUpChannel: channel.id
    };

    try {
        updateGuildSettings(interaction.guildId, newSettings);
        await interaction.reply({
            content: `✅ Los anuncios de nivel se enviarán en ${channel}.`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error al configurar canal de niveles:', error);
        await interaction.reply({
            content: '❌ Hubo un error al configurar el canal.',
            ephemeral: true
        });
    }
} 