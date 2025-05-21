const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Elimina mensajes de un canal.')
    .addIntegerOption(option =>
      option.setName('cantidad')
        .setDescription('Cantidad de mensajes a eliminar (máx. 100)')
        .setRequired(true)),

  async execute(interaction) {
    const cantidad = interaction.options.getInteger('cantidad');

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return interaction.reply({
        content: '❌ No tenés permiso para borrar mensajes.',
        flags: 64
      });
    }

    if (cantidad < 1 || cantidad > 100) {
      return interaction.reply({
        content: '❌ Solo podés borrar entre 1 y 100 mensajes.',
        flags: 64
      });
    }

    const { size } = await interaction.channel.bulkDelete(cantidad, true);

    const embed = new EmbedBuilder()
      .setColor(0x7289DA)
      .setTitle('🧹 Mensajes Borrados')
      .setDescription(`Se borraron **${size}** mensajes.`)
      .setTimestamp()
      .setFooter({ text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};

