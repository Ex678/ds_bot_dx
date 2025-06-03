import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getDatabase } from '../../database.js';

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
                content: `❌ Solo hay ${maxPages} página${maxPages === 1 ? '' : 's'} disponible${maxPages === 1 ? '' : 's'}.`,
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
                content: '❌ Aún no hay usuarios con nivel en este servidor.',
                ephemeral: true
            });
        }

        // Construir la lista de usuarios
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

            description += `${rank}. ${userMention}\n` +
                `⭐ Nivel ${user.level} • 📊 ${user.xp} XP • 💬 ${user.messages_count} mensajes\n\n`;
        }

        const embed = new EmbedBuilder()
            .setColor(0x00BFFF)
            .setTitle('🏆 Tabla de Clasificación')
            .setDescription(description)
            .setFooter({
                text: `Página ${page}/${maxPages} • Total: ${totalUsers.count} usuarios`
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('[Leaderboard] Error:', error);
        await interaction.reply({
            content: '❌ Ocurrió un error al obtener la tabla de clasificación.',
            ephemeral: true
        });
    }
} 