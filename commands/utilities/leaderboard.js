import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getUserData } from '../../utils/storage.js';

// Constantes para emojis y colores
const EMOJIS = {
    TROPHY: '🏆',
    CROWN: '👑',
    MEDAL: {
        FIRST: '🥇',
        SECOND: '🥈',
        THIRD: '🥉',
        OTHER: '🏅'
    },
    LEVEL: '⭐',
    XP: '✨',
    MESSAGE: '💬',
    PAGE: '📄',
    ERROR: '❌',
    SPARKLES: '✨',
    CHART: '📊'
};

const COLORS = {
    GOLD: 0xFFD700,
    SILVER: 0xC0C0C0,
    BRONZE: 0xCD7F32,
    ERROR: 0xFF0000
};

export const data = new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Muestra la tabla de clasificación del servidor');

export async function execute(interaction) {
    try {
        // Obtener todos los miembros del servidor
        const members = await interaction.guild.members.fetch();
        
        // Obtener datos de XP de cada miembro
        const userDataArray = members.map(member => ({
            ...getUserData(member.id, interaction.guildId),
            user: member.user
        }));

        // Ordenar por XP
        const sortedUsers = userDataArray
            .sort((a, b) => b.xp - a.xp)
            .slice(0, 10);

        // Crear el embed
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🏆 Tabla de Clasificación')
            .setDescription('Los 10 usuarios con más XP en el servidor')
            .setThumbnail(interaction.guild.iconURL())
            .setTimestamp();

        // Añadir los usuarios al embed
        const leaderboardText = sortedUsers
            .map((userData, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
                return `${medal} **${index + 1}.** ${userData.user.toString()}
                       Nivel: ${userData.level} • XP: ${userData.xp}`;
            })
            .join('\n\n');

        embed.setDescription(leaderboardText || 'No hay usuarios en la clasificación.');

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error('Error al obtener la tabla de clasificación:', error);
        await interaction.reply({
            content: '❌ Hubo un error al obtener la tabla de clasificación.',
            ephemeral: true
        });
    }
} 