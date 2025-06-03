import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getDatabase } from '../../database.js';
import { getXpNeededForLevel } from '../../features/levelingSystem.js';

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
    .setDescription('Muestra tu rango y nivel actual')
    .addUserOption(option =>
        option.setName('usuario')
            .setDescription('Usuario del que quieres ver el rango (opcional)'));

export async function execute(interaction) {
    try {
        const targetUser = interaction.options.getUser('usuario') || interaction.user;
        const db = getDatabase();

        // Obtener datos del usuario
        const userData = await db.get(`
            SELECT xp, level, messages_count
            FROM levels
            WHERE user_id = ? AND guild_id = ?
        `, [targetUser.id, interaction.guild.id]);

        if (!userData) {
            return interaction.reply({
                content: targetUser.id === interaction.user.id
                    ? `${EMOJIS.ERROR} Aún no tienes ningún nivel. ¡Comienza a chatear para ganar XP!`
                    : `${EMOJIS.ERROR} ${targetUser.username} aún no tiene ningún nivel.`,
                ephemeral: true
            });
        }

        // Obtener posición en el ranking
        const rankings = await db.all(`
            SELECT user_id, xp
            FROM levels
            WHERE guild_id = ?
            ORDER BY xp DESC
        `, [interaction.guild.id]);

        const rank = rankings.findIndex(user => user.user_id === targetUser.id) + 1;

        // Calcular progreso al siguiente nivel
        const currentLevelXp = getXpNeededForLevel(userData.level);
        const nextLevelXp = getXpNeededForLevel(userData.level + 1);
        const xpForNextLevel = nextLevelXp - currentLevelXp;
        const currentXpInLevel = userData.xp - currentLevelXp;
        const progressPercentage = Math.floor((currentXpInLevel / xpForNextLevel) * 100);

        // Crear barra de progreso mejorada
        const progressBarLength = 20;
        const filledBlocks = Math.floor((progressPercentage / 100) * progressBarLength);
        const progressBar = EMOJIS.BAR.START.repeat(filledBlocks) + EMOJIS.BAR.END.repeat(progressBarLength - filledBlocks);

        // Determinar medalla basada en el rango
        let rankMedal;
        let embedColor;
        switch (rank) {
            case 1:
                rankMedal = EMOJIS.MEDAL.FIRST;
                embedColor = COLORS.GOLD;
                break;
            case 2:
                rankMedal = EMOJIS.MEDAL.SECOND;
                embedColor = COLORS.GOLD;
                break;
            case 3:
                rankMedal = EMOJIS.MEDAL.THIRD;
                embedColor = COLORS.GOLD;
                break;
            default:
                rankMedal = EMOJIS.MEDAL.OTHER;
                embedColor = rank <= 10 ? COLORS.SILVER : COLORS.BRONZE;
        }

        const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setAuthor({
                name: `Perfil de ${targetUser.username}`,
                iconURL: targetUser.displayAvatarURL()
            })
            .setDescription(`${rankMedal} Ranking **#${rank}** en el servidor`)
            .addFields(
                { 
                    name: `${EMOJIS.LEVEL} Nivel`,
                    value: `\`${userData.level}\``,
                    inline: true 
                },
                { 
                    name: `${EMOJIS.XP} XP Total`,
                    value: `\`${userData.xp}\``,
                    inline: true 
                },
                { 
                    name: `${EMOJIS.MESSAGE} Mensajes`,
                    value: `\`${userData.messages_count}\``,
                    inline: true 
                },
                {
                    name: `${EMOJIS.PROGRESS} Progreso al siguiente nivel`,
                    value: `${progressBar} \`${progressPercentage}%\`\n` +
                          `\`${currentXpInLevel}/${xpForNextLevel} XP\``
                }
            )
            .setTimestamp()
            .setFooter({ 
                text: `${EMOJIS.NEXT} ${xpForNextLevel - currentXpInLevel} XP restante para el nivel ${userData.level + 1}`,
                iconURL: interaction.guild.iconURL()
            });

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('[Rank] Error:', error);
        await interaction.reply({
            content: `${EMOJIS.ERROR} Ocurrió un error al obtener la información de rango.`,
            ephemeral: true
        });
    }
} 