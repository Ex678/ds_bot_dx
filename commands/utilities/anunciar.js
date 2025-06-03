import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ChannelType } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('anunciar')
    .setDescription('Envía un anuncio a un canal específico o al actual')
    .addStringOption(option =>
        option.setName('mensaje')
            .setDescription('El mensaje del anuncio')
            .setRequired(true))
    .addChannelOption(option =>
        option.setName('canal')
            .setDescription('El canal donde enviar el anuncio')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false));

export async function execute(interaction) {
    // Verificar permisos
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return interaction.reply({
            content: '❌ No tienes permisos para enviar anuncios.',
            ephemeral: true
        });
    }

    const mensaje = interaction.options.getString('mensaje');
    const targetChannelOption = interaction.options.getChannel('canal');
    const targetChannel = targetChannelOption || interaction.channel;

    // Crear embed del anuncio
    const announcementEmbed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('📢 Anuncio')
        .setDescription(mensaje)
        .setFooter({ 
            text: `Anunciado por: ${interaction.user.tag}`, 
            iconURL: interaction.user.displayAvatarURL() 
        })
        .setTimestamp();

    try {
        // Enviar el anuncio
        await targetChannel.send({ embeds: [announcementEmbed] });
        
        await interaction.reply({
            content: `✅ Anuncio enviado correctamente al canal ${targetChannel}.`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error al enviar el anuncio:', error);
        await interaction.reply({
            content: `❌ No se pudo enviar el anuncio al canal ${targetChannel}. Verifica mis permisos en ese canal.`,
            ephemeral: true
        });
    }
}
