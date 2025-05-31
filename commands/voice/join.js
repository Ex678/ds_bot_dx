const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('Hace que el bot se una a un canal de voz.')
    .addChannelOption(option =>
      option.setName('canal')
        .setDescription('Canal de voz al que unirse (opcional)')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildVoice)
    ),
  
  async execute(interaction) {
    const channel = interaction.options.getChannel('canal') || interaction.member.voice.channel;

    if (!channel) {
      return interaction.reply({ content: '❌ No estás en un canal de voz ni especificaste uno.', ephemeral: true });
    }

    // Unirse al canal
    joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true
    });

    await interaction.reply({ content: `✅ Me uní a **${channel.name}**.`, ephemeral: true });
  }
};
