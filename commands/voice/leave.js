const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getVoiceConnection, VoiceConnectionStatus } = require('@discordjs/voice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Hace que el bot abandone el canal de voz actual y limpia la cola.'),
  async execute(interaction) {
    const connection = getVoiceConnection(interaction.guild.id);

    if (!connection) {
      const errorEmbed = new EmbedBuilder().setColor(0xFFCC00).setDescription('No estoy en ningún canal de voz en este servidor.');
      return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    try {
      if (connection.state.status === VoiceConnectionStatus.Destroyed) {
         const infoEmbed = new EmbedBuilder().setColor(0x0099FF).setDescription('Ya me he desconectado o estoy en proceso de ello.');
         return interaction.reply({ embeds: [infoEmbed], ephemeral: true });
      }

      // The actual cleanup of guildPlayers and guildQueues map entries
      // should be handled by the VoiceConnectionStatus.Destroyed listener in play.js.
      // This command just needs to initiate the destruction of the connection.
      // Stopping the player and clearing local queue tracks explicitly here is a good immediate measure.
      
      const { guildPlayers, guildQueues } = require('./play.js'); // Still need to access for immediate stop/clear.
      const player = guildPlayers.get(interaction.guild.id);
      if (player) {
        player.stop(true); // Stop playback immediately.
      }

      const queueData = guildQueues.get(interaction.guild.id);
      if (queueData) {
        queueData.tracks = []; // Clear tracks array.
        queueData.currentTrack = null; // Clear current track.
        if (queueData.nowPlayingMessage) {
            queueData.nowPlayingMessage.delete().catch(err => console.warn(`[Leave Command] Failed to delete NP message: ${err.message}`));
            queueData.nowPlayingMessage = null;
        }
        // The queueData object itself will be deleted from the guildQueues map by the Destroyed listener in play.js
      }
      
      connection.destroy(); // This will trigger the Destroyed event listeners.
      
      const successEmbed = new EmbedBuilder().setColor(0x00FF00).setDescription('He abandonado el canal de voz. La cola ha sido limpiada y la música detenida.');
      await interaction.reply({ embeds: [successEmbed], ephemeral: true });

    } catch (error) {
      console.error(`[Voice Leave Error] Could not leave voice channel or clean up: ${error.message}`, error);
      const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription('Ocurrió un error al intentar abandonar el canal de voz.');
      // Check if interaction has already been replied to, which can happen if an error occurs after an initial reply.
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },
};
