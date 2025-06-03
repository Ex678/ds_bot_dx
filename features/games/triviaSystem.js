import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getDatabase } from '../../database.js';

// Constantes para emojis y colores
const EMOJIS = {
    CORRECT: '✅',
    INCORRECT: '❌',
    TIMER: '⏲️',
    POINTS: '🏆',
    STREAK: '🔥',
    CATEGORY: {
        SCIENCE: '🔬',
        HISTORY: '📚',
        GEOGRAPHY: '🌍',
        ENTERTAINMENT: '🎬',
        SPORTS: '⚽',
        GAMING: '🎮',
        MUSIC: '🎵',
        ART: '🎨',
        TECH: '💻',
        RANDOM: '🎲'
    },
    DIFFICULTY: {
        EASY: '🟢',
        MEDIUM: '🟡',
        HARD: '🔴'
    },
    STATS: '📊',
    CROWN: '👑',
    MEDAL: {
        GOLD: '🥇',
        SILVER: '🥈',
        BRONZE: '🥉'
    }
};

const COLORS = {
    PRIMARY: 0x3498DB,    // Azul principal
    CORRECT: 0x2ECC71,    // Verde para respuestas correctas
    INCORRECT: 0xE74C3C,  // Rojo para respuestas incorrectas
    TIMEOUT: 0xF1C40F,    // Amarillo para tiempo agotado
    STATS: 0x9B59B6      // Púrpura para estadísticas
};

// Tiempo límite para responder (en segundos)
const ANSWER_TIME_LIMIT = 20;

// Puntos base por respuesta correcta
const BASE_POINTS = 100;

// Multiplicadores de puntos por dificultad
const DIFFICULTY_MULTIPLIERS = {
    easy: 1,
    medium: 1.5,
    hard: 2
};

// Bonus por racha de respuestas correctas
const STREAK_BONUS = 50;

/**
 * Obtiene una pregunta aleatoria de la base de datos
 * @param {string} category - Categoría de la pregunta (opcional)
 * @param {string} difficulty - Dificultad de la pregunta (opcional)
 * @returns {Promise<Object>} Pregunta seleccionada
 */
async function getRandomQuestion(category = null, difficulty = null) {
    const db = getDatabase();
    let query = 'SELECT * FROM trivia_questions';
    const params = [];

    if (category || difficulty) {
        query += ' WHERE';
        if (category) {
            query += ' category = ?';
            params.push(category);
        }
        if (difficulty) {
            if (category) query += ' AND';
            query += ' difficulty = ?';
            params.push(difficulty);
        }
    }

    query += ' ORDER BY RANDOM() LIMIT 1';

    return await db.get(query, params);
}

/**
 * Crea un embed para mostrar la pregunta
 * @param {Object} question - Datos de la pregunta
 * @param {number} timeLeft - Tiempo restante en segundos
 * @returns {EmbedBuilder} Embed con la pregunta
 */
function createQuestionEmbed(question, timeLeft) {
    const categoryEmoji = EMOJIS.CATEGORY[question.category.toUpperCase()] || EMOJIS.CATEGORY.RANDOM;
    const difficultyEmoji = EMOJIS.DIFFICULTY[question.difficulty.toUpperCase()];

    return new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle(`${categoryEmoji} Pregunta de ${question.category}`)
        .setDescription(question.question)
        .addFields(
            { 
                name: 'Dificultad',
                value: `${difficultyEmoji} ${question.difficulty.toUpperCase()}`,
                inline: true
            },
            {
                name: 'Tiempo Restante',
                value: `${EMOJIS.TIMER} ${timeLeft}s`,
                inline: true
            }
        )
        .setFooter({
            text: 'Usa los botones para seleccionar tu respuesta'
        });
}

/**
 * Crea los botones para las respuestas
 * @param {Array} answers - Array de respuestas
 * @returns {ActionRowBuilder} Fila de botones
 */
function createAnswerButtons(answers) {
    const row = new ActionRowBuilder();
    
    answers.forEach((answer, index) => {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`trivia_answer_${index}`)
                .setLabel(answer)
                .setStyle(ButtonStyle.Primary)
        );
    });

    return row;
}

/**
 * Actualiza las estadísticas del usuario
 * @param {string} userId - ID del usuario
 * @param {string} guildId - ID del servidor
 * @param {boolean} correct - Si la respuesta fue correcta
 * @param {number} points - Puntos ganados
 */
async function updateUserStats(userId, guildId, correct, points) {
    const db = getDatabase();
    
    try {
        // Obtener estadísticas actuales
        let stats = await db.get(`
            SELECT * FROM trivia_stats
            WHERE user_id = ? AND guild_id = ?
        `, [userId, guildId]);

        if (!stats) {
            // Crear nuevo registro
            await db.run(`
                INSERT INTO trivia_stats (
                    user_id, guild_id, total_questions,
                    correct_answers, total_points, current_streak,
                    max_streak, last_played
                ) VALUES (?, ?, 1, ?, ?, ?, ?, ?)
            `, [
                userId, guildId,
                correct ? 1 : 0,
                points,
                correct ? 1 : 0,
                correct ? 1 : 0,
                Date.now()
            ]);
        } else {
            // Actualizar registro existente
            const newStreak = correct ? stats.current_streak + 1 : 0;
            const maxStreak = Math.max(stats.max_streak, newStreak);

            await db.run(`
                UPDATE trivia_stats
                SET total_questions = total_questions + 1,
                    correct_answers = correct_answers + ?,
                    total_points = total_points + ?,
                    current_streak = ?,
                    max_streak = ?,
                    last_played = ?
                WHERE user_id = ? AND guild_id = ?
            `, [
                correct ? 1 : 0,
                points,
                newStreak,
                maxStreak,
                Date.now(),
                userId,
                guildId
            ]);
        }
    } catch (error) {
        console.error('[Trivia System] Error al actualizar estadísticas:', error);
    }
}

/**
 * Obtiene las estadísticas de un usuario
 * @param {string} userId - ID del usuario
 * @param {string} guildId - ID del servidor
 * @returns {Promise<Object>} Estadísticas del usuario
 */
async function getUserStats(userId, guildId) {
    const db = getDatabase();
    return await db.get(`
        SELECT * FROM trivia_stats
        WHERE user_id = ? AND guild_id = ?
    `, [userId, guildId]);
}

/**
 * Crea un embed con las estadísticas del usuario
 * @param {Object} stats - Estadísticas del usuario
 * @param {Object} user - Usuario de Discord
 * @returns {EmbedBuilder} Embed con las estadísticas
 */
function createStatsEmbed(stats, user) {
    const accuracy = stats.total_questions > 0
        ? ((stats.correct_answers / stats.total_questions) * 100).toFixed(1)
        : 0;

    return new EmbedBuilder()
        .setColor(COLORS.STATS)
        .setAuthor({
            name: `Estadísticas de Trivia - ${user.username}`,
            iconURL: user.displayAvatarURL()
        })
        .addFields(
            {
                name: `${EMOJIS.STATS} Total de Preguntas`,
                value: `\`${stats.total_questions}\``,
                inline: true
            },
            {
                name: `${EMOJIS.CORRECT} Respuestas Correctas`,
                value: `\`${stats.correct_answers}\``,
                inline: true
            },
            {
                name: `${EMOJIS.POINTS} Puntos Totales`,
                value: `\`${stats.total_points}\``,
                inline: true
            },
            {
                name: `${EMOJIS.STREAK} Racha Actual`,
                value: `\`${stats.current_streak}\``,
                inline: true
            },
            {
                name: `${EMOJIS.CROWN} Mejor Racha`,
                value: `\`${stats.max_streak}\``,
                inline: true
            },
            {
                name: `📊 Precisión`,
                value: `\`${accuracy}%\``,
                inline: true
            }
        )
        .setTimestamp()
        .setFooter({
            text: 'Usa /trivia para jugar más rondas'
        });
}

export {
    getRandomQuestion,
    createQuestionEmbed,
    createAnswerButtons,
    updateUserStats,
    getUserStats,
    createStatsEmbed,
    EMOJIS,
    COLORS,
    ANSWER_TIME_LIMIT,
    BASE_POINTS,
    DIFFICULTY_MULTIPLIERS,
    STREAK_BONUS
}; 