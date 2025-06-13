import { getAutoModRules, updateAutoModRule } from './storage.js';
import { EmbedBuilder } from 'discord.js';
import logger from './logger.js';
import { getAutoModRules as getAutoModRulesStorage } from './storage.js';

const COLORS = {
    WARNING: 0xFFA500,
    ERROR: 0xFF0000,
    SUCCESS: 0x00FF00,
    INFO: 0x0099FF
};

/**
 * Obtiene la configuración de strikes para un servidor
 * @param {string} guildId - ID del servidor
 * @returns {Promise<Object>} Configuración de strikes
 */
export async function getStrikeConfig(guildId) {
    const db = getDatabase();
    let config = await db.get('SELECT * FROM strike_config WHERE guild_id = ?', [guildId]);
    
    if (!config) {
        // Crear configuración por defecto si no existe
        await db.run(`
            INSERT INTO strike_config (guild_id)
            VALUES (?)
        `, [guildId]);
        config = await db.get('SELECT * FROM strike_config WHERE guild_id = ?', [guildId]);
    }
    
    return config;
}

/**
 * Añade un strike a un usuario
 * @param {string} guildId - ID del servidor
 * @param {string} userId - ID del usuario
 * @param {string} moderatorId - ID del moderador
 * @param {string} reason - Razón del strike
 * @returns {Promise<Object>} Información del strike y acción recomendada
 */
export async function addStrike(guildId, userId, moderatorId, reason) {
    const db = getDatabase();
    const config = await getStrikeConfig(guildId);
    
    // Añadir el strike
    await db.run(`
        INSERT INTO user_strikes (guild_id, user_id, moderator_id, reason, expires_at)
        VALUES (?, ?, ?, ?, ?)
    `, [
        guildId,
        userId,
        moderatorId,
        reason,
        Date.now() + (config.strike_expiry * 1000)
    ]);
    
    // Contar strikes activos
    const { count } = await db.get(`
        SELECT COUNT(*) as count
        FROM user_strikes
        WHERE guild_id = ? AND user_id = ? AND active = 1 AND (expires_at > ? OR expires_at IS NULL)
    `, [guildId, userId, Date.now()]);
    
    // Determinar acción basada en número de strikes
    let action = null;
    let duration = null;
    
    if (count >= config.strikes_for_ban) {
        action = 'BAN';
    } else if (count >= config.strikes_for_kick) {
        action = 'KICK';
    } else if (count >= config.strikes_for_mute) {
        action = 'MUTE';
        duration = config.mute_duration;
    }
    
    return {
        totalStrikes: count,
        action,
        duration
    };
}

/**
 * Registra una acción de moderación
 * @param {Object} params - Parámetros de la acción
 * @returns {Promise<void>}
 */
export async function logModAction({
    guildId,
    userId,
    moderatorId,
    actionType,
    reason,
    duration = null
}) {
    const db = getDatabase();
    await db.run(`
        INSERT INTO mod_actions (
            guild_id,
            user_id,
            moderator_id,
            action_type,
            reason,
            duration,
            expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
        guildId,
        userId,
        moderatorId,
        actionType,
        reason,
        duration,
        duration ? Date.now() + (duration * 1000) : null
    ]);
}

/**
 * Crea un embed para acciones de moderación
 * @param {Object} params - Parámetros del embed
 * @returns {EmbedBuilder}
 */
export function createModActionEmbed({
    title,
    description,
    color = COLORS.INFO,
    fields = [],
    footer = null
}) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();
    
    fields.forEach(field => {
        embed.addFields({ name: field.name, value: field.value, inline: field.inline });
    });
    
    if (footer) {
        embed.setFooter(footer);
    }
    
    return embed;
}

/**
 * Verifica y ejecuta reglas de auto-moderación
 * @param {Message} message - Mensaje a verificar
 * @returns {Promise<Object|null>} Resultado de la verificación
 */
export function checkAutoMod(message) {
    if (message.author.bot) return false;

    const rules = getAutoModRules(message.guild.id);
    if (!rules || rules.length === 0) return false;

    for (const rule of rules) {
        let violation = false;
        
        switch (rule.type) {
            case 'SPAM':
                // Implementar lógica de detección de spam
                break;
                
            case 'CAPS':
                const upperCount = message.content.replace(/[^A-Z]/g, '').length;
                const totalCount = message.content.replace(/[^A-Za-z]/g, '').length;
                if (totalCount > 10 && (upperCount / totalCount) > rule.threshold) {
                    violation = true;
                }
                break;
                
            case 'LINKS':
                if (rule.blocked_domains) {
                    const urlRegex = /(https?:\/\/[^\s]+)/g;
                    const urls = message.content.match(urlRegex);
                    if (urls && urls.some(url => 
                        rule.blocked_domains.some(domain => url.includes(domain))
                    )) {
                        violation = true;
                    }
                }
                break;
                
            case 'MENTIONS':
                if (message.mentions.users.size > rule.max_mentions) {
                    violation = true;
                }
                break;
                
            case 'WORDS':
                if (rule.filtered_words) {
                    for (const { word, severity } of rule.filtered_words) {
                        if (message.content.toLowerCase().includes(word.toLowerCase())) {
                            violation = { word, severity };
                            break;
                        }
                    }
                }
                break;
        }
        
        if (violation) {
            return {
                rule,
                violation
            };
        }
    }
    
    return null;
}

/**
 * Obtiene el historial de moderación de un usuario
 * @param {string} guildId - ID del servidor
 * @param {string} userId - ID del usuario
 * @returns {Promise<Array>} Historial de moderación
 */
export async function getUserModHistory(guildId, userId) {
    const db = getDatabase();
    return await db.all(`
        SELECT 
            ma.*,
            u.username as moderator_name
        FROM mod_actions ma
        LEFT JOIN users u ON ma.moderator_id = u.id
        WHERE ma.guild_id = ? AND ma.user_id = ?
        ORDER BY ma.created_at DESC
    `, [guildId, userId]);
}

export function checkMessage(message) {
    console.log(`[checkMessage] Verificando mensaje de ${message.author.tag}: "${message.content}"`);
    if (message.author.bot) return false;

    const rules = getAutoModRulesStorage(message.guild.id);
    console.log(`[checkMessage] Reglas obtenidas para guild ${message.guild.name} (ID: ${message.guild.id}):`, JSON.stringify(rules, null, 2));
    if (!rules || rules.length === 0) return false;

    for (const rule of rules) {
        console.log(`[checkMessage] Procesando regla: Tipo="${rule.rule_type}", Valor="${rule.rule_value}"`);
        switch (rule.rule_type) {
            case 'banned_words': {
                const wordsToBan = rule.rule_value.split(',').map(word => word.trim().toLowerCase());
                const messageContentLower = message.content.toLowerCase();
                console.log(`[checkMessage] Banned Words: Contenido="${messageContentLower}", PalabrasProhibidas="${wordsToBan}"`);
                
                for (const word of wordsToBan) {
                    if (messageContentLower.includes(word)) {
                        console.log(`[checkMessage] ¡PALABRA PROHIBIDA ENCONTRADA! Palabra: "${word}". Procediendo a borrar y advertir.`);
                        message.delete().catch(error => {
                            logger.error('Error al eliminar mensaje con palabra prohibida:', error);
                        });
                        message.channel.send(`⚠️ ${message.author}, ese tipo de lenguaje no está permitido.`);
                        return true;
                    }
                }
                break;
            }
            case 'anti_spam': {
                const maxMessages = parseInt(rule.rule_value);
                const messages = message.channel.messages.cache
                    .filter(m => 
                        m.author.id === message.author.id &&
                        m.createdTimestamp > Date.now() - 5000
                    );

                if (messages.size >= maxMessages) {
                    message.delete().catch(error => {
                        logger.error('Error al eliminar mensaje de spam:', error);
                    });
                    message.channel.send(`⚠️ ${message.author}, por favor no hagas spam.`);
                    return true;
                }
                break;
            }
            case 'anti_mention': {
                const maxMentions = parseInt(rule.rule_value);
                const mentionsCount = message.mentions.users.size + message.mentions.roles.size;
                console.log(`[checkMessage] Anti-Menciones: MencionesEnMensaje="${mentionsCount}", MaxPermitidas="${maxMentions}"`);

                if (mentionsCount > maxMentions) {
                    console.log('[checkMessage] ¡EXCESO DE MENCIONES DETECTADO!');
                    message.delete().catch(error => {
                        logger.error('Error al eliminar mensaje con menciones excesivas:', error);
                    });
                    message.channel.send(`⚠️ ${message.author}, demasiadas menciones en un solo mensaje.`);
                    return true;
                }
                break;
            }
            case 'anti_link': {
                const urlRegex = /(https?:\/\/[^\s]+)/g;
                const containsLink = urlRegex.test(message.content);
                console.log(`[checkMessage] Anti-Enlaces: ContieneLink="${containsLink}", ValorRegla="${rule.rule_value}"`);

                if (containsLink) { // Basic check if any link exists
                    const allowedDomains = rule.rule_value ? rule.rule_value.split(',').map(domain => domain.trim().toLowerCase()) : [];
                    const urlsInMessage = message.content.match(urlRegex);
                    let disallowedLinkFound = false;

                    if (urlsInMessage) {
                        if (allowedDomains.length === 0 && urlsInMessage.length > 0) {
                            // If allowedDomains is empty, any link is considered disallowed if the rule is active.
                            // However, the dashboard description implies "Dejar vacío para bloquear todos los enlaces excepto los de la lista blanca."
                            // This means if rule_value is empty string, effectively NO links are allowed unless this logic is changed.
                            // For now, let's assume an empty rule_value means "block all links if any are present".
                            // A more robust way would be a specific flag or keyword if the rule_value itself being empty means "block all".
                            // The current UI description "Dejar vacío para bloquear todos los enlaces excepto los de la lista blanca" is ambiguous.
                            // Let's assume if rule_value is empty, it means NO external links are allowed.
                            // This part might need refinement based on exact desired behavior of an empty allowedDomains list.
                            // For the log, let's just say a link was found and action will be taken based on rule.
                            // The current logic is: if allowedDomains is empty, any link is disallowed.
                            // If allowedDomains has entries, only links NOT matching those are disallowed.
                             disallowedLinkFound = true; // Default to true if any link and allowed list is empty
                             if (allowedDomains.length > 0) { // only check domains if there's an allow list
                                disallowedLinkFound = urlsInMessage.some(urlStr => {
                                    try {
                                        const domain = new URL(urlStr).hostname.toLowerCase();
                                        return !allowedDomains.some(allowed => domain.includes(allowed));
                                    } catch (e) { // Invalid URL
                                        return true; // Treat invalid URLs as something to be moderated if links are being checked
                                    }
                                });
                             }
                        } else { // allowedDomains has entries
                             disallowedLinkFound = urlsInMessage.some(urlStr => {
                                try {
                                    const domain = new URL(urlStr).hostname.toLowerCase();
                                    return !allowedDomains.some(allowed => domain.includes(allowed));
                                } catch (e) {
                                    return true;
                                }
                            });
                        }
                    }

                    if (disallowedLinkFound) {
                        console.log('[checkMessage] ¡ENLACE DETECTADO Y BLOQUEADO (ejemplo)!');
                        message.delete().catch(error => {
                            logger.error('Error al eliminar mensaje con enlace no permitido:', error);
                        });
                        message.channel.send(`⚠️ ${message.author}, los enlaces no están permitidos o no están en la lista blanca.`);
                        return true;
                    }
                }
                break;
            }
        }
    }

    return false;
}

export function updateAutoModeration(guildId, settings) {
    try {
        for (const [key, value] of Object.entries(settings)) {
            updateAutoModRule(guildId, key, value.toString());
        }
        return true;
    } catch (error) {
        logger.error('Error al actualizar reglas de auto-moderación:', error);
        return false;
    }
}

export {
    COLORS
}; 