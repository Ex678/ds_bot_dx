const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getVoiceConnection, AudioPlayerStatus } = require('@discordjs/voice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Salta la canción actual.'),
  async execute(interaction) {
    const connection = getVoiceConnection(interaction.guild.id);
    if (!connection) {
      const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription('No estoy en un canal de voz.');
      return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const player = connection.state.subscription?.player;

    if (!player || player.state.status === AudioPlayerStatus.Idle) {
      const errorEmbed = new EmbedBuilder().setColor(0xFFCC00).setDescription('No hay nada reproduciendo actualmente para saltar.');
      return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    try {
      const oldStateStatus = player.state.status;
      player.stop(); 
      
      if (oldStateStatus !== AudioPlayerStatus.Idle) {
        const successEmbed = new EmbedBuilder().setColor(0x00FF00).setDescription('⏭️ Canción saltada.');
        // If the interaction is from a button, it might have been deferredUpdate.
        // A new reply is appropriate here, or followUp if the original interaction was deferred.
        if (interaction.isButton()) {
            // For buttons, we might want to send a new message or just update the original "Now Playing"
            // For simplicity now, we'll just reply ephemerally.
            // The 'idle' handler in play.js will announce the next track.
            await interaction.reply({ embeds: [successEmbed], ephemeral: true });
        } else {
            await interaction.reply({ embeds: [successEmbed] });
        }
      } else {
        const infoEmbed = new EmbedBuilder().setColor(0xFFCC00).setDescription('No había nada reproduciéndose, pero intenté saltar.');
        await interaction.reply({ embeds: [infoEmbed], ephemeral: true });
      }
      
    } catch (error) {
      console.error(`[Skip Command] Error skipping track: ${error.message}`, error);
      const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription('Ocurrió un error al intentar saltar la canción.');
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  },
};
