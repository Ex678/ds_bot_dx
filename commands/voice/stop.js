const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getVoiceConnection } = require('@discordjs/voice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Detiene la música y limpia la cola de reproducción.'),
  async execute(interaction) {
    const connection = getVoiceConnection(interaction.guild.id);
    if (!connection) {
      const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription('No estoy en un canal de voz.');
      return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    try {
      const { guildPlayers, guildQueues } = require('./play.js'); 

      const player = guildPlayers.get(interaction.guild.id);
      const queueData = guildQueues.get(interaction.guild.id);

      if (player) {
        player.stop(true); 
        // Player map entry is cleaned up by VoiceConnection.Destroyed listener in play.js if connection is also destroyed (e.g. by /leave)
        // If only stopping, player object remains for potential reuse.
      }

      if (queueData) {
        queueData.tracks = []; // Clear the tracks array
        queueData.currentTrack = null; // Clear current track
        if (queueData.nowPlayingMessage) {
            queueData.nowPlayingMessage.delete().catch(err => console.warn("[Stop Command] Failed to delete NP message:", err.message));
            queueData.nowPlayingMessage = null;
        }
        // The queueData object itself (and its entry in guildQueues map) is cleared by VoiceConnection.Destroyed or /leave.
        // Here, we only empty its contents.
      }
      
      const replyEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setDescription('⏹️ Música detenida y cola limpiada. Si quieres que me vaya del canal, usa `/leave`.');

      // Handle reply/followUp correctly, especially for button interactions
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [replyEmbed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [replyEmbed], ephemeral: true }); // Ephemeral for slash command too for less chat clutter
      }

    } catch (error) {
      console.error(`[Stop Command] Error stopping music: ${error.message}`, error);
      const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription('Ocurrió un error al intentar detener la música.');
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },
};
