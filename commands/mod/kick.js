const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulsa a un miembro del servidor.')
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('El usuario a expulsar')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('razon')
        .setDescription('Razón del kick')
        .setRequired(false)),

  async execute(interaction) {
    const member = interaction.options.getMember('usuario');
    const reason = interaction.options.getString('razon') || 'Sin razón especificada';

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
      return interaction.reply({
        content: '❌ No tienes permiso para usar este comando.',
        flags: 64
      });
    }

    if (!member.kickable) {
      return interaction.reply({
        content: '❌ No puedo expulsar a ese usuario.',
        flags: 64
      });
    }

    await member.kick(reason);

    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('👢 Usuario Expulsado')
      .addFields(
        { name: 'Usuario', value: `${member.user.tag}`, inline: true },
        { name: 'Razón', value: reason, inline: true }
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
 
