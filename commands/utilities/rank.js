import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getDatabase } from '../../database.js';
import { getXpNeededForLevel } from '../../features/levelingSystem.js';

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
                    ? '❌ Aún no tienes ningún nivel. ¡Comienza a chatear para ganar XP!'
                    : `❌ ${targetUser.username} aún no tiene ningún nivel.`,
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

        // Crear barra de progreso
        const progressBarLength = 20;
        const filledBlocks = Math.floor((progressPercentage / 100) * progressBarLength);
        const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(progressBarLength - filledBlocks);

        const embed = new EmbedBuilder()
            .setColor(0x00BFFF)
            .setAuthor({
                name: targetUser.username,
                iconURL: targetUser.displayAvatarURL()
            })
            .setDescription(`Ranking **#${rank}** en el servidor`)
            .addFields(
                { name: 'Nivel', value: userData.level.toString(), inline: true },
                { name: 'XP Total', value: userData.xp.toString(), inline: true },
                { name: 'Mensajes', value: userData.messages_count.toString(), inline: true },
                {
                    name: 'Progreso al siguiente nivel',
                    value: `${progressBar} ${progressPercentage}%\n` +
                        `${currentXpInLevel}/${xpForNextLevel} XP`
                }
            )
            .setTimestamp()
            .setFooter({ text: `${xpForNextLevel - currentXpInLevel} XP restante para el nivel ${userData.level + 1}` });

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('[Rank] Error:', error);
        await interaction.reply({
            content: '❌ Ocurrió un error al obtener la información de rango.',
            ephemeral: true
        });
    }
} 