const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('decir')
    .setDescription('Hace que el bot diga algo.')
    .addStringOption(option =>
      option.setName('mensaje')
        .setDescription('El mensaje que dirá el bot.')
        .setRequired(true)),
  async execute(interaction) {
    const mensaje = interaction.options.getString('mensaje');

    const embed = new EmbedBuilder()
      .setTitle('📣 El bot dice:')
      .setDescription(mensaje)
      .setColor(0x0099FF); // A nice blue color

    await interaction.reply({ embeds: [embed] });
  },
};
