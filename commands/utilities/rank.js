import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getUserData } from '../../utils/storage.js';

// Constantes para emojis y colores
const EMOJIS = {
    RANK: '👑',
    LEVEL: '⭐',
    XP: '✨',
    MESSAGE: '💬',
    PROGRESS: '📊',
    NEXT: '⏭️',
    ERROR: '❌',
    MEDAL: {
        FIRST: '🥇',
        SECOND: '🥈',
        THIRD: '🥉',
        OTHER: '🏅'
    },
    BAR: {
        START: '▰',    // Barra llena
        END: '▱',      // Barra vacía
    }
};

const COLORS = {
    GOLD: 0xFFD700,       // Para rangos altos (1-3)
    SILVER: 0xC0C0C0,     // Para rangos medios (4-10)
    BRONZE: 0xCD7F32,     // Para rangos bajos (11+)
    ERROR: 0xFF0000
};

export const data = new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Muestra tu nivel y experiencia actual')
    .addUserOption(option =>
        option.setName('usuario')
            .setDescription('Usuario del que quieres ver el rango (opcional)'));

export async function execute(interaction) {
    const targetUser = interaction.options.getUser('usuario') || interaction.user;
    const userData = getUserData(targetUser.id, interaction.guildId);

    const nextLevelXP = Math.floor(100 * Math.pow(1.2, userData.level));
    const progressPercent = Math.floor((userData.xp / nextLevelXP) * 100);
    const progressBar = createProgressBar(progressPercent);

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Rango de ${targetUser.username}`)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
            { name: '📊 Nivel', value: userData.level.toString(), inline: true },
            { name: '⭐ XP', value: `${userData.xp}/${nextLevelXP}`, inline: true },
            { name: '📈 Progreso', value: progressBar }
        )
        .setFooter({ text: `${progressPercent}% completado para el siguiente nivel` })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

function createProgressBar(percent) {
    const filledBlocks = Math.floor(percent / 10);
    const emptyBlocks = 10 - filledBlocks;
    return '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
} 