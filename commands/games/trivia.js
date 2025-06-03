import { SlashCommandBuilder } from 'discord.js';
import {
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
} from '../../features/games/triviaSystem.js';

export const data = new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('Juega una ronda de trivia')
    .addSubcommand(subcommand =>
        subcommand
            .setName('jugar')
            .setDescription('Juega una ronda de trivia')
            .addStringOption(option =>
                option.setName('categoría')
                    .setDescription('Categoría de las preguntas')
                    .addChoices(
                        { name: '🔬 Ciencia', value: 'science' },
                        { name: '📚 Historia', value: 'history' },
                        { name: '🌍 Geografía', value: 'geography' },
                        { name: '🎬 Entretenimiento', value: 'entertainment' },
                        { name: '⚽ Deportes', value: 'sports' },
                        { name: '🎮 Videojuegos', value: 'gaming' },
                        { name: '🎵 Música', value: 'music' },
                        { name: '🎨 Arte', value: 'art' },
                        { name: '💻 Tecnología', value: 'tech' },
                        { name: '🎲 Aleatorio', value: 'random' }
                    ))
            .addStringOption(option =>
                option.setName('dificultad')
                    .setDescription('Dificultad de las preguntas')
                    .addChoices(
                        { name: '🟢 Fácil', value: 'easy' },
                        { name: '🟡 Media', value: 'medium' },
                        { name: '🔴 Difícil', value: 'hard' }
                    )))
    .addSubcommand(subcommand =>
        subcommand
            .setName('stats')
            .setDescription('Ver tus estadísticas de trivia')
            .addUserOption(option =>
                option.setName('usuario')
                    .setDescription('Usuario del que quieres ver las estadísticas')));

export async function execute(interaction) {
    try {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'stats') {
            const targetUser = interaction.options.getUser('usuario') || interaction.user;
            const stats = await getUserStats(targetUser.id, interaction.guildId);

            if (!stats) {
                return interaction.reply({
                    content: targetUser.id === interaction.user.id
                        ? `${EMOJIS.ERROR} Aún no has jugado ninguna ronda de trivia.`
                        : `${EMOJIS.ERROR} ${targetUser.username} aún no ha jugado ninguna ronda de trivia.`,
                    ephemeral: true
                });
            }

            const embed = createStatsEmbed(stats, targetUser);
            return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === 'jugar') {
            // Obtener opciones
            const category = interaction.options.getString('categoría');
            const difficulty = interaction.options.getString('dificultad');

            // Obtener pregunta aleatoria
            const question = await getRandomQuestion(category, difficulty);
            if (!question) {
                return interaction.reply({
                    content: `${EMOJIS.ERROR} No se encontraron preguntas para los criterios seleccionados.`,
                    ephemeral: true
                });
            }

            // Crear array de respuestas y mezclarlas
            const answers = [
                question.correct_answer,
                ...question.incorrect_answers.split('|')
            ].sort(() => Math.random() - 0.5);

            // Guardar la respuesta correcta para verificación
            const correctIndex = answers.indexOf(question.correct_answer);

            // Crear y enviar el mensaje con la pregunta
            const embed = createQuestionEmbed(question, ANSWER_TIME_LIMIT);
            const row = createAnswerButtons(answers);

            const reply = await interaction.reply({
                embeds: [embed],
                components: [row],
                fetchReply: true
            });

            // Crear colector de botones
            const filter = i => i.customId.startsWith('trivia_answer_') && i.user.id === interaction.user.id;
            const collector = reply.createMessageComponentCollector({
                filter,
                time: ANSWER_TIME_LIMIT * 1000
            });

            let answered = false;
            let timeLeft = ANSWER_TIME_LIMIT;

            // Actualizar el tiempo restante cada segundo
            const timer = setInterval(() => {
                if (answered || timeLeft <= 0) {
                    clearInterval(timer);
                    return;
                }

                timeLeft--;
                embed.spliceFields(1, 1, {
                    name: 'Tiempo Restante',
                    value: `${EMOJIS.TIMER} ${timeLeft}s`,
                    inline: true
                });

                interaction.editReply({ embeds: [embed] });
            }, 1000);

            collector.on('collect', async i => {
                answered = true;
                clearInterval(timer);

                const selectedIndex = parseInt(i.customId.split('_')[2]);
                const isCorrect = selectedIndex === correctIndex;

                // Calcular puntos
                let points = 0;
                if (isCorrect) {
                    points = BASE_POINTS * DIFFICULTY_MULTIPLIERS[question.difficulty];
                    
                    // Obtener estadísticas actuales para el bonus por racha
                    const stats = await getUserStats(interaction.user.id, interaction.guildId);
                    if (stats && stats.current_streak > 0) {
                        points += STREAK_BONUS * stats.current_streak;
                    }
                }

                // Actualizar estadísticas
                await updateUserStats(interaction.user.id, interaction.guildId, isCorrect, points);

                // Actualizar botones
                const newRow = new ActionRowBuilder();
                answers.forEach((answer, index) => {
                    const button = ButtonBuilder.from(row.components[index]);
                    if (index === correctIndex) {
                        button.setStyle(ButtonStyle.Success);
                    } else if (index === selectedIndex && !isCorrect) {
                        button.setStyle(ButtonStyle.Danger);
                    }
                    button.setDisabled(true);
                    newRow.addComponents(button);
                });

                // Crear embed de resultado
                const resultEmbed = embed
                    .setColor(isCorrect ? COLORS.CORRECT : COLORS.INCORRECT)
                    .setTitle(isCorrect 
                        ? `${EMOJIS.CORRECT} ¡Respuesta Correcta!`
                        : `${EMOJIS.INCORRECT} Respuesta Incorrecta`)
                    .setDescription(`**Pregunta:** ${question.question}\n\n` +
                        `**Respuesta correcta:** ${question.correct_answer}\n` +
                        `**Tu respuesta:** ${answers[selectedIndex]}\n\n` +
                        isCorrect
                            ? `${EMOJIS.POINTS} ¡Has ganado ${points} puntos!`
                            : '¡Mejor suerte la próxima vez!')
                    .spliceFields(1, 1, {
                        name: 'Tiempo Usado',
                        value: `${EMOJIS.TIMER} ${ANSWER_TIME_LIMIT - timeLeft}s`,
                        inline: true
                    });

                await i.update({
                    embeds: [resultEmbed],
                    components: [newRow]
                });
            });

            collector.on('end', async collected => {
                if (!answered) {
                    // Tiempo agotado
                    const newRow = new ActionRowBuilder();
                    answers.forEach((answer, index) => {
                        const button = ButtonBuilder.from(row.components[index]);
                        if (index === correctIndex) {
                            button.setStyle(ButtonStyle.Success);
                        }
                        button.setDisabled(true);
                        newRow.addComponents(button);
                    });

                    const timeoutEmbed = embed
                        .setColor(COLORS.TIMEOUT)
                        .setTitle(`${EMOJIS.TIMEOUT} ¡Tiempo Agotado!`)
                        .setDescription(`**Pregunta:** ${question.question}\n\n` +
                            `**Respuesta correcta:** ${question.correct_answer}\n\n` +
                            '¡Se más rápido la próxima vez!')
                        .spliceFields(1, 1, {
                            name: 'Tiempo',
                            value: `${EMOJIS.TIMER} ¡Agotado!`,
                            inline: true
                        });

                    await interaction.editReply({
                        embeds: [timeoutEmbed],
                        components: [newRow]
                    });

                    // Actualizar estadísticas (cuenta como respuesta incorrecta)
                    await updateUserStats(interaction.user.id, interaction.guildId, false, 0);
                }
            });
        }
    } catch (error) {
        console.error('[Trivia Command] Error:', error);
        await interaction.reply({
            content: `${EMOJIS.ERROR} Ocurrió un error al procesar el comando.`,
            ephemeral: true
        });
    }
} 