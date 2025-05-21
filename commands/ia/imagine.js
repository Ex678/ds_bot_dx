const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const OpenAI = require('openai');
const { openaiApiKey } = require('../../config.json');

const openai = new OpenAI({
  apiKey: openaiApiKey,
});

module.exports = {
  data: new SlashCommandBuilder()
    .setName('imagen')
    .setDescription('Genera una imagen usando inteligencia artificial')
    .addStringOption(option =>
      option.setName('descripcion')
        .setDescription('Describe la imagen que quieres generar')
        .setRequired(true)),

  async execute(interaction) {
    const prompt = interaction.options.getString('descripcion');
    await interaction.deferReply();

    try {
      const response = await openai.images.generate({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
        response_format: 'url'
      });

      const imageUrl = response.data[0].url;

      const embed = new EmbedBuilder()
        .setColor(0x2F3136)
        .setTitle('🖼️ Imagen Generada con IA')
        .setDescription(`**Prompt:** ${prompt}`)
        .setImage(imageUrl)
        .setFooter({ text: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Error generando imagen:', error);
      await interaction.editReply('❌ Ocurrió un error al generar la imagen.');
    }
  }
};

