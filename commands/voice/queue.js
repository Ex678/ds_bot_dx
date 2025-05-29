const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Muestra la cola de reproducción actual.'),
  async execute(interaction) {
    try {
      // In a more robust setup, this would be accessed via interaction.client.musicManager or similar.
      const { guildQueues } = require('./play.js'); 
      // guildPlayers is not strictly needed here if currentTrack is reliably in queueData

      const queueData = guildQueues.get(interaction.guild.id);

      const queueEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Cola de Reproducción')
        .setTimestamp();

      let description = '';
      const currentTrack = queueData?.currentTrack;

      if (currentTrack) {
        description += `**Reproduciendo Ahora:**\n[${currentTrack.title}](${currentTrack.url}) (Pedido por: ${currentTrack.requester}) - Duración: ${currentTrack.duration}\n\n**Siguiente en la cola:**\n`;
      } else {
        description += '**Cola de reproducción:**\n';
      }

      if (!queueData || !queueData.tracks || queueData.tracks.length === 0) {
        if (currentTrack) {
          description += 'No hay más canciones en la cola.';
        } else {
          description = 'La cola está vacía y no hay nada reproduciéndose.';
        }
      } else {
        queueData.tracks.slice(0, 10).forEach((track, index) => {
          description += `${index + 1}. [${track.title}](${track.url}) (Pedido por: ${track.requester}) - Duración: ${track.duration}\n`;
        });
        if (queueData.tracks.length > 10) {
          description += `\n... y ${queueData.tracks.length - 10} más.`;
        }
      }
      
      queueEmbed.setDescription(description.substring(0, 4090));

      // Handle replies carefully for buttons vs slash commands
      if (interaction.replied || interaction.deferred) {
        // If interaction was deferred (e.g. by button handler in index.js), use followUp.
        // Buttons handled in index.js usually deferUpdate, then followUp ephemerally.
        await interaction.followUp({ embeds: [queueEmbed], ephemeral: true });
      } else {
        // For direct slash command, reply directly.
        await interaction.reply({ embeds: [queueEmbed], ephemeral: interaction.isButton() }); // Ephemeral if button, public if slash
      }

    } catch (error) {
      console.error(`[Queue Command] Error displaying queue: ${error.message}`, error);
      const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription('Ocurrió un error al mostrar la cola.');
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },
};
