const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, entersState, getVoiceConnection } = require('@discordjs/voice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('Hace que el bot se una a un canal de voz.')
    .addChannelOption(option =>
      option.setName('canal')
        .setDescription('El canal de voz al que unirse (opcional, por defecto tu canal actual)')
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildVoice)
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true }); 

    const targetChannelOption = interaction.options.getChannel('canal');
    let targetVoiceChannel;

    if (targetChannelOption) {
      // ChannelType.GuildVoice check is already handled by the slash command option type
      // but an explicit check here can be a safeguard if types were less strict.
      // if (targetChannelOption.type !== ChannelType.GuildVoice) {
      //   const errorEmbed = new EmbedBuilder().setColor(0xFFCC00).setDescription('El canal seleccionado no es un canal de voz. Por favor, selecciona un canal de voz válido.');
      //   return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      // }
      targetVoiceChannel = targetChannelOption;
    } else {
      targetVoiceChannel = interaction.member.voice.channel;
    }

    if (!targetVoiceChannel) {
      const errorEmbed = new EmbedBuilder().setColor(0xFFCC00).setDescription('No estás en un canal de voz y no has especificado uno. ¡Únete a un canal o especifica uno para que pueda unirme!');
      try { await interaction.editReply({ embeds: [errorEmbed] }); } catch (e) { console.error(`[Interaction Error] Failed to editReply for interaction ${interaction.id} (no target VC): ${e.message}`, e); }
      return;
    }

    // Check if the target channel is actually a voice channel (already ensured by addChannelTypes, but good practice)
    if (targetVoiceChannel.type !== ChannelType.GuildVoice) {
        const errorEmbed = new EmbedBuilder().setColor(0xFFCC00).setDescription('El canal especificado no es un canal de voz válido.');
        try { await interaction.editReply({ embeds: [errorEmbed] }); } catch (e) { console.error(`[Interaction Error] Failed to editReply for interaction ${interaction.id} (not a voice channel): ${e.message}`, e); }
        return;
    }

    const existingConnection = getVoiceConnection(interaction.guild.id);
    if (existingConnection) {
      if (existingConnection.joinConfig.channelId === targetVoiceChannel.id) {
        const infoEmbed = new EmbedBuilder().setColor(0x0099FF).setDescription(`Ya estoy conectado a **${targetVoiceChannel.name}**.`);
        try { await interaction.editReply({ embeds: [infoEmbed] }); } catch (e) { console.error(`[Interaction Error] Failed to editReply for interaction ${interaction.id} (already connected to target): ${e.message}`, e); }
        return;
      }
      const errorEmbed = new EmbedBuilder().setColor(0xFFCC00).setDescription(`Ya estoy en otro canal de voz en este servidor (${interaction.guild.channels.cache.get(existingConnection.joinConfig.channelId)?.name || 'canal desconocido'}). Usa \`/leave\` primero si quieres que me mueva.`);
      try { await interaction.editReply({ embeds: [errorEmbed] }); } catch (e) { console.error(`[Interaction Error] Failed to editReply for interaction ${interaction.id} (already connected elsewhere): ${e.message}`, e); }
      return;
    }
    
    if (!targetVoiceChannel.joinable) {
        const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(`No tengo permisos para unirme a **${targetVoiceChannel.name}**.`);
        try { await interaction.editReply({ embeds: [errorEmbed] }); } catch (e) { console.error(`[Interaction Error] Failed to editReply for interaction ${interaction.id} (not joinable): ${e.message}`, e); }
        return;
    }
    if (!targetVoiceChannel.speakable && targetVoiceChannel.type !== ChannelType.GuildStageVoice) { 
        const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(`No tengo permisos para hablar en **${targetVoiceChannel.name}**.`);
        try { await interaction.editReply({ embeds: [errorEmbed] }); } catch (e) { console.error(`[Interaction Error] Failed to editReply for interaction ${interaction.id} (not speakable): ${e.message}`, e); }
        return;
    }

    try {
      console.log(`[JOIN] Attempting to join voice channel. Guild ID: ${interaction.guild.id}, Channel ID: ${targetVoiceChannel.id}`);
      const connection = joinVoiceChannel({
        channelId: targetVoiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: true, 
        selfMute: false
      });
      console.log(`[JOIN] Voice channel joined, awaiting Ready state. Guild ID: ${interaction.guild.id}, Channel ID: ${targetVoiceChannel.id}`);

      connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
        console.warn(`[Voice Connection] Disconnected from ${targetVoiceChannel.name} (Guild: ${interaction.guild.name}). State: ${newState.status}`);
        // More robust handling could be added here, e.g., attempting reconnects for certain disconnect reasons
      });
      
      connection.on(VoiceConnectionStatus.Destroyed, () => {
        console.log(`[Voice Connection] Connection explicitly destroyed for ${targetVoiceChannel.name} (Guild: ${interaction.guild.name}). Cleanup should occur via play.js listeners.`);
      });

      await entersState(connection, VoiceConnectionStatus.Ready, 20_000); 
      console.log(`[JOIN] Voice connection Ready. Guild ID: ${interaction.guild.id}, Channel ID: ${targetVoiceChannel.id}`);
      const successEmbed = new EmbedBuilder().setColor(0x00FF00).setDescription(`¡Conectado a **${targetVoiceChannel.name}**!`);
      try { await interaction.editReply({ embeds: [successEmbed] }); } catch (e) { console.error(`[Interaction Error] Failed to editReply for interaction ${interaction.id} (join success): ${e.message}`, e); }

    } catch (error) {
      console.error(`[JOIN] Failed to reach Ready state for voice connection. Guild ID: ${interaction.guild.id}, Channel ID: ${targetVoiceChannel.id}. Error: ${error.message}`, error);
      const currentConnection = getVoiceConnection(interaction.guild.id);
      if (currentConnection && currentConnection.state.status !== VoiceConnectionStatus.Destroyed) {
        currentConnection.destroy();
      }
      const errorEmbed = new EmbedBuilder().setColor(0xFF0000).setDescription(`No me pude conectar a **${targetVoiceChannel.name}**. Asegúrate de que tengo los permisos correctos y que el canal es accesible.`);
      try { await interaction.editReply({ embeds: [errorEmbed] }); } catch (e) { console.error(`[Interaction Error] Failed to editReply for interaction ${interaction.id} (join fail): ${e.message}`, e); }
    }
  },
};
