import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getDatabase } from '../../database.js';
import { scheduleJob, cancelJob } from 'node-schedule';

// Constantes para emojis y colores
const EMOJIS = {
    EVENT: '📅',
    TIME: '⏰',
    LOCATION: '📍',
    USERS: '👥',
    CHECK: '✅',
    CROSS: '❌',
    ALERT: '⚠️',
    INFO: 'ℹ️',
    BELL: '🔔',
    STAR: '⭐',
    CROWN: '👑',
    WAITLIST: '⏳',
    CALENDAR: {
        PAST: '📅',
        ACTIVE: '📆',
        FUTURE: '🗓️'
    }
};

const COLORS = {
    PRIMARY: 0x3498DB,    // Azul para eventos activos
    SUCCESS: 0x2ECC71,    // Verde para eventos confirmados
    WARNING: 0xF1C40F,    // Amarillo para eventos próximos
    ERROR: 0xE74C3C,      // Rojo para eventos cancelados
    INFO: 0x95A5A6        // Gris para eventos pasados
};

// Mapa para almacenar los trabajos programados de recordatorios
const scheduledReminders = new Map();

/**
 * Crea un nuevo evento
 * @param {Object} options - Opciones del evento
 * @returns {Promise<Object>} Datos del evento creado
 */
async function createEvent(options) {
    const db = getDatabase();
    
    try {
        const result = await db.run(`
            INSERT INTO events (
                guild_id, creator_id, title, description,
                start_time, end_time, location, max_participants,
                required_role_id, reminder_times, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            options.guildId,
            options.creatorId,
            options.title,
            options.description,
            options.startTime.getTime(),
            options.endTime?.getTime(),
            options.location,
            options.maxParticipants,
            options.requiredRoleId,
            JSON.stringify(options.reminderTimes || [60, 30, 10]),
            Date.now(),
            Date.now()
        ]);

        const event = {
            id: result.lastID,
            ...options
        };

        // Programar recordatorios
        scheduleEventReminders(event);

        return event;
    } catch (error) {
        console.error('[Event System] Error al crear evento:', error);
        throw error;
    }
}

/**
 * Registra un participante en un evento
 * @param {number} eventId - ID del evento
 * @param {string} userId - ID del usuario
 * @returns {Promise<Object>} Resultado del registro
 */
async function registerParticipant(eventId, userId) {
    const db = getDatabase();
    
    try {
        const event = await getEvent(eventId);
        if (!event) return { success: false, reason: 'EVENT_NOT_FOUND' };

        // Verificar si el evento está lleno
        const participants = await getEventParticipants(eventId);
        const registeredCount = participants.filter(p => p.status === 'registered').length;
        
        let status = 'registered';
        if (event.maxParticipants && registeredCount >= event.maxParticipants) {
            status = 'waitlist';
        }

        await db.run(`
            INSERT OR REPLACE INTO event_participants (
                event_id, user_id, status, registered_at
            ) VALUES (?, ?, ?, ?)
        `, [eventId, userId, status, Date.now()]);

        return {
            success: true,
            status,
            position: status === 'waitlist' ? registeredCount - event.maxParticipants + 1 : null
        };
    } catch (error) {
        console.error('[Event System] Error al registrar participante:', error);
        return { success: false, reason: 'DATABASE_ERROR' };
    }
}

/**
 * Cancela la participación de un usuario en un evento
 * @param {number} eventId - ID del evento
 * @param {string} userId - ID del usuario
 * @returns {Promise<boolean>} True si se canceló correctamente
 */
async function cancelParticipation(eventId, userId) {
    const db = getDatabase();
    
    try {
        await db.run(`
            UPDATE event_participants
            SET status = 'cancelled'
            WHERE event_id = ? AND user_id = ?
        `, [eventId, userId]);

        // Mover el primer usuario en lista de espera a registrado
        const waitlist = await db.get(`
            SELECT user_id FROM event_participants
            WHERE event_id = ? AND status = 'waitlist'
            ORDER BY registered_at ASC LIMIT 1
        `, [eventId]);

        if (waitlist) {
            await db.run(`
                UPDATE event_participants
                SET status = 'registered'
                WHERE event_id = ? AND user_id = ?
            `, [eventId, waitlist.user_id]);
        }

        return true;
    } catch (error) {
        console.error('[Event System] Error al cancelar participación:', error);
        return false;
    }
}

/**
 * Obtiene los participantes de un evento
 * @param {number} eventId - ID del evento
 * @returns {Promise<Array>} Lista de participantes
 */
async function getEventParticipants(eventId) {
    const db = getDatabase();
    
    try {
        return await db.all(`
            SELECT * FROM event_participants
            WHERE event_id = ?
            ORDER BY 
                CASE status
                    WHEN 'registered' THEN 1
                    WHEN 'waitlist' THEN 2
                    WHEN 'cancelled' THEN 3
                END,
                registered_at ASC
        `, [eventId]);
    } catch (error) {
        console.error('[Event System] Error al obtener participantes:', error);
        return [];
    }
}

/**
 * Obtiene un evento por su ID
 * @param {number} eventId - ID del evento
 * @returns {Promise<Object>} Datos del evento
 */
async function getEvent(eventId) {
    const db = getDatabase();
    
    try {
        const event = await db.get('SELECT * FROM events WHERE id = ?', [eventId]);
        if (event) {
            event.reminderTimes = JSON.parse(event.reminder_times);
            event.startTime = new Date(event.start_time);
            if (event.end_time) event.endTime = new Date(event.end_time);
        }
        return event;
    } catch (error) {
        console.error('[Event System] Error al obtener evento:', error);
        return null;
    }
}

/**
 * Programa los recordatorios para un evento
 * @param {Object} event - Datos del evento
 */
function scheduleEventReminders(event) {
    // Cancelar recordatorios existentes
    const existingJobs = scheduledReminders.get(event.id) || [];
    existingJobs.forEach(job => job.cancel());
    scheduledReminders.delete(event.id);

    const jobs = [];
    event.reminderTimes.forEach(minutes => {
        const reminderTime = new Date(event.startTime.getTime() - minutes * 60000);
        if (reminderTime > new Date()) {
            const job = scheduleJob(reminderTime, async () => {
                try {
                    await sendEventReminder(event, minutes);
                } catch (error) {
                    console.error('[Event System] Error al enviar recordatorio:', error);
                }
            });
            jobs.push(job);
        }
    });

    if (jobs.length > 0) {
        scheduledReminders.set(event.id, jobs);
    }
}

/**
 * Envía un recordatorio de evento
 * @param {Object} event - Datos del evento
 * @param {number} minutes - Minutos antes del evento
 */
async function sendEventReminder(event, minutes) {
    const db = getDatabase();
    
    try {
        // Registrar que se envió el recordatorio
        await db.run(`
            INSERT OR IGNORE INTO event_reminders_sent (
                event_id, reminder_time, sent_at
            ) VALUES (?, ?, ?)
        `, [event.id, minutes, Date.now()]);

        // Obtener participantes registrados
        const participants = await getEventParticipants(event.id);
        const registered = participants.filter(p => p.status === 'registered');

        // Crear embed del recordatorio
        const embed = createEventEmbed(event, true);
        embed.setTitle(`${EMOJIS.BELL} ¡Recordatorio de Evento!`)
            .setDescription(`El evento **${event.title}** comenzará en ${minutes} minutos.\n\n${event.description}`);

        // Enviar recordatorio
        const client = (await import('../../index.js')).client;
        const channel = await client.channels.fetch(event.channelId);
        
        if (channel) {
            await channel.send({
                content: registered.map(p => `<@${p.user_id}>`).join(' '),
                embeds: [embed]
            });
        }
    } catch (error) {
        console.error('[Event System] Error al enviar recordatorio:', error);
    }
}

/**
 * Crea un embed para mostrar un evento
 * @param {Object} event - Datos del evento
 * @param {boolean} isReminder - Si es un recordatorio
 * @returns {EmbedBuilder} Embed del evento
 */
function createEventEmbed(event, isReminder = false) {
    const now = new Date();
    const timeUntil = event.startTime - now;
    const isActive = timeUntil > 0 && (!event.endTime || event.endTime > now);

    const embed = new EmbedBuilder()
        .setColor(isReminder ? COLORS.WARNING :
                 timeUntil < 0 ? COLORS.INFO :
                 timeUntil < 3600000 ? COLORS.WARNING : // 1 hora
                 COLORS.PRIMARY)
        .setTitle(`${isActive ? EMOJIS.CALENDAR.ACTIVE : EMOJIS.CALENDAR.PAST} ${event.title}`)
        .setDescription(event.description);

    // Campos básicos
    embed.addFields(
        {
            name: `${EMOJIS.TIME} Fecha y Hora`,
            value: `<t:${Math.floor(event.startTime.getTime() / 1000)}:F>`,
            inline: true
        },
        {
            name: `${EMOJIS.INFO} Estado`,
            value: timeUntil < 0 ? '`Finalizado`' :
                   `<t:${Math.floor(event.startTime.getTime() / 1000)}:R>`,
            inline: true
        }
    );

    // Campos opcionales
    if (event.location) {
        embed.addFields({
            name: `${EMOJIS.LOCATION} Ubicación`,
            value: event.location,
            inline: true
        });
    }

    if (event.maxParticipants) {
        embed.addFields({
            name: `${EMOJIS.USERS} Participantes`,
            value: `\`0/${event.maxParticipants}\``,
            inline: true
        });
    }

    if (event.requiredRoleId) {
        embed.addFields({
            name: `${EMOJIS.STAR} Rol Requerido`,
            value: `<@&${event.requiredRoleId}>`,
            inline: true
        });
    }

    return embed;
}

/**
 * Crea los botones para interactuar con un evento
 * @param {Object} event - Datos del evento
 * @param {boolean} isParticipant - Si el usuario ya está registrado
 * @returns {ActionRowBuilder} Fila de botones
 */
function createEventButtons(event, isParticipant = false) {
    const row = new ActionRowBuilder();
    
    if (isParticipant) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`event_cancel_${event.id}`)
                .setLabel('Cancelar Participación')
                .setStyle(ButtonStyle.Danger)
                .setEmoji(EMOJIS.CROSS)
        );
    } else {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`event_join_${event.id}`)
                .setLabel('Participar')
                .setStyle(ButtonStyle.Success)
                .setEmoji(EMOJIS.CHECK)
        );
    }

    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`event_info_${event.id}`)
            .setLabel('Más Información')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(EMOJIS.INFO)
    );

    return row;
}

/**
 * Carga los recordatorios existentes al iniciar el bot
 */
async function loadExistingEvents() {
    const db = getDatabase();
    
    try {
        const events = await db.all(`
            SELECT * FROM events
            WHERE start_time > ?
        `, [Date.now()]);

        for (const event of events) {
            event.reminderTimes = JSON.parse(event.reminder_times);
            event.startTime = new Date(event.start_time);
            if (event.end_time) event.endTime = new Date(event.end_time);
            
            scheduleEventReminders(event);
        }

        console.log(`[Event System] Cargados ${events.length} eventos`);
    } catch (error) {
        console.error('[Event System] Error al cargar eventos:', error);
    }
}

export {
    createEvent,
    registerParticipant,
    cancelParticipation,
    getEventParticipants,
    getEvent,
    createEventEmbed,
    createEventButtons,
    loadExistingEvents,
    EMOJIS,
    COLORS
}; 