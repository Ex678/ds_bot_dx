import { Events } from 'discord.js';
// Updated import to use checkMessage, assuming other functions like addStrike, logModAction might be deprecated if checkMessage handles all.
// For now, keep them if other parts of the bot use them, but messageAutoMod will simplify.
import { checkMessage, addStrike, logModAction, createModActionEmbed } from '../utils/moderation.js';
import logger from '../utils/logger.js'; // Assuming logger is preferred for console output

export const name = Events.MessageCreate;
export const once = false;

export async function execute(message) {
    // Ignorar mensajes de bots y DMs
    if (message.author.bot || !message.guild) return;

    console.log(`[messageAutoMod] Mensaje recibido de ${message.author.tag} en #${message.channel.name} de ${message.guild.name}: "${message.content}"`);

    try {
        // Call checkMessage which now handles its own logging and actions (delete, send message)
        // It returns true if an infraction was found and handled, false otherwise.
        const infractionHandled = checkMessage(message); // checkMessage is synchronous

        if (infractionHandled) {
            console.log(`[messageAutoMod] Infracción detectada y manejada por checkMessage para el mensaje de ${message.author.tag}.`);
            // At this point, checkMessage has already deleted the message and sent a warning to the channel.
            // The extensive logic for addStrike, logModAction, sending embeds, etc., that was here previously
            // might be redundant if checkMessage's direct actions are sufficient.

            // If a more advanced logging or strike system is still desired *on top of* checkMessage's actions,
            // then checkMessage would need to be refactored to return rule violation details
            // instead of just true/false and acting directly.

            // For the purpose of this task, we assume checkMessage's actions are the primary ones.
            // Further actions like logging to a mod-log channel could still be done here if needed,
            // but would require checkMessage to return info about which rule was violated.

            // Example: If you still want to log to a mod-log channel (assuming checkMessage doesn't do this)
            // This part would require checkMessage to return which rule was violated.
            // For now, this is commented out as checkMessage doesn't return rule details.
            /*
            const logChannel = message.guild.channels.cache.find(
                channel => channel.name === 'mod-logs' // Or get from config
            );
            if (logChannel) {
                const logEmbed = createModActionEmbed({ // createModActionEmbed might still be useful
                    title: '🛡️ Acción de Auto-Moderación (Info)',
                    description: `checkMessage manejó una infracción.`,
                    fields: [
                        { name: '👤 Usuario', value: `${message.author.tag} (${message.author.id})`, inline: true },
                        { name: 'ቻ Mensaje Original', value: message.content.length > 1024 ? message.content.substring(0, 1021) + '...' : message.content || '[No hay contenido de texto]', inline: false }
                    ],
                    color: 0xFF0000 // Red for infractions
                });
                await logChannel.send({ embeds: [logEmbed] });
            }
            */
        }
    } catch (error) {
        // Use the main logger for errors
        logger.error(`Error en messageAutoMod para el mensaje de ${message.author.tag}:`, error);
    }
}