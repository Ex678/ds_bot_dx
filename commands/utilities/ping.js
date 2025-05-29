const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Responde con "Pong!"'),

  async execute(interaction) {
    try {
      await interaction.deferReply();
      
      // Simulamos un pequeño retraso para mostrar el tiempo de respuesta real
      const sent = await interaction.editReply('Pong!');
      const timeDiff = sent.createdTimestamp - interaction.createdTimestamp;
      
      await interaction.editReply(`🏓 Pong!\nLatencia del bot: ${timeDiff}ms\nLatencia de la API: ${Math.round(interaction.client.ws.ping)}ms`);
    } catch (error) {
      console.error('[PING] Error executing command:', error);
      
      // Solo intentar enviar mensaje de error si no es un error de interacción
      if (error.code !== 40060 && error.code !== 10062) {
        try {
          if (!interaction.replied && interaction.deferred) {
            await interaction.editReply('¡Hubo un error al ejecutar este comando!');
          } else if (!interaction.replied) {
            await interaction.reply({ content: '¡Hubo un error al ejecutar este comando!', ephemeral: true });
          }
        } catch (e) {
          console.error('[PING] Error sending error response:', e);
        }
      }
    }
  },
};
