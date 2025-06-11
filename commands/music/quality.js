import { SlashCommandBuilder } from 'discord.js';
import { guildPlayers } from '../../features/music/musicSystem.js';

export const data = new SlashCommandBuilder()
    .setName('quality')
    .setDescription('Configura la calidad del audio')
    .addSubcommand(subcommand =>
        subcommand
            .setName('bitrate')
            .setDescription('Ajusta el bitrate del audio')
            .addIntegerOption(option =>
                option.setName('kbps')
                    .setDescription('Bitrate en kbps (64-384)')
                    .setRequired(true)
                    .setMinValue(64)
                    .setMaxValue(384)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('buffer')
            .setDescription('Ajusta el tamaño del buffer')
            .addIntegerOption(option =>
                option.setName('segundos')
                    .setDescription('Segundos de buffer (1-10)')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(10)));

export async function execute(interaction) {
    const { guildId } = interaction;
    const playerData = guildPlayers.get(guildId);

    if (!playerData || !playerData.isPlaying) {
        return interaction.reply({
            content: '❌ ¡No hay música reproduciéndose!',
            ephemeral: true
        });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
        switch (subcommand) {
            case 'bitrate': {
                const kbps = interaction.options.getInteger('kbps');
                
                // Actualizar el bitrate en las opciones de FFmpeg
                playerData.audioEffects.setBitrate(kbps);

                // Recrear el recurso de audio si hay uno activo
                if (playerData.currentResource) {
                    const newResource = playerData.audioEffects.createAudioStream(
                        playerData.currentResource.stream
                    );
                    playerData.player.play(newResource);
                }

                await interaction.reply({
                    content: `🎵 Bitrate ajustado a ${kbps}kbps`,
                    ephemeral: true
                });
                break;
            }

            case 'buffer': {
                const seconds = interaction.options.getInteger('segundos');
                const bufferSize = seconds * 1024 * 1024; // Convertir a bytes (aproximadamente)
                
                // Actualizar el tamaño del buffer para futuras reproducciones
                playerData.audioEffects.setBufferSize(bufferSize);

                await interaction.reply({
                    content: `📶 Tamaño del buffer ajustado a ${seconds} segundos`,
                    ephemeral: true
                });
                break;
            }
        }
    } catch (error) {
        console.error('[Quality Command] Error:', error);
        await interaction.reply({
            content: '❌ ¡Hubo un error al procesar el comando!',
            ephemeral: true
        });
    }
} 