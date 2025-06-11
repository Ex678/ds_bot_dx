import { getDatabase } from '../database.js';
import { EmbedBuilder } from 'discord.js';

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
export async function checkAutoMod(message) {
    const db = getDatabase();
    
    // Obtener reglas activas para el servidor
    const rules = await db.all(`
        SELECT * FROM auto_mod_rules
        WHERE guild_id = ? AND enabled = 1
    `, [message.guild.id]);
    
    for (const rule of rules) {
        const ruleData = JSON.parse(rule.rule_data);
        let violation = false;
        
        switch (rule.rule_type) {
            case 'SPAM':
                // Implementar lógica de detección de spam
                break;
                
            case 'CAPS':
                const upperCount = message.content.replace(/[^A-Z]/g, '').length;
                const totalCount = message.content.replace(/[^A-Za-z]/g, '').length;
                if (totalCount > 10 && (upperCount / totalCount) > ruleData.threshold) {
                    violation = true;
                }
                break;
                
            case 'LINKS':
                if (ruleData.blocked_domains) {
                    const urlRegex = /(https?:\/\/[^\s]+)/g;
                    const urls = message.content.match(urlRegex);
                    if (urls && urls.some(url => 
                        ruleData.blocked_domains.some(domain => url.includes(domain))
                    )) {
                        violation = true;
                    }
                }
                break;
                
            case 'MENTIONS':
                if (message.mentions.users.size > ruleData.max_mentions) {
                    violation = true;
                }
                break;
                
            case 'WORDS':
                const words = await db.all(`
                    SELECT word, severity FROM filtered_words
                    WHERE guild_id = ?
                `, [message.guild.id]);
                
                for (const { word, severity } of words) {
                    if (message.content.toLowerCase().includes(word.toLowerCase())) {
                        violation = { word, severity };
                        break;
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