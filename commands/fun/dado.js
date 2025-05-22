const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dado')
    .setDescription('Lanza un dado.')
    .addIntegerOption(option =>
      option.setName('caras')
        .setDescription('Número de caras del dado (defecto: 6)')
        .setRequired(false)), // Optional, so false
  async execute(interaction) {
    const caras = interaction.options.getInteger('caras') || 6; // Default to 6 if not provided
    const resultado = Math.floor(Math.random() * caras) + 1;

    const embed = new EmbedBuilder()
      .setTitle('🎲 Tirada de Dado')
      .addFields(
        { name: 'Lanzamiento', value: `Un dado de ${caras} caras`, inline: true },
        { name: 'Resultado', value: `${resultado}`, inline: true }
      )
      .setColor(0x00FF00); // A green color

    await interaction.reply({ embeds: [embed] });
  },
};
