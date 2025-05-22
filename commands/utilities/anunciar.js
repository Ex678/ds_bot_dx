const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('anunciar')
    .setDescription('Envía un anuncio a un canal específico o al actual.')
    .addStringOption(option =>
      option.setName('mensaje')
        .setDescription('El mensaje del anuncio.')
        .setRequired(true))
    .addChannelOption(option =>
      option.setName('canal')
        .setDescription('El canal donde enviar el anuncio.')
        .addChannelTypes(ChannelType.GuildText) // Only allow text channels
        .setRequired(false)),

  async execute(interaction) {
    // 1. Permission Check
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      const permEmbed = new EmbedBuilder()
        .setTitle('❌ Permiso Denegado')
        .setDescription('No tenés permiso para enviar anuncios.')
        .setColor(0xFF0000) // Red
        .setTimestamp();
      return interaction.reply({ embeds: [permEmbed], ephemeral: true });
    }

    const mensaje = interaction.options.getString('mensaje');
    const targetChannelOption = interaction.options.getChannel('canal');
    const targetChannel = targetChannelOption || interaction.channel;

    // 2. Create Announcement Embed
    const announcementEmbed = new EmbedBuilder()
      .setTitle('📢 Anuncio')
      .setDescription(mensaje)
      .setColor(0xFFD700) // Gold color for announcement
      .setFooter({ text: `Anunciado por: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();

    // 3. Send Announcement and Handle Errors
    try {
      await targetChannel.send({ embeds: [announcementEmbed] });

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Anuncio Enviado')
        .setDescription(`Anuncio enviado correctamente al canal ${targetChannel}.`)
        .setColor(0x00FF00) // Green
        .setTimestamp();
      await interaction.reply({ embeds: [successEmbed], ephemeral: true });

    } catch (error) {
      console.error('Error al enviar el anuncio:', error);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Error al Enviar')
        .setDescription(`No se pudo enviar el anuncio al canal ${targetChannel}. Verifica mis permisos en ese canal.`)
        .setColor(0xFF0000) // Red
        .setTimestamp();
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },
};
