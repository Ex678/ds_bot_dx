import { Collection } from 'discord.js';
import logger from './logger.js';

class RateLimiter {
    constructor() {
        this.cooldowns = new Collection();
        this.globalCooldown = new Collection();
        
        // Limpiar cooldowns cada 1 hora
        setInterval(() => this.cleanup(), 3600000);
    }

    /**
     * Verifica si un comando está en cooldown
     * @param {string} commandName - Nombre del comando
     * @param {string} userId - ID del usuario
     * @param {number} cooldownAmount - Tiempo de cooldown en segundos
     * @returns {number|false} - Tiempo restante en segundos o false si no está en cooldown
     */
    checkCooldown(commandName, userId, cooldownAmount) {
        if (!this.cooldowns.has(commandName)) {
            this.cooldowns.set(commandName, new Collection());
        }

        const now = Date.now();
        const timestamps = this.cooldowns.get(commandName);
        const cooldownTime = cooldownAmount * 1000;

        if (timestamps.has(userId)) {
            const expirationTime = timestamps.get(userId) + cooldownTime;

            if (now < expirationTime) {
                const timeLeft = (expirationTime - now) / 1000;
                return Math.round(timeLeft);
            }
        }

        timestamps.set(userId, now);
        return false;
    }

    /**
     * Verifica el rate limit global de un usuario
     * @param {string} userId - ID del usuario
     * @param {number} maxCommands - Máximo número de comandos permitidos
     * @param {number} timeWindow - Ventana de tiempo en segundos
     * @returns {boolean} - true si está rate limited, false si no
     */
    isRateLimited(userId, maxCommands = 10, timeWindow = 60) {
        if (!this.globalCooldown.has(userId)) {
            this.globalCooldown.set(userId, []);
        }

        const now = Date.now();
        const userCommands = this.globalCooldown.get(userId);
        
        // Limpiar comandos antiguos
        const validCommands = userCommands.filter(timestamp => 
            now - timestamp < timeWindow * 1000
        );
        
        this.globalCooldown.set(userId, validCommands);

        if (validCommands.length >= maxCommands) {
            logger.warn(`Usuario ${userId} ha excedido el rate limit global`);
            return true;
        }

        validCommands.push(now);
        return false;
    }

    /**
     * Limpia cooldowns antiguos
     */
    cleanup() {
        const now = Date.now();
        
        this.cooldowns.forEach((timestamps, command) => {
            timestamps.forEach((timestamp, userId) => {
                if (now - timestamp > 3600000) { // 1 hora
                    timestamps.delete(userId);
                }
            });
            
            if (timestamps.size === 0) {
                this.cooldowns.delete(command);
            }
        });

        this.globalCooldown.forEach((timestamps, userId) => {
            if (timestamps.length === 0) {
                this.globalCooldown.delete(userId);
            }
        });

        logger.debug('Limpieza de cooldowns completada');
    }
}

export default new RateLimiter(); 