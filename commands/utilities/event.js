import { SlashCommandBuilder } from 'discord.js';
import {
    createEvent,
    registerParticipant,
    cancelParticipation,
    getEventParticipants,
    getEvent,
    createEventEmbed,
    createEventButtons,
    EMOJIS
} from '../../features/events/eventSystem.js';

export const data = new SlashCommandBuilder()
    .setName('event')
    .setDescription('Sistema de eventos')
    .addSubcommand(subcommand =>
        subcommand
            .setName('crear')
            .setDescription('Crear un nuevo evento')
            .addStringOption(option =>
                option.setName('título')
                    .setDescription('Título del evento')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('descripción')
                    .setDescription('Descripción del evento')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('fecha')
                    .setDescription('Fecha y hora del evento (ej: 2024-02-20 15:00)')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('ubicación')
                    .setDescription('Ubicación del evento'))
            .addIntegerOption(option =>
                option.setName('participantes')
                    .setDescription('Número máximo de participantes'))
            .addRoleOption(option =>
                option.setName('rol')
                    .setDescription('Rol requerido para participar'))
            .addStringOption(option =>
                option.setName('recordatorios')
                    .setDescription('Minutos antes para recordatorios, separados por comas (ej: 60,30,10)')))
    .addSubcommand(subcommand =>
        subcommand
            .setName('info')
            .setDescription('Ver información de un evento')
            .addIntegerOption(option =>
                option.setName('id')
                    .setDescription('ID del evento')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('participar')
            .setDescription('Participar en un evento')
            .addIntegerOption(option =>
                option.setName('id')
                    .setDescription('ID del evento')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('cancelar')
            .setDescription('Cancelar participación en un evento')
            .addIntegerOption(option =>
                option.setName('id')
                    .setDescription('ID del evento')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('lista')
            .setDescription('Ver lista de eventos activos'));

export async function execute(interaction) {
    try {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'crear':
                await handleCreate(interaction);
                break;
            case 'info':
                await handleInfo(interaction);
                break;
            case 'participar':
                await handleJoin(interaction);
                break;
            case 'cancelar':
                await handleCancel(interaction);
                break;
            case 'lista':
                await handleList(interaction);
                break;
        }
    } catch (error) {
        console.error('[Event Command] Error:', error);
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
    const title = interaction.options.getString('título');
    const description = interaction.options.getString('descripción');
    const dateString = interaction.options.getString('fecha');
    const location = interaction.options.getString('ubicación');
    const maxParticipants = interaction.options.getInteger('participantes');
    const requiredRole = interaction.options.getRole('rol');
    const reminderTimesString = interaction.options.getString('recordatorios');

    // Validar y parsear la fecha
    const startTime = new Date(dateString);
    if (isNaN(startTime.getTime())) {
        return interaction.reply({
            content: `${EMOJIS.CROSS} Formato de fecha inválido. Usa el formato: YYYY-MM-DD HH:mm`,
            ephemeral: true
        });
    }

    if (startTime <= new Date()) {
        return interaction.reply({
            content: `${EMOJIS.CROSS} La fecha del evento debe ser en el futuro.`,
            ephemeral: true
        });
    }

    // Parsear recordatorios
    let reminderTimes = [60, 30, 10]; // Valores por defecto
    if (reminderTimesString) {
        try {
            reminderTimes = reminderTimesString.split(',')
                .map(t => parseInt(t.trim()))
                .filter(t => !isNaN(t) && t > 0)
                .sort((a, b) => b - a);
        } catch {
            return interaction.reply({
                content: `${EMOJIS.CROSS} Formato de recordatorios inválido.`,
                ephemeral: true
            });
        }
    }

    // Crear el evento
    const event = await createEvent({
        guildId: interaction.guildId,
        creatorId: interaction.user.id,
        channelId: interaction.channelId,
        title,
        description,
        startTime,
        location,
        maxParticipants,
        requiredRoleId: requiredRole?.id,
        reminderTimes
    });

    const embed = createEventEmbed(event);
    const row = createEventButtons(event);

    await interaction.reply({
        content: `${EMOJIS.CHECK} Evento creado con éxito.`,
        embeds: [embed],
        components: [row]
    });
}

/**
 * Maneja el subcomando info
 * @param {CommandInteraction} interaction 
 */
async function handleInfo(interaction) {
    const eventId = interaction.options.getInteger('id');
    const event = await getEvent(eventId);

    if (!event) {
        return interaction.reply({
            content: `${EMOJIS.CROSS} No se encontró el evento.`,
            ephemeral: true
        });
    }

    const participants = await getEventParticipants(eventId);
    const isParticipant = participants.some(p => 
        p.user_id === interaction.user.id && 
        p.status !== 'cancelled'
    );

    const embed = createEventEmbed(event);
    const row = createEventButtons(event, isParticipant);

    // Añadir información de participantes al embed
    const registered = participants.filter(p => p.status === 'registered');
    const waitlist = participants.filter(p => p.status === 'waitlist');

    if (registered.length > 0) {
        embed.addFields({
            name: `${EMOJIS.CHECK} Participantes Confirmados`,
            value: registered.map(p => `<@${p.user_id}>`).join('\n'),
            inline: false
        });
    }

    if (waitlist.length > 0) {
        embed.addFields({
            name: `${EMOJIS.WAITLIST} Lista de Espera`,
            value: waitlist.map(p => `<@${p.user_id}>`).join('\n'),
            inline: false
        });
    }

    await interaction.reply({
        embeds: [embed],
        components: [row]
    });
}

/**
 * Maneja el subcomando participar
 * @param {CommandInteraction} interaction 
 */
async function handleJoin(interaction) {
    const eventId = interaction.options.getInteger('id');
    const event = await getEvent(eventId);

    if (!event) {
        return interaction.reply({
            content: `${EMOJIS.CROSS} No se encontró el evento.`,
            ephemeral: true
        });
    }

    // Verificar rol requerido
    if (event.requiredRoleId && !interaction.member.roles.cache.has(event.requiredRoleId)) {
        return interaction.reply({
            content: `${EMOJIS.CROSS} Necesitas el rol <@&${event.requiredRoleId}> para participar.`,
            ephemeral: true
        });
    }

    const result = await registerParticipant(eventId, interaction.user.id);

    if (!result.success) {
        return interaction.reply({
            content: `${EMOJIS.CROSS} No se pudo registrar tu participación.`,
            ephemeral: true
        });
    }

    const message = result.status === 'registered'
        ? `${EMOJIS.CHECK} Te has registrado para el evento **${event.title}**.`
        : `${EMOJIS.WAITLIST} Has sido añadido a la lista de espera (posición: ${result.position}).`;

    await interaction.reply({
        content: message,
        ephemeral: true
    });
}

/**
 * Maneja el subcomando cancelar
 * @param {CommandInteraction} interaction 
 */
async function handleCancel(interaction) {
    const eventId = interaction.options.getInteger('id');
    const event = await getEvent(eventId);

    if (!event) {
        return interaction.reply({
            content: `${EMOJIS.CROSS} No se encontró el evento.`,
            ephemeral: true
        });
    }

    const success = await cancelParticipation(eventId, interaction.user.id);

    await interaction.reply({
        content: success
            ? `${EMOJIS.CHECK} Has cancelado tu participación en el evento.`
            : `${EMOJIS.CROSS} No se pudo cancelar tu participación.`,
        ephemeral: true
    });
}

/**
 * Maneja el subcomando lista
 * @param {CommandInteraction} interaction 
 */
async function handleList(interaction) {
    const db = getDatabase();
    
    try {
        const events = await db.all(`
            SELECT e.*, 
                   (SELECT COUNT(*) FROM event_participants ep 
                    WHERE ep.event_id = e.id AND ep.status = 'registered') as participant_count
            FROM events e
            WHERE e.guild_id = ? AND e.start_time > ?
            ORDER BY e.start_time ASC
        `, [interaction.guildId, Date.now()]);

        if (events.length === 0) {
            return interaction.reply({
                content: `${EMOJIS.INFO} No hay eventos activos.`,
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor(COLORS.PRIMARY)
            .setTitle(`${EMOJIS.CALENDAR.ACTIVE} Eventos Activos`)
            .setDescription(events.map(event => {
                const maxPart = event.max_participants 
                    ? `${event.participant_count}/${event.max_participants}`
                    : event.participant_count;
                
                return `${EMOJIS.EVENT} **${event.title}** (ID: ${event.id})\n` +
                    `${EMOJIS.TIME} <t:${Math.floor(event.start_time / 1000)}:F>\n` +
                    `${EMOJIS.USERS} Participantes: \`${maxPart}\`\n`;
            }).join('\n'));

        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error('[Event Command] Error al obtener lista:', error);
        await interaction.reply({
            content: `${EMOJIS.CROSS} Ocurrió un error al obtener la lista de eventos.`,
            ephemeral: true
        });
    }
} 