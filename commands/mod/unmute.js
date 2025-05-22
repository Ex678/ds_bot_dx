const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Quita el silencio a un usuario.')
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('El usuario a quien quitar el silencio.')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('razon')
        .setDescription('Razón para quitar el silencio.')
        .setRequired(false)),

  async execute(interaction) {
    // 1. Permission Check
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      const permEmbed = new EmbedBuilder()
        .setTitle('❌ Permiso Denegado')
        .setDescription('No tenés permiso para quitar silencios.')
        .setColor(0xFF0000) // Red
        .setTimestamp();
      return interaction.reply({ embeds: [permEmbed], ephemeral: true });
    }

    const targetMember = interaction.options.getMember('usuario');
    const reason = interaction.options.getString('razon') || 'Sin razón especificada';

    // 2. Target Exists Check
    if (!targetMember) {
      const noMemberEmbed = new EmbedBuilder()
        .setTitle('❌ Usuario no Encontrado')
        .setDescription('No pude encontrar al usuario especificado.')
        .setColor(0xFF0000) // Red
        .setTimestamp();
      return interaction.reply({ embeds: [noMemberEmbed], ephemeral: true });
    }

    // 3. Is Muted Check
    if (!targetMember.isCommunicationDisabled()) {
      const notMutedEmbed = new EmbedBuilder()
        .setTitle('🔊 Usuario No Silenciado')
        .setDescription('Este usuario no está silenciado.')
        .setColor(0x0099FF) // Blue for informational
        .setTimestamp();
      return interaction.reply({ embeds: [notMutedEmbed], ephemeral: true });
    }

    // 4. Unmute Operation
    try {
      await targetMember.timeout(null, reason); // Setting duration to null removes timeout

      const successEmbed = new EmbedBuilder()
        .setTitle('🔊 Usuario Desilenciado')
        .addFields(
          { name: 'Usuario', value: targetMember.user.tag, inline: true },
          { name: 'Razón', value: reason, inline: false }
        )
        .setColor(0x00FF00) // Green
        .setThumbnail(targetMember.user.displayAvatarURL())
        .setTimestamp();
      await interaction.reply({ embeds: [successEmbed] });

    } catch (error) {
      console.error('Error al quitar el silencio al usuario:', error);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Error al Quitar Silencio')
        .setDescription('Hubo un error al intentar quitar el silencio al usuario. Revisa mis permisos.')
        .setColor(0xFF0000) // Red
        .setTimestamp();
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },
};
