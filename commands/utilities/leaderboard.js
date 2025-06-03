import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getDatabase } from '../../database.js';

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
    .setDescription('Muestra la tabla de clasificación del servidor')
    .addIntegerOption(option =>
        option.setName('página')
            .setDescription('Número de página a mostrar')
            .setMinValue(1));

export async function execute(interaction) {
    try {
        const page = interaction.options.getInteger('página') || 1;
        const usersPerPage = 10;
        const db = getDatabase();

        // Obtener total de usuarios con nivel
        const totalUsers = await db.get(`
            SELECT COUNT(*) as count
            FROM levels
            WHERE guild_id = ?
        `, [interaction.guild.id]);

        const maxPages = Math.ceil(totalUsers.count / usersPerPage);

        if (page > maxPages) {
            return interaction.reply({
                content: `${EMOJIS.ERROR} Solo hay ${maxPages} página${maxPages === 1 ? '' : 's'} disponible${maxPages === 1 ? '' : 's'}.`,
                ephemeral: true
            });
        }

        // Obtener usuarios para la página actual
        const offset = (page - 1) * usersPerPage;
        const rankings = await db.all(`
            SELECT user_id, xp, level, messages_count
            FROM levels
            WHERE guild_id = ?
            ORDER BY xp DESC
            LIMIT ? OFFSET ?
        `, [interaction.guild.id, usersPerPage, offset]);

        if (rankings.length === 0) {
            return interaction.reply({
                content: `${EMOJIS.ERROR} Aún no hay usuarios con nivel en este servidor.`,
                ephemeral: true
            });
        }

        // Construir la lista de usuarios con formato mejorado
        let description = '';
        for (let i = 0; i < rankings.length; i++) {
            const rank = offset + i + 1;
            const user = rankings[i];
            let userMention;
            try {
                const member = await interaction.guild.members.fetch(user.user_id);
                userMention = member.toString();
            } catch {
                userMention = `Usuario Desconocido (${user.user_id})`;
            }

            // Determinar el emoji de rango
            let rankEmoji;
            switch (rank) {
                case 1:
                    rankEmoji = EMOJIS.MEDAL.FIRST;
                    break;
                case 2:
                    rankEmoji = EMOJIS.MEDAL.SECOND;
                    break;
                case 3:
                    rankEmoji = EMOJIS.MEDAL.THIRD;
                    break;
                default:
                    rankEmoji = `\`#${rank}\``;
            }

            description += `${rankEmoji} ${userMention}\n` +
                `┣ ${EMOJIS.LEVEL} Nivel \`${user.level}\` ` +
                `${EMOJIS.XP} \`${user.xp}\` XP ` +
                `${EMOJIS.MESSAGE} \`${user.messages_count}\` mensajes\n` +
                `┗━━━━━━━━━━━━━━━━━━\n`;
        }

        const embed = new EmbedBuilder()
            .setColor(COLORS.GOLD)
            .setTitle(`${EMOJIS.TROPHY} Tabla de Clasificación ${EMOJIS.SPARKLES}`)
            .setDescription(description)
            .setThumbnail(interaction.guild.iconURL())
            .addFields({
                name: `${EMOJIS.CHART} Estadísticas`,
                value: `Total de usuarios: \`${totalUsers.count}\`\n` +
                      `Página \`${page}/${maxPages}\``
            })
            .setTimestamp()
            .setFooter({ 
                text: `Usa /leaderboard <página> para ver más clasificaciones`,
                iconURL: interaction.guild.iconURL()
            });

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('[Leaderboard] Error:', error);
        await interaction.reply({
            content: `${EMOJIS.ERROR} Ocurrió un error al obtener la tabla de clasificación.`,
            ephemeral: true
        });
    }
} 