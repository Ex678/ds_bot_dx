const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Banea a un usuario del servidor.')
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('El usuario a banear')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('razon')
        .setDescription('Razón del baneo')
        .setRequired(false)),

  async execute(interaction) {
    const member = interaction.options.getMember('usuario');
    const reason = interaction.options.getString('razon') || 'Sin razón especificada';

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return interaction.reply({
        content: '❌ No tenés permiso para banear.',
        flags: 64
      });
    }

    if (!member.bannable) {
      return interaction.reply({
        content: '❌ No puedo banear a ese usuario.',
        flags: 64
      });
    }

    await member.ban({ reason });

    const embed = new EmbedBuilder()
      .setColor(0x8B0000)
      .setTitle('🔨 Usuario Baneado')
      .addFields(
        { name: 'Usuario', value: `${member.user.tag}`, inline: true },
        { name: 'Razón', value: reason, inline: true }
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

