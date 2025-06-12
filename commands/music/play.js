import { SlashCommandBuilder } from 'discord.js';
import { play_music, skip, stop, pause, resume, queue as showQueue, loop, volume } from '../../features/music/musicSystem.js';

export const data = new SlashCommandBuilder()
    .setName('music')
    .setDescription('Sistema de música')
    .addSubcommand(subcommand =>
        subcommand
            .setName('play')
            .setDescription('Reproduce una canción')
            .addStringOption(option =>
                option.setName('cancion')
                    .setDescription('URL o nombre de la canción')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('skip')
            .setDescription('Salta a la siguiente canción'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('stop')
            .setDescription('Detiene la reproducción'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('pause')
            .setDescription('Pausa la reproducción'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('resume')
            .setDescription('Reanuda la reproducción'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('queue')
            .setDescription('Muestra la cola de reproducción'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('loop')
            .setDescription('Activa/desactiva el modo bucle'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('volume')
            .setDescription('Ajusta el volumen')
            .addIntegerOption(option =>
                option.setName('nivel')
                    .setDescription('Nivel de volumen (0-200)')
                    .setRequired(true)
                    .setMinValue(0)
                    .setMaxValue(200)));

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
        switch (subcommand) {
            case 'play':
                const song = interaction.options.getString('cancion');
                await play_music(interaction, song);
                break;
            case 'skip':
                await skip(interaction);
                break;
            case 'stop':
                await stop(interaction);
                break;
            case 'pause':
                await pause(interaction);
                break;
            case 'resume':
                await resume(interaction);
                break;
            case 'queue':
                await showQueue(interaction);
                break;
            case 'loop':
                await loop(interaction);
                break;
            case 'volume':
                const level = interaction.options.getInteger('nivel');
                await volume(interaction, level);
                break;
        }
    } catch (error) {
        console.error('Error en comando de música:', error);
        await interaction.reply({ 
            content: '❌ Ocurrió un error al ejecutar el comando.',
            ephemeral: true 
        });
    }
} 