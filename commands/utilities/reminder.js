import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import {
    createReminder,
    deleteReminder,
    getUserReminders,
    createReminderEmbed,
    EMOJIS
} from '../../features/reminders/reminderSystem.js';

export const data = new SlashCommandBuilder()
    .setName('reminder')
    .setDescription('Sistema de recordatorios')
    .addSubcommand(subcommand =>
        subcommand
            .setName('crear')
            .setDescription('Crear un nuevo recordatorio')
            .addStringOption(option =>
                option.setName('mensaje')
                    .setDescription('Mensaje del recordatorio')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('tiempo')
                    .setDescription('Cuándo enviar el recordatorio (ej: 1h, 30m, 2d, tomorrow 10:00)')
                    .setRequired(true))
            .addBooleanOption(option =>
                option.setName('repetir')
                    .setDescription('¿Quieres que el recordatorio se repita?'))
            .addStringOption(option =>
                option.setName('intervalo')
                    .setDescription('Intervalo de repetición')
                    .addChoices(
                        { name: '📅 Diario', value: 'daily' },
                        { name: '📅 Semanal', value: 'weekly' },
                        { name: '📅 Mensual', value: 'monthly' }
                    )))
    .addSubcommand(subcommand =>
        subcommand
            .setName('lista')
            .setDescription('Ver tus recordatorios activos'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('eliminar')
            .setDescription('Eliminar un recordatorio')
            .addIntegerOption(option =>
                option.setName('id')
                    .setDescription('ID del recordatorio a eliminar')
                    .setRequired(true)));

export async function execute(interaction) {
    try {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'crear':
                await handleCreate(interaction);
                break;
            case 'lista':
                await handleList(interaction);
                break;
            case 'eliminar':
                await handleDelete(interaction);
                break;
        }
    } catch (error) {
        console.error('[Reminder Command] Error:', error);
        await interaction.reply({
            content: `${EMOJIS.CROSS} Ocurrió un error al procesar el comando.`,
            ephemeral: true
        });
    }
}

/**
 * Maneja el subcomando crear
 * @param {CommandInteraction} interaction 
 */
async function handleCreate(interaction) {
    const message = interaction.options.getString('mensaje');
    const timeInput = interaction.options.getString('tiempo');
    const repeat = interaction.options.getBoolean('repetir') ?? false;
    const repeatInterval = interaction.options.getString('intervalo');

    // Validar intervalo de repetición
    if (repeat && !repeatInterval) {
        return interaction.reply({
            content: `${EMOJIS.CROSS} Si quieres que el recordatorio se repita, debes especificar un intervalo.`,
            ephemeral: true
        });
    }

    // Parsear el tiempo
    const time = parseTime(timeInput);
    if (!time) {
        return interaction.reply({
            content: `${EMOJIS.CROSS} Formato de tiempo inválido. Ejemplos válidos: 1h, 30m, 2d, tomorrow 10:00`,
            ephemeral: true
        });
    }

    if (time.getTime() <= Date.now()) {
        return interaction.reply({
            content: `${EMOJIS.CROSS} La fecha del recordatorio debe ser en el futuro.`,
            ephemeral: true
        });
    }

    // Crear el recordatorio
    const reminder = await createReminder({
        userId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        message,
        time,
        repeat,
        repeatInterval
    });

    // Crear embed y botones
    const embed = createReminderEmbed(reminder);
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`reminder_delete_${reminder.id}`)
                .setLabel('Eliminar')
                .setStyle(ButtonStyle.Danger)
                .setEmoji(EMOJIS.CROSS)
        );

    await interaction.reply({
        content: `${EMOJIS.CHECK} Recordatorio creado con éxito.`,
        embeds: [embed],
        components: [row]
    });
}

/**
 * Maneja el subcomando lista
 * @param {CommandInteraction} interaction 
 */
async function handleList(interaction) {
    const reminders = await getUserReminders(interaction.user.id, interaction.guildId);

    if (reminders.length === 0) {
        return interaction.reply({
            content: `${EMOJIS.INFO} No tienes recordatorios activos.`,
            ephemeral: true
        });
    }

    // Crear embeds para cada recordatorio
    const embeds = reminders.map(reminder => 
        createReminderEmbed({
            ...reminder,
            time: new Date(reminder.reminder_time)
        })
    );

    // Crear botones para cada recordatorio
    const rows = reminders.map(reminder =>
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`reminder_delete_${reminder.id}`)
                    .setLabel('Eliminar')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji(EMOJIS.CROSS)
            )
    );

    await interaction.reply({
        content: `${EMOJIS.CLOCK} Tus recordatorios activos:`,
        embeds,
        components: rows
    });
}

/**
 * Maneja el subcomando eliminar
 * @param {CommandInteraction} interaction 
 */
async function handleDelete(interaction) {
    const reminderId = interaction.options.getInteger('id');

    const success = await deleteReminder(reminderId);
    if (success) {
        await interaction.reply({
            content: `${EMOJIS.CHECK} Recordatorio eliminado con éxito.`,
            ephemeral: true
        });
    } else {
        await interaction.reply({
            content: `${EMOJIS.CROSS} No se encontró el recordatorio o no tienes permiso para eliminarlo.`,
            ephemeral: true
        });
    }
}

/**
 * Parsea una cadena de tiempo en una fecha
 * @param {string} input - Cadena de tiempo
 * @returns {Date|null} Fecha parseada o null si es inválida
 */
function parseTime(input) {
    try {
        const now = new Date();
        
        // Patrones comunes
        if (input.match(/^\d+[mhdw]$/i)) {
            const amount = parseInt(input.slice(0, -1));
            const unit = input.slice(-1).toLowerCase();
            
            switch (unit) {
                case 'm':
                    return new Date(now.getTime() + amount * 60000);
                case 'h':
                    return new Date(now.getTime() + amount * 3600000);
                case 'd':
                    return new Date(now.getTime() + amount * 86400000);
                case 'w':
                    return new Date(now.getTime() + amount * 604800000);
            }
        }

        // Mañana a una hora específica
        if (input.toLowerCase().startsWith('tomorrow')) {
            const time = input.split(' ')[1];
            if (time && time.match(/^\d{1,2}:\d{2}$/)) {
                const [hours, minutes] = time.split(':').map(Number);
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(hours, minutes, 0, 0);
                return tomorrow;
            }
        }

        // Fecha y hora específica
        const date = new Date(input);
        if (!isNaN(date.getTime())) {
            return date;
        }

        return null;
    } catch {
        return null;
    }
} 