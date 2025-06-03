import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { updateGuildSettings } from '../../database.js';

export const data = new SlashCommandBuilder()
    .setName('setlevelchannel')
    .setDescription('Configura el canal donde se anunciarán las subidas de nivel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
        option.setName('canal')
            .setDescription('El canal donde se enviarán los anuncios de nivel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true));

export async function execute(interaction) {
    try {
        const channel = interaction.options.getChannel('canal');

        // Verificar permisos del bot en el canal
        const permissions = channel.permissionsFor(interaction.guild.members.me);
        if (!permissions.has('SendMessages') || !permissions.has('ViewChannel')) {
            return interaction.reply({
                content: '❌ No tengo permisos para enviar mensajes en ese canal.',
                ephemeral: true
            });
        }

        await updateGuildSettings(interaction.guild.id, {
            level_up_channel_id: channel.id
        });

        await interaction.reply({
            content: `✅ Los anuncios de nivel se enviarán en ${channel}.`,
            ephemeral: true
        });

    } catch (error) {
        console.error('[SetLevelChannel] Error:', error);
        await interaction.reply({
            content: '❌ Ocurrió un error al configurar el canal.',
            ephemeral: true
        });
    }
} 