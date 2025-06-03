import { SlashCommandBuilder } from 'discord.js';
import {
    createPoll,
    getPollResults,
    createPollEmbed,
    createPollButtons,
    EMOJIS
} from '../../features/polls/pollSystem.js';

export const data = new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Crea una encuesta interactiva')
    .addStringOption(option =>
        option.setName('pregunta')
            .setDescription('La pregunta de la encuesta')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('opciones')
            .setDescription('Opciones separadas por |. Ejemplo: Opción 1|Opción 2|Opción 3')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('duración')
            .setDescription('Duración de la encuesta en minutos')
            .setMinValue(1)
            .setMaxValue(1440)
            .setRequired(true))
    .addBooleanOption(option =>
        option.setName('múltiple')
            .setDescription('Permitir votos múltiples'))
    .addBooleanOption(option =>
        option.setName('anónimo')
            .setDescription('Hacer los votos anónimos'));

export async function execute(interaction) {
    try {
        // Obtener opciones del comando
        const question = interaction.options.getString('pregunta');
        const choicesString = interaction.options.getString('opciones');
        const duration = interaction.options.getInteger('duración');
        const multiple = interaction.options.getBoolean('múltiple') ?? false;
        const anonymous = interaction.options.getBoolean('anónimo') ?? false;

        // Validar opciones
        const choices = choicesString.split('|').map(c => c.trim()).filter(c => c);
        if (choices.length < 2) {
            return interaction.reply({
                content: `${EMOJIS.CROSS} Debes proporcionar al menos 2 opciones.`,
                ephemeral: true
            });
        }
        if (choices.length > 10) {
            return interaction.reply({
                content: `${EMOJIS.CROSS} No puedes tener más de 10 opciones.`,
                ephemeral: true
            });
        }

        // Crear la encuesta
        const poll = await createPoll({
            question,
            choices,
            duration,
            multiple,
            anonymous
        });

        // Crear embed y botones
        const embed = createPollEmbed(poll);
        const components = createPollButtons(poll);

        // Enviar mensaje con la encuesta
        const message = await interaction.reply({
            embeds: [embed],
            components,
            fetchReply: true
        });

        // Configurar colector de interacciones
        const filter = i => i.message.id === message.id;
        const collector = message.createMessageComponentCollector({
            filter,
            time: duration * 60000
        });

        collector.on('collect', async i => {
            try {
                const [action, pollId, choiceIndex] = i.customId.split('_');

                if (action === 'poll' && pollId === poll.id.toString()) {
                    if (i.customId.startsWith('poll_vote_')) {
                        // Registrar voto
                        const success = await registerVote(
                            parseInt(pollId),
                            i.user.id,
                            parseInt(choiceIndex)
                        );

                        if (!success) {
                            return i.reply({
                                content: `${EMOJIS.CROSS} No se pudo registrar tu voto.`,
                                ephemeral: true
                            });
                        }

                        // Obtener resultados actualizados
                        const updatedPoll = await getPollResults(parseInt(pollId));
                        const updatedEmbed = createPollEmbed(updatedPoll, true);
                        const updatedComponents = createPollButtons(updatedPoll);

                        await i.update({
                            embeds: [updatedEmbed],
                            components: updatedComponents
                        });

                    } else if (i.customId === `poll_results_${pollId}`) {
                        // Mostrar resultados
                        const results = await getPollResults(parseInt(pollId));
                        const resultsEmbed = createPollEmbed(results, true);

                        await i.update({
                            embeds: [resultsEmbed],
                            components: components
                        });
                    }
                }
            } catch (error) {
                console.error('[Poll Command] Error al procesar interacción:', error);
                await i.reply({
                    content: `${EMOJIS.CROSS} Ocurrió un error al procesar tu interacción.`,
                    ephemeral: true
                });
            }
        });

        collector.on('end', async () => {
            try {
                // Obtener resultados finales
                const finalResults = await getPollResults(poll.id);
                const finalEmbed = createPollEmbed(finalResults, true);

                // Deshabilitar todos los botones
                const finalComponents = components.map(row => {
                    const newRow = ActionRowBuilder.from(row);
                    newRow.components.forEach(button => button.setDisabled(true));
                    return newRow;
                });

                await message.edit({
                    embeds: [finalEmbed],
                    components: finalComponents
                });
            } catch (error) {
                console.error('[Poll Command] Error al finalizar encuesta:', error);
            }
        });

    } catch (error) {
        console.error('[Poll Command] Error:', error);
        await interaction.reply({
            content: `${EMOJIS.CROSS} Ocurrió un error al crear la encuesta.`,
            ephemeral: true
        });
    }
} 