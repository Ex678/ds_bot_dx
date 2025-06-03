import { EmbedBuilder } from 'discord.js';
import { getDatabase } from '../../database.js';
import { scheduleJob, cancelJob } from 'node-schedule';

// Constantes para emojis y colores
const EMOJIS = {
    CLOCK: '⏰',
    CALENDAR: '📅',
    CHECK: '✅',
    CROSS: '❌',
    BELL: '🔔',
    REPEAT: '🔁',
    NOTE: '📝',
    PIN: '📌',
    TIME: '⏱️',
    ALERT: '⚠️'
};

const COLORS = {
    PRIMARY: 0x3498DB,    // Azul para recordatorios activos
    SUCCESS: 0x2ECC71,    // Verde para recordatorios completados
    WARNING: 0xF1C40F,    // Amarillo para recordatorios próximos
    ERROR: 0xE74C3C      // Rojo para recordatorios expirados
};

// Mapa para almacenar los trabajos programados
const scheduledJobs = new Map();

/**
 * Crea un nuevo recordatorio
 * @param {Object} options - Opciones del recordatorio
 * @param {string} options.userId - ID del usuario
 * @param {string} options.guildId - ID del servidor
 * @param {string} options.channelId - ID del canal
 * @param {string} options.message - Mensaje del recordatorio
 * @param {Date} options.time - Fecha y hora del recordatorio
 * @param {boolean} options.repeat - Si el recordatorio es recurrente
 * @param {string} options.repeatInterval - Intervalo de repetición (daily, weekly, monthly)
 * @returns {Promise<Object>} Datos del recordatorio creado
 */
async function createReminder(options) {
    const db = getDatabase();
    
    try {
        const result = await db.run(`
            INSERT INTO reminders (
                user_id, guild_id, channel_id, message,
                reminder_time, repeat, repeat_interval,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            options.userId,
            options.guildId,
            options.channelId,
            options.message,
            options.time.getTime(),
            options.repeat ? 1 : 0,
            options.repeatInterval || null,
            Date.now()
        ]);

        const reminder = {
            id: result.lastID,
            ...options
        };

        // Programar el recordatorio
        scheduleReminder(reminder);

        return reminder;
    } catch (error) {
        console.error('[Reminder System] Error al crear recordatorio:', error);
        throw error;
    }
}

/**
 * Programa un recordatorio usando node-schedule
 * @param {Object} reminder - Datos del recordatorio
 */
function scheduleReminder(reminder) {
    const job = scheduleJob(reminder.time, async () => {
        try {
            const client = (await import('../../index.js')).client;
            const channel = await client.channels.fetch(reminder.channelId);
            
            if (channel) {
                const embed = createReminderEmbed(reminder, true);
                await channel.send({
                    content: `<@${reminder.userId}>`,
                    embeds: [embed]
                });
            }

            // Si es recurrente, programar el siguiente
            if (reminder.repeat) {
                const nextTime = calculateNextTime(reminder.time, reminder.repeatInterval);
                await updateReminderTime(reminder.id, nextTime);
                
                const updatedReminder = { ...reminder, time: nextTime };
                scheduleReminder(updatedReminder);
            } else {
                // Marcar como completado
                await markReminderAsCompleted(reminder.id);
            }

        } catch (error) {
            console.error('[Reminder System] Error al ejecutar recordatorio:', error);
        }
    });

    scheduledJobs.set(reminder.id, job);
}

/**
 * Calcula la próxima fecha para un recordatorio recurrente
 * @param {Date} currentTime - Fecha actual
 * @param {string} interval - Intervalo de repetición
 * @returns {Date} Próxima fecha
 */
function calculateNextTime(currentTime, interval) {
    const next = new Date(currentTime);

    switch (interval) {
        case 'daily':
            next.setDate(next.getDate() + 1);
            break;
        case 'weekly':
            next.setDate(next.getDate() + 7);
            break;
        case 'monthly':
            next.setMonth(next.getMonth() + 1);
            break;
    }

    return next;
}

/**
 * Actualiza la hora de un recordatorio
 * @param {number} reminderId - ID del recordatorio
 * @param {Date} newTime - Nueva fecha y hora
 */
async function updateReminderTime(reminderId, newTime) {
    const db = getDatabase();
    
    try {
        await db.run(`
            UPDATE reminders
            SET reminder_time = ?
            WHERE id = ?
        `, [newTime.getTime(), reminderId]);

    } catch (error) {
        console.error('[Reminder System] Error al actualizar hora:', error);
        throw error;
    }
}

/**
 * Marca un recordatorio como completado
 * @param {number} reminderId - ID del recordatorio
 */
async function markReminderAsCompleted(reminderId) {
    const db = getDatabase();
    
    try {
        await db.run(`
            UPDATE reminders
            SET completed = 1, completed_at = ?
            WHERE id = ?
        `, [Date.now(), reminderId]);

        // Cancelar el trabajo programado
        const job = scheduledJobs.get(reminderId);
        if (job) {
            job.cancel();
            scheduledJobs.delete(reminderId);
        }

    } catch (error) {
        console.error('[Reminder System] Error al marcar como completado:', error);
        throw error;
    }
}

/**
 * Elimina un recordatorio
 * @param {number} reminderId - ID del recordatorio
 * @returns {Promise<boolean>} True si se eliminó correctamente
 */
async function deleteReminder(reminderId) {
    const db = getDatabase();
    
    try {
        await db.run('DELETE FROM reminders WHERE id = ?', [reminderId]);

        // Cancelar el trabajo programado
        const job = scheduledJobs.get(reminderId);
        if (job) {
            job.cancel();
            scheduledJobs.delete(reminderId);
        }

        return true;
    } catch (error) {
        console.error('[Reminder System] Error al eliminar recordatorio:', error);
        return false;
    }
}

/**
 * Obtiene los recordatorios de un usuario
 * @param {string} userId - ID del usuario
 * @param {string} guildId - ID del servidor
 * @returns {Promise<Array>} Lista de recordatorios
 */
async function getUserReminders(userId, guildId) {
    const db = getDatabase();
    
    try {
        return await db.all(`
            SELECT * FROM reminders
            WHERE user_id = ? AND guild_id = ?
            ORDER BY reminder_time ASC
        `, [userId, guildId]);
    } catch (error) {
        console.error('[Reminder System] Error al obtener recordatorios:', error);
        return [];
    }
}

/**
 * Crea un embed para mostrar un recordatorio
 * @param {Object} reminder - Datos del recordatorio
 * @param {boolean} isNotification - Si es una notificación
 * @returns {EmbedBuilder} Embed del recordatorio
 */
function createReminderEmbed(reminder, isNotification = false) {
    const timeUntil = reminder.time - Date.now();
    const isExpired = timeUntil < 0;

    const embed = new EmbedBuilder()
        .setColor(isNotification ? COLORS.SUCCESS : 
                 isExpired ? COLORS.ERROR :
                 timeUntil < 300000 ? COLORS.WARNING : // 5 minutos
                 COLORS.PRIMARY)
        .setTitle(isNotification
            ? `${EMOJIS.BELL} ¡Recordatorio!`
            : `${EMOJIS.CLOCK} Recordatorio Programado`)
        .setDescription(reminder.message);

    if (!isNotification) {
        embed.addFields(
            {
                name: `${EMOJIS.CALENDAR} Fecha y Hora`,
                value: `<t:${Math.floor(reminder.time.getTime() / 1000)}:F>`,
                inline: true
            },
            {
                name: `${EMOJIS.TIME} Tiempo Restante`,
                value: isExpired
                    ? '`Expirado`'
                    : `<t:${Math.floor(reminder.time.getTime() / 1000)}:R>`,
                inline: true
            }
        );

        if (reminder.repeat) {
            embed.addFields({
                name: `${EMOJIS.REPEAT} Repetición`,
                value: `\`${reminder.repeatInterval}\``,
                inline: true
            });
        }
    }

    return embed;
}

/**
 * Carga los recordatorios existentes al iniciar el bot
 */
async function loadExistingReminders() {
    const db = getDatabase();
    
    try {
        const reminders = await db.all(`
            SELECT * FROM reminders
            WHERE completed = 0
            AND reminder_time > ?
        `, [Date.now()]);

        for (const reminder of reminders) {
            scheduleReminder({
                ...reminder,
                time: new Date(reminder.reminder_time)
            });
        }

        console.log(`[Reminder System] Cargados ${reminders.length} recordatorios`);
    } catch (error) {
        console.error('[Reminder System] Error al cargar recordatorios:', error);
    }
}

export {
    createReminder,
    deleteReminder,
    getUserReminders,
    createReminderEmbed,
    loadExistingReminders,
    EMOJIS,
    COLORS
}; 