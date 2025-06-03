import { SlashCommandBuilder } from 'discord.js';
import { joinVoiceChannel } from '@discordjs/voice';

export const data = new SlashCommandBuilder()
    .setName('join')
    .setDescription('Une el bot al canal de voz');

export async function execute(interaction) {
    // Verificar si el usuario está en un canal de voz
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
        return interaction.reply({
            content: '❌ Necesitas estar en un canal de voz para usar este comando.',
            ephemeral: true
        });
    }

    try {
        // Unirse al canal de voz
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
        });

        await interaction.reply(`✅ Me he unido a ${voiceChannel.name}`);
    } catch (error) {
        console.error('Error al unirse al canal de voz:', error);
        await interaction.reply({
            content: '❌ Hubo un error al intentar unirme al canal de voz.',
            ephemeral: true
        });
    }
}
