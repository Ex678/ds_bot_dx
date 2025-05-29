const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionsBitField } = require('discord.js');
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
    try {
      await interaction.deferReply({ ephemeral: true }); 
    
      const targetChannelOption = interaction.options.getChannel('canal');
      let targetVoiceChannel;

      if (targetChannelOption) {
        targetVoiceChannel = targetChannelOption;
      } else {
        targetVoiceChannel = interaction.member.voice.channel;
      }

      if (!targetVoiceChannel) {
        const errorEmbed = new EmbedBuilder().setColor(0xFFCC00).setDescription('No estás en un canal de voz y no has especificado uno. ¡Únete a un canal o especifica uno para que pueda unirme!');
        return await interaction.editReply({ embeds: [errorEmbed] });
      }

      // Verificación explícita de tipo de canal
      if (targetVoiceChannel.type !== ChannelType.GuildVoice && targetVoiceChannel.type !== ChannelType.GuildStageVoice) {
        const errorEmbed = new EmbedBuilder().setColor(0xFFCC00).setDescription('El canal especificado no es un canal de voz válido.');
        return await interaction.editReply({ embeds: [errorEmbed] });
      }

      // Verificar y registrar permisos explícitamente
      const permissions = targetVoiceChannel.permissionsFor(interaction.client.user);
      const permissionsInfo = {
        CONNECT: permissions.has(PermissionsBitField.Flags.Connect),
        SPEAK: permissions.has(PermissionsBitField.Flags.Speak),
        VIEW_CHANNEL: permissions.has(PermissionsBitField.Flags.ViewChannel),
        ADMINISTRATOR: permissions.has(PermissionsBitField.Flags.Administrator)
      };
      
      console.log(`[JOIN] Checking permissions for channel ${targetVoiceChannel.name} (${targetVoiceChannel.id}):`, permissionsInfo);

      // Verificar conexiones existentes
      const existingConnection = getVoiceConnection(interaction.guild.id);
      if (existingConnection) {
        if (existingConnection.joinConfig.channelId === targetVoiceChannel.id) {
          const infoEmbed = new EmbedBuilder().setColor(0x0099FF).setDescription(`Ya estoy conectado a **${targetVoiceChannel.name}**.`);
          return await interaction.editReply({ embeds: [infoEmbed] });
        }
        
        console.log(`[JOIN] Destroying existing connection to join a new channel`);
        existingConnection.destroy();
        // Pequeña pausa para asegurar que la conexión anterior se haya cerrado correctamente
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      try {
        console.log(`[JOIN] Attempting to join voice channel ${targetVoiceChannel.name} (${targetVoiceChannel.id})`);
        
        // Intentar crear la conexión
        const connection = joinVoiceChannel({
          channelId: targetVoiceChannel.id,
          guildId: interaction.guild.id,
          adapterCreator: interaction.guild.voiceAdapterCreator,
          selfDeaf: true,
          selfMute: false,
        });

        // Manejar desconexiones
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
          try {
            // Intentar reconectar
            await Promise.race([
              entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
              entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
          } catch (error) {
            // Si falla la reconexión, destruir
            console.warn(`[JOIN] Failed to reconnect, destroying connection:`, error);
            connection.destroy();
          }
        });

        // Esperar a que la conexión esté lista
        await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
        console.log(`[JOIN] Successfully connected to ${targetVoiceChannel.name}`);
        
        const successEmbed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setDescription(`¡Conectado exitosamente a **${targetVoiceChannel.name}**!`);
        
        return await interaction.editReply({ embeds: [successEmbed] });

      } catch (error) {
        console.error(`[JOIN] Failed to join voice channel:`, error);
        
        // Limpieza en caso de error
        const currentConnection = getVoiceConnection(interaction.guild.id);
        if (currentConnection) {
          currentConnection.destroy();
        }
        
        const errorEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('Error al conectar')
          .setDescription(`No pude conectarme a **${targetVoiceChannel.name}**.\nError: ${error.message}`)
          .setFooter({ text: 'Si el bot tiene permisos de administrador pero sigue fallando, reinicia el bot o el servidor de Discord.' });
        
        return await interaction.editReply({ embeds: [errorEmbed] });
      }
    } catch (error) {
      console.error(`[JOIN] Error executing command:`, error);
      // No intentar responder si el error es de interacción ya reconocida
      if (error.code !== 40060 && error.code !== 10062) {
        try {
          if (!interaction.replied && interaction.deferred) {
            await interaction.editReply({ content: 'Hubo un error al ejecutar el comando.' });
          } else if (!interaction.replied) {
            await interaction.reply({ content: 'Hubo un error al ejecutar el comando.', ephemeral: true });
          }
        } catch (e) {
          console.error('[JOIN] Error sending error response:', e);
        }
      }
    }
  },
};
