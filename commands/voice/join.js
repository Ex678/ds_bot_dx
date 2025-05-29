const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, entersState, getVoiceConnection } = require('@discordjs/voice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('Hace que el bot se una a tu canal de voz.'),
  async execute(interaction) {
    const userVoiceChannel = interaction.member.voice.channel;

    if (!userVoiceChannel) {
      const errorEmbed = new EmbedBuilder().setColor(0xFFCC00).setDescription('Debes estar en un canal de voz para usar este comando.');
      return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    const existingConnection = getVoiceConnection(interaction.guild.id);
    if (existingConnection) {
      if (existingConnection.joinConfig.channelId === userVoiceChannel.id) {
        const infoEmbed = new EmbedBuilder().setColor(0x0099FF).setDescription('Ya estoy conectado a tu canal de voz.');
        return interaction.reply({ embeds: [infoEmbed], ephemeral: true });
      }
      const errorEmbed = new EmbedBuilder().setColor(0xFFCC00).setDescription('Ya estoy en un canal de voz en este servidor. Usa `/leave` primero si quieres que me mueva.');
      return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
    
    if (!userVoiceChannel.joinable) {
        const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription('No tengo permisos para unirme a tu canal de voz.');
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
    if (!userVoiceChannel.speakable) { // Though not speaking yet, good to check for future use
        const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription('No tengo permisos para hablar en tu canal de voz.');
        return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }

    try {
      const connection = joinVoiceChannel({
        channelId: userVoiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: true, // Bot mutes itself by default
        selfMute: false
      });

      connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
        console.warn(`[Voice Connection] Disconnected from ${userVoiceChannel.name} (Guild: ${interaction.guild.name}). State: ${newState.status}`);
        // This event can be triggered for various reasons (kicked, channel deleted, network issues).
        // A robust handler might try to reconnect or fully destroy the connection and clean up.
        // For now, we rely on the 'Destroyed' event (often triggered after 'Disconnected') for full cleanup via play.js.
        // If a more immediate cleanup is needed here, ensure it coordinates with play.js state.
        // Example: if (newState.status === VoiceConnectionStatus.Disconnected && newState.reason === VoiceConnectionDisconnectReason.WebSocketClose) connection.destroy();
      });
      
      connection.on(VoiceConnectionStatus.Destroyed, () => {
        console.log(`[Voice Connection] Connection explicitly destroyed for ${userVoiceChannel.name} (Guild: ${interaction.guild.name}). Cleanup should occur via play.js listeners.`);
      });

      await entersState(connection, VoiceConnectionStatus.Ready, 20_000); // Reduced timeout slightly
      const successEmbed = new EmbedBuilder().setColor(0x00FF00).setDescription(`¡Conectado a **${userVoiceChannel.name}**!`);
      await interaction.reply({ embeds: [successEmbed], ephemeral: true });

    } catch (error) {
      console.error(`[Voice Join Error] Could not join ${userVoiceChannel.name}: ${error.message}`, error);
      const currentConnection = getVoiceConnection(interaction.guild.id);
      if (currentConnection) {
        currentConnection.destroy();
      }
      const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription('No me pude conectar al canal de voz. Asegúrate de que tengo los permisos correctos y que el canal es accesible.');
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },
};
