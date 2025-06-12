import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { initializeStorage as getDatabase, getGuildSettings, getUserData, updateUserXP, getRoleRewards } from '../utils/storage.js';
import { EmbedBuilder } from 'discord.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Constantes para emojis y colores
const EMOJIS = {
    LEVEL_UP: '⭐',
    XP: '✨',
    MESSAGE: '💬',
    REWARD: '🎁',
    LEVEL: '📊',
    SUCCESS: '✅',
    ERROR: '❌',
    CROWN: '👑',
    SPARKLES: '✨',
    TROPHY: '🏆',
    MEDAL: '🎖️',
    STAR: '⭐',
    CHART: '📈',
    NOTES: ['🎯', '🎮', '🎲', '🎪', '🎨', '🎭', '🎪', '🎟️']
};

const COLORS = {
    PRIMARY: 0x9B59B6,    // Púrpura para el tema principal
    SUCCESS: 0x2ECC71,    // Verde para éxitos
    ERROR: 0xE74C3C,      // Rojo para errores
    WARNING: 0xF1C40F,    // Amarillo para advertencias
    SPECIAL: 0x3498DB     // Azul para eventos especiales
};

// --- XP GAIN CONFIGURATION ---
// Base XP awarded for each message.
const XP_PER_MESSAGE = 15;
// For every `XP_BONUS_PER_CHARS` characters in a message, `XP_BONUS_CHAR_UNIT` XP is added.
const XP_BONUS_PER_CHARS = 10; 
// How much XP is awarded per unit of `XP_BONUS_PER_CHARS`.
const XP_BONUS_CHAR_UNIT = 1;  
// Maximum XP that can be gained from message length bonus.
const MAX_XP_BONUS_FROM_LENGTH = 5;
// Cooldown in seconds between messages that grant XP to a user.
const COOLDOWN = 60000; // 60 segundos en milisegundos
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
 * Maneja un mensaje para otorgar XP al usuario.
 * @param {object} message - Objeto del mensaje de Discord.
 * @returns {Promise<object|null>} Datos actualizados del usuario o null si no se otorgó XP.
 */
async function handleMessageForXP(message) {
    try {
        const userData = getUserData(message.author.id, message.guild.id);
        const now = Date.now();

        // Verificar cooldown
        if (now - userData.lastMessageTime < COOLDOWN) {
            return false;
        }

        // Calcular bonus por longitud del mensaje
        const lengthBonus = Math.min(
            MAX_XP_BONUS_FROM_LENGTH,
            Math.floor(message.content.length / XP_BONUS_PER_CHARS) * XP_BONUS_CHAR_UNIT
        );

        // Calcular nuevo XP
        const newXP = userData.xp + XP_PER_MESSAGE + lengthBonus;
        updateUserXP(message.author.id, message.guild.id, newXP, userData.level, now);
        return true;
    } catch (error) {
        logger.error('Error al manejar XP:', error);
        return false;
    }
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
async function checkAndHandleLevelUp(message) {
    try {
        const userData = getUserData(message.author.id, message.guild.id);
        const currentLevel = userData.level;
        const xpForNextLevel = getXpNeededForLevel(currentLevel + 1);

        if (userData.xp >= xpForNextLevel) {
            const newLevel = currentLevel + 1;
            updateUserXP(message.author.id, message.guild.id, userData.xp, newLevel, userData.lastMessageTime);

            const settings = getGuildSettings(message.guild.id);
            const announceChannel = settings.levelUpChannel 
                ? message.guild.channels.cache.get(settings.levelUpChannel)
                : message.channel;

            if (announceChannel) {
                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('¡Subida de Nivel! 🎉')
                    .setDescription(`¡Felicidades ${message.author}! Has alcanzado el nivel **${newLevel}**`)
                    .setThumbnail(message.author.displayAvatarURL())
                    .setTimestamp();

                await announceChannel.send({ embeds: [embed] });
            }

            return true;
        }

        return false;
    } catch (error) {
        logger.error('Error al verificar subida de nivel:', error);
        return false;
    }
}

/**
 * Maneja la asignación de roles basada en el nivel.
 * @param {object} member - Objeto GuildMember de Discord.
 * @param {object} userData - Datos del usuario.
 */
async function handleRoleRewards(message) {
    try {
        const userData = getUserData(message.author.id, message.guild.id);
        const roleRewards = getRoleRewards(message.guild.id);

        if (!roleRewards.length) return;

        for (const reward of roleRewards) {
            if (userData.level >= reward.level) {
                const role = message.guild.roles.cache.get(reward.roleId);
                if (role && !message.member.roles.cache.has(role.id)) {
                    await message.member.roles.add(role);
                    await message.channel.send(`🎭 ¡${message.author} ha desbloqueado el rol **${role.name}**!`);
                }
            }
        }
    } catch (error) {
        logger.error('Error al manejar recompensas de roles:', error);
    }
}

export {
    handleMessageForXP,
    checkAndHandleLevelUp,
    handleRoleRewards,
    getXpNeededForLevel
};
