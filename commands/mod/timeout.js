const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Silencia temporalmente a un miembro.')
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('El usuario a silenciar')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('tiempo')
        .setDescription('Duración en minutos')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('razon')
        .setDescription('Razón del timeout')
        .setRequired(false)),

  async execute(interaction) {
    const member = interaction.options.getMember('usuario');
    const tiempo = interaction.options.getInteger('tiempo');
    const razon = interaction.options.getString('razon') || 'Sin razón especificada';

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return interaction.reply({
        content: '❌ No tienes permiso para usar este comando.',
        flags: 64
      });
    }

    if (!member.moderatable) {
      return interaction.reply({
        content: '❌ No puedo aplicar timeout a ese usuario.',
        flags: 64
      });
    }

    const duration = tiempo * 60 * 1000; // minutos a milisegundos

    await member.timeout(duration, razon);

    const embed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle('⏱️ Usuario Silenciado')
      .addFields(
        { name: 'Usuario', value: `${member.user.tag}`, inline: true },
        { name: 'Duración', value: `${tiempo} minutos`, inline: true },
        { name: 'Razón', value: razon }
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};

