import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { initializeStorage as getDatabase } from '../../utils/storage.js';

// Constantes para emojis y colores
const EMOJIS = {
    POLL: '📊',
    TIME: '⏱️',
    VOTE: '🗳️',
    RESULTS: '📈',
    CHECK: '✅',
    CROSS: '❌',
    NUMBERS: ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'],
    CHART: ['▰', '▱'],
    LOCK: '🔒',
    USERS: '👥',
    CROWN: '👑'
};

const COLORS = {
    PRIMARY: 0x3498DB,    // Azul para encuestas activas
    SUCCESS: 0x2ECC71,    // Verde para encuestas finalizadas
    WARNING: 0xF1C40F,    // Amarillo para encuestas por expirar
    ERROR: 0xE74C3C      // Rojo para encuestas canceladas
};

/**
 * Crea una nueva encuesta
 * @param {Object} options - Opciones de la encuesta
 * @param {string} options.question - Pregunta de la encuesta
 * @param {Array<string>} options.choices - Opciones de respuesta
 * @param {number} options.duration - Duración en minutos
 * @param {boolean} options.multiple - Permitir múltiples votos
 * @param {boolean} options.anonymous - Votos anónimos
 * @returns {Promise<Object>} Datos de la encuesta creada
 */
async function createPoll(options) {
    const db = getDatabase();
    
    try {
        const result = await db.run(`
            INSERT INTO polls (
                question, choices, duration, multiple_votes,
                anonymous, created_at, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            options.question,
            JSON.stringify(options.choices),
            options.duration,
            options.multiple ? 1 : 0,
            options.anonymous ? 1 : 0,
            Date.now(),
            Date.now() + (options.duration * 60000)
        ]);

        return {
            id: result.lastID,
            ...options,
            votes: {},
            created_at: Date.now(),
            expires_at: Date.now() + (options.duration * 60000)
        };
    } catch (error) {
        console.error('[Poll System] Error al crear encuesta:', error);
        throw error;
    }
}

/**
 * Registra un voto en una encuesta
 * @param {number} pollId - ID de la encuesta
 * @param {string} userId - ID del usuario
 * @param {number} choiceIndex - Índice de la opción elegida
 * @returns {Promise<boolean>} True si el voto fue registrado
 */
async function registerVote(pollId, userId, choiceIndex) {
    const db = getDatabase();
    
    try {
        const poll = await db.get('SELECT * FROM polls WHERE id = ?', [pollId]);
        if (!poll || Date.now() > poll.expires_at) {
            return false;
        }

        let votes = await db.get('SELECT votes FROM poll_votes WHERE poll_id = ?', [pollId]);
        votes = votes ? JSON.parse(votes.votes) : {};

        if (!poll.multiple_votes && votes[userId]) {
            // Si no se permiten votos múltiples, eliminar voto anterior
            delete votes[userId];
        }

        votes[userId] = choiceIndex;

        await db.run(`
            INSERT OR REPLACE INTO poll_votes (poll_id, votes)
            VALUES (?, ?)
        `, [pollId, JSON.stringify(votes)]);

        return true;
    } catch (error) {
        console.error('[Poll System] Error al registrar voto:', error);
        return false;
    }
}

/**
 * Obtiene los resultados de una encuesta
 * @param {number} pollId - ID de la encuesta
 * @returns {Promise<Object>} Resultados de la encuesta
 */
async function getPollResults(pollId) {
    const db = getDatabase();
    
    try {
        const poll = await db.get('SELECT * FROM polls WHERE id = ?', [pollId]);
        if (!poll) return null;

        const votes = await db.get('SELECT votes FROM poll_votes WHERE poll_id = ?', [pollId]);
        const voteData = votes ? JSON.parse(votes.votes) : {};
        const choices = JSON.parse(poll.choices);
        
        // Contar votos por opción
        const results = choices.map((choice, index) => {
            const votesForChoice = Object.values(voteData).filter(v => v === index).length;
            return {
                choice,
                votes: votesForChoice,
                percentage: Object.keys(voteData).length > 0
                    ? (votesForChoice / Object.keys(voteData).length) * 100
                    : 0
            };
        });

        return {
            ...poll,
            choices,
            results,
            total_votes: Object.keys(voteData).length,
            votes: poll.anonymous ? null : voteData
        };
    } catch (error) {
        console.error('[Poll System] Error al obtener resultados:', error);
        return null;
    }
}

/**
 * Crea un embed para mostrar una encuesta
 * @param {Object} poll - Datos de la encuesta
 * @param {boolean} showResults - Mostrar resultados
 * @returns {EmbedBuilder} Embed de la encuesta
 */
function createPollEmbed(poll, showResults = false) {
    const timeLeft = Math.max(0, poll.expires_at - Date.now());
    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);

    const embed = new EmbedBuilder()
        .setColor(timeLeft > 0 ? COLORS.PRIMARY : COLORS.SUCCESS)
        .setTitle(`${EMOJIS.POLL} ${poll.question}`)
        .setFooter({
            text: `ID: ${poll.id} • ${poll.multiple_votes ? 'Votos múltiples permitidos' : 'Un voto por persona'} • ${poll.anonymous ? 'Votos anónimos' : 'Votos públicos'}`
        });

    if (showResults && poll.results) {
        const maxVotes = Math.max(...poll.results.map(r => r.votes));
        const description = poll.results.map((result, index) => {
            const barLength = 20;
            const filledBars = Math.round((result.votes / (maxVotes || 1)) * barLength);
            const bar = EMOJIS.CHART[0].repeat(filledBars) + EMOJIS.CHART[1].repeat(barLength - filledBars);
            
            return `${EMOJIS.NUMBERS[index]} **${result.choice}**\n` +
                `${bar} \`${result.votes} votos (${result.percentage.toFixed(1)}%)\``;
        }).join('\n\n');

        embed.setDescription(description)
            .addFields({
                name: `${EMOJIS.USERS} Total de Votos`,
                value: `\`${poll.total_votes}\``,
                inline: true
            });

        if (timeLeft <= 0) {
            embed.addFields({
                name: `${EMOJIS.LOCK} Encuesta Finalizada`,
                value: 'Esta encuesta ha terminado.',
                inline: true
            });
        } else {
            embed.addFields({
                name: `${EMOJIS.TIME} Tiempo Restante`,
                value: `\`${minutes}m ${seconds}s\``,
                inline: true
            });
        }

    } else {
        embed.setDescription(poll.choices.map((choice, index) => 
            `${EMOJIS.NUMBERS[index]} ${choice}`
        ).join('\n\n'))
        .addFields({
            name: `${EMOJIS.TIME} Tiempo Restante`,
            value: timeLeft > 0 ? `\`${minutes}m ${seconds}s\`` : 'Encuesta finalizada',
            inline: true
        });
    }

    return embed;
}

/**
 * Crea los botones para votar en una encuesta
 * @param {Object} poll - Datos de la encuesta
 * @returns {ActionRowBuilder[]} Filas de botones
 */
function createPollButtons(poll) {
    const rows = [];
    let currentRow = new ActionRowBuilder();
    
    poll.choices.forEach((choice, index) => {
        if (index > 0 && index % 5 === 0) {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder();
        }

        currentRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`poll_vote_${poll.id}_${index}`)
                .setLabel(choice)
                .setEmoji(EMOJIS.NUMBERS[index])
                .setStyle(ButtonStyle.Primary)
                .setDisabled(Date.now() > poll.expires_at)
        );
    });

    rows.push(currentRow);

    // Añadir botón para ver resultados
    if (rows.length < 5) {
        rows.push(
            new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`poll_results_${poll.id}`)
                        .setLabel('Ver Resultados')
                        .setEmoji(EMOJIS.RESULTS)
                        .setStyle(ButtonStyle.Secondary)
                )
        );
    }

    return rows;
}

export {
    createPoll,
    registerVote,
    getPollResults,
    createPollEmbed,
    createPollButtons,
    EMOJIS,
    COLORS
}; 