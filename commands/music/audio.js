import { SlashCommandBuilder } from 'discord.js';
import { guildPlayers } from '../../features/music/musicSystem.js';

export default {
    data: new SlashCommandBuilder()
        .setName('audio')
        .setDescription('Controla el volumen de la música')
        .addNumberOption(option => 
            option.setName('volumen')
                .setDescription('Nivel de volumen (0-200%)')
                .setMinValue(0)
                .setMaxValue(200)
                .setRequired(true)),

    async execute(interaction) {
        const volume = interaction.options.getNumber('volumen');
        
        // Verificar si el bot está reproduciendo música
        const guildId = interaction.guildId;
        const playerData = guildPlayers.get(guildId);
        
        if (!playerData || !playerData.isPlaying) {
            return interaction.reply({
                content: '❌ No hay música reproduciéndose actualmente.',
                ephemeral: true
            });
        }

        try {
            // Ajustar el volumen del recurso actual
            if (playerData.currentResource && playerData.currentResource.resource) {
                playerData.currentResource.resource.volume.setVolume(volume / 100);
                await interaction.reply({
                    content: `🔊 Volumen ajustado al ${volume}%`,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: '❌ No se pudo ajustar el volumen.',
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Error al ajustar el volumen:', error);
            await interaction.reply({
                content: '❌ Ocurrió un error al ajustar el volumen.',
                ephemeral: true
            });
        }
    }
}; 