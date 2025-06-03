import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { getDatabase, getGuildSettings, getLevelRoles } from '../database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- XP GAIN CONFIGURATION ---
// Base XP awarded for each message.
const XP_PER_MESSAGE = 10;
// For every `XP_BONUS_PER_CHARS` characters in a message, `XP_BONUS_CHAR_UNIT` XP is added.
const XP_BONUS_PER_CHARS = 10; 
// How much XP is awarded per unit of `XP_BONUS_PER_CHARS`.
const XP_BONUS_CHAR_UNIT = 1;  
// Maximum XP that can be gained from message length bonus.
const MAX_XP_BONUS_FROM_LENGTH = 5;
// Cooldown in seconds between messages that grant XP to a user.
const XP_COOLDOWN_SECONDS = 60;
// Final XP = XP_PER_MESSAGE + Min(MAX_XP_BONUS_FROM_LENGTH, Floor(message.length / XP_BONUS_PER_CHARS) * XP_BONUS_CHAR_UNIT)

// --- LEVELING FORMULA CONFIGURATION ---
// Formula: Total XP to reach Level L = LEVEL_CONSTANT * (L ^ LEVEL_POWER)
// `C` in the formula: Base XP multiplier. Adjusts overall XP needed per level.
const LEVEL_CONSTANT = 100; 
// `P` in the formula: Power exponent. Affects how steeply XP requirements increase per level.
const LEVEL_POWER = 1.5;    

// --- ROLE REWARDS CONFIGURATION ---
// Defines roles awarded at specific levels.
// To add a new reward:
// 1. Create a new object in the array: `{ level: DESIRED_LEVEL, roleId: "YOUR_ROLE_ID_HERE" }`
//    - `DESIRED_LEVEL`: The level at which the role should be awarded.
//    - `YOUR_ROLE_ID_HERE`: The actual ID of the role from your Discord server.
// 2. Ensure the bot has the 'Manage Roles' permission in your server.
// 3. Ensure the bot's highest role is positioned *above* all roles defined here in your server's role hierarchy.
// Example: { level: 5, roleId: "123456789012345678" }
const roleRewards = [
  { level: 5, roleId: "PLACEHOLDER_ROLE_ID_LEVEL_5" }, // Example: Award role for reaching level 5
  { level: 10, roleId: "PLACEHOLDER_ROLE_ID_LEVEL_10" },// Example: Award role for reaching level 10
  { level: 20, roleId: "PLACEHOLDER_ROLE_ID_LEVEL_20" } // Example: Award role for reaching level 20
  // Add more reward tiers here as needed
];
// --- END ROLE REWARDS CONFIGURATION ---

/**
 * Obtiene los datos de un usuario específico.
 * @param {string} userId - ID del usuario.
 * @param {string} guildId - ID del servidor.
 * @returns {Promise<object>} Datos del usuario o estructura por defecto si no existe.
 */
async function getUserData(userId, guildId) {
    const db = getDatabase();
    try {
        const userData = await db.get(`
            SELECT xp, level, messages_count, last_message_timestamp
            FROM levels
            WHERE user_id = ? AND guild_id = ?
        `, [userId, guildId]);

        if (userData) {
            return {
                ...userData,
                userId,
                guildId
            };
        }

        // Crear nuevo usuario
        await db.run(`
            INSERT INTO levels (user_id, guild_id, xp, level, messages_count, last_message_timestamp)
            VALUES (?, ?, 0, 0, 0, 0)
        `, [userId, guildId]);

        return {
            userId,
            guildId,
            xp: 0,
            level: 0,
            messages_count: 0,
            last_message_timestamp: 0
        };
    } catch (error) {
        console.error('[Leveling System] Error al obtener datos del usuario:', error);
        throw error;
    }
}

/**
 * Actualiza los datos de un usuario.
 * @param {object} userData - Datos del usuario a actualizar.
 */
async function updateUserData(userData) {
    const db = getDatabase();
    try {
        await db.run(`
            UPDATE levels
            SET xp = ?, level = ?, messages_count = ?, last_message_timestamp = ?
            WHERE user_id = ? AND guild_id = ?
        `, [
            userData.xp,
            userData.level,
            userData.messages_count,
            userData.last_message_timestamp,
            userData.userId,
            userData.guildId
        ]);
    } catch (error) {
        console.error('[Leveling System] Error al actualizar datos del usuario:', error);
        throw error;
    }
}

/**
 * Maneja un mensaje para otorgar XP al usuario.
 * @param {object} message - Objeto del mensaje de Discord.
 * @returns {Promise<object|null>} Datos actualizados del usuario o null si no se otorgó XP.
 */
async function handleMessageForXP(message) {
    if (message.author.bot) return null;

    const guildSettings = await getGuildSettings(message.guild.id);
    const userData = await getUserData(message.author.id, message.guild.id);
    const currentTime = Date.now();

    if ((currentTime - userData.last_message_timestamp) / 1000 < guildSettings.xp_cooldown_seconds) {
        return null;
    }

    let xpGained = guildSettings.xp_per_message;
    const messageLengthBonus = Math.min(
        Math.floor(message.content.length / 10),
        5
    );
    xpGained += messageLengthBonus;

    userData.xp += xpGained;
    userData.messages_count = (userData.messages_count || 0) + 1;
    userData.last_message_timestamp = currentTime;

    await updateUserData(userData);
    console.log(`[Leveling System] Usuario ${message.author.tag} ganó ${xpGained} XP. Total: ${userData.xp}`);

    return userData;
}

/**
 * Calcula el XP necesario para alcanzar un nivel específico.
 * @param {number} level - Nivel objetivo.
 * @returns {number} XP total requerido para alcanzar ese nivel.
 */
function getXpNeededForLevel(level) {
    if (level <= 0) return 0;
    return Math.floor(LEVEL_CONSTANT * Math.pow(level, LEVEL_POWER));
}

/**
 * Verifica y maneja la subida de nivel de un usuario.
 * @param {object} message - Objeto del mensaje de Discord.
 * @param {object} userData - Datos actuales del usuario.
 * @returns {Promise<object>} Datos actualizados del usuario.
 */
async function checkAndHandleLevelUp(message, userData) {
    let currentLevel = userData.level;
    let xpNeededForNextLevel = getXpNeededForLevel(currentLevel + 1);
    let leveledUp = false;

    while (userData.xp >= xpNeededForNextLevel) {
        currentLevel++;
        userData.level = currentLevel;
        leveledUp = true;

        const guildSettings = await getGuildSettings(message.guild.id);
        const levelUpMessage = guildSettings.level_up_message
            .replace('{user}', message.author)
            .replace('{level}', userData.level);

        try {
            const channel = guildSettings.level_up_channel_id
                ? await message.guild.channels.fetch(guildSettings.level_up_channel_id)
                : message.channel;

            await channel.send(levelUpMessage);
        } catch (error) {
            console.error(`[Leveling System] Error al enviar mensaje de nivel:`, error);
        }

        xpNeededForNextLevel = getXpNeededForLevel(currentLevel + 1);
    }

    if (leveledUp) {
        await updateUserData(userData);
        await handleRoleRewards(message.member, userData);
    }

    return userData;
}

/**
 * Maneja la asignación de roles basada en el nivel.
 * @param {object} member - Objeto GuildMember de Discord.
 * @param {object} userData - Datos del usuario.
 */
async function handleRoleRewards(member, userData) {
    if (!member?.guild || !userData) return;

    if (!member.guild.members.me.permissions.has('ManageRoles')) {
        console.error('[Role Rewards] El bot no tiene permisos para gestionar roles.');
        return;
    }

    const levelRoles = await getLevelRoles(member.guild.id);
    for (const reward of levelRoles) {
        if (userData.level >= reward.level_required) {
            if (member.roles.cache.has(reward.role_id)) continue;

            const role = member.guild.roles.cache.get(reward.role_id);
            if (!role) {
                console.error(`[Role Rewards] Rol ${reward.role_id} no encontrado.`);
                continue;
            }

            if (role.position >= member.guild.members.me.roles.highest.position) {
                console.error(`[Role Rewards] No se puede asignar el rol "${role.name}".`);
                continue;
            }

            try {
                await member.roles.add(role);
                console.log(`[Role Rewards] ${member.user.tag} recibió el rol "${role.name}"`);

                try {
                    await member.send(
                        `¡Felicidades! Has alcanzado el nivel ${reward.level_required} y se te ha otorgado el rol **${role.name}** en ${member.guild.name}.`
                    );
                } catch (dmError) {
                    console.log(`[Role Rewards] No se pudo enviar DM a ${member.user.tag}`);
                }
            } catch (error) {
                console.error(`[Role Rewards] Error al añadir rol "${role.name}":`, error);
            }
        }
    }
}

export {
    getUserData,
    updateUserData,
    handleMessageForXP,
    checkAndHandleLevelUp,
    handleRoleRewards,
    getXpNeededForLevel
};
