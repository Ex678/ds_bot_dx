const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionsBitField } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, entersState, VoiceConnectionStatus } = require('@discordjs/voice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('Hace que el bot se una a un canal de voz.')
    .addChannelOption(option =>
      option.setName('canal')
        .setDescription('Canal de voz al que unirse')
        .addChannelTypes(ChannelType.GuildVoice)
        .setRequired(false)
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const targetChannel = interaction.options.getChannel('canal') || interaction.member.voice.channel;

    if (!targetChannel) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('No estás en un canal de voz ni especificaste uno.')] });
    }

    if (targetChannel.type !== ChannelType.GuildVoice && targetChannel.type !== ChannelType.GuildStageVoice) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('Ese canal no es de voz válido.')] });
    }

    const permissions = targetChannel.permissionsFor(interaction.client.user);
    if (!permissions.has(PermissionsBitField.Flags.Connect) || !permissions.has(PermissionsBitField.Flags.Speak)) {
      return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription('No tengo permisos para unirme y hablar en ese canal.')] });
    }

    const oldConnection = getVoiceConnection(interaction.guild.id);
    if (oldConnection) oldConnection.destroy();

    try {
      const connection = joinVoiceChannel({
        channelId: targetChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: true
      });

      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
          ]);
        } catch {
          connection.destroy();
        }
      });

      await entersState(connection, VoiceConnectionStatus.Ready, 15_000);

      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0x00FF00).setDescription(`¡Conectado a **${targetChannel.name}**!`)]
      });

    } catch (err) {
      console.error('Error al conectar:', err);
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(`❌ Error al unirme: ${err.message}`)]
      });
    }
  }
};
