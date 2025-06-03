import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getQueue } from '../../features/music/musicSystem.js';

export const data = new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Muestra la cola de reproducción actual');

export async function execute(interaction) {
    try {
        const queueData = getQueue(interaction.guildId);
        
        if (!queueData || !queueData.tracks || queueData.tracks.length === 0) {
            if (!queueData?.currentTrack) {
                return interaction.reply({ content: '❌ ¡No hay canciones en la cola!', ephemeral: true });
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('🎵 Cola de Reproducción')
            .setTimestamp();

        // Añadir la canción actual
        if (queueData.currentTrack) {
            embed.addFields({
                name: '▶️ Reproduciendo ahora:',
                value: `**${queueData.currentTrack.title}**\nSolicitado por: ${queueData.currentTrack.requestedBy}`
            });
        }

        // Añadir las siguientes canciones
        if (queueData.tracks.length > 0) {
            const nextSongs = queueData.tracks
                .slice(0, 10)
                .map((track, index) => `${index + 1}. **${track.title}**\nSolicitado por: ${track.requestedBy}`)
                .join('\n\n');

            embed.addFields({
                name: '📋 Siguientes canciones:',
                value: nextSongs
            });

            if (queueData.tracks.length > 10) {
                embed.setFooter({ text: `Y ${queueData.tracks.length - 10} canciones más...` });
            }
        }

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error('[Queue Command] Error:', error);
        await interaction.reply({ 
            content: '❌ ¡Hubo un error al mostrar la cola!', 
            ephemeral: true 
        });
    }
} 