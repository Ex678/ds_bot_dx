import { SlashCommandBuilder } from 'discord.js';
import { playSong } from '../../features/music/musicSystem.js';

export const data = new SlashCommandBuilder()
    .setName('play')
    .setDescription('Reproduce una canción de YouTube')
    .addStringOption(option =>
        option.setName('busqueda')
            .setDescription('Nombre o URL de la canción')
            .setRequired(true));

export async function execute(interaction) {
    try {
        const query = interaction.options.getString('busqueda');
        await playSong(interaction, query);
    } catch (error) {
        console.error('[Play Command] Error:', error);
        const errorMessage = error.message || '¡Hubo un error al reproducir la canción!';
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: `❌ ${errorMessage}`, ephemeral: true });
        } else {
            await interaction.reply({ content: `❌ ${errorMessage}`, ephemeral: true });
        }
    }
} 