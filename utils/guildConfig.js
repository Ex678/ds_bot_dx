import { Collection } from 'discord.js';
import logger from './logger.js';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

class GuildConfig {
    constructor() {
        this.configs = new Collection();
        this.configPath = path.join(process.cwd(), 'data', 'guildConfigs.json');
        this.defaultConfig = {
            prefix: '!',
            language: 'es',
            welcomeChannel: null,
            logChannel: null,
            musicChannel: null,
            djRole: null,
            moderationRoles: [],
            autoRoles: [],
            levelSystem: {
                enabled: true,
                announceChannel: null,
                xpRate: 1,
                xpPerMessage: 15,
                cooldown: 60,
                roleRewards: {}
            },
            disabledCommands: [],
            customCommands: {},
            automod: {
                enabled: false,
                ignoredChannels: [],
                ignoredRoles: [],
                maxMentions: 5,
                maxLines: 10,
                filterInvites: true,
                filterLinks: false,
                filterWords: []
            }
        };
    }

    /**
     * Inicializa el sistema de configuración
     */
    async init() {
        try {
            const data = await readFile(this.configPath, 'utf-8');
            const configs = JSON.parse(data);
            
            for (const [guildId, config] of Object.entries(configs)) {
                this.configs.set(guildId, { ...this.defaultConfig, ...config });
            }
            
            logger.info('Sistema de configuración inicializado');
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.info('No se encontró archivo de configuración, creando uno nuevo');
                await this.saveConfigs();
            } else {
                logger.error('Error al cargar configuraciones:', error);
            }
        }
    }

    /**
     * Obtiene la configuración de un servidor
     * @param {string} guildId - ID del servidor
     * @returns {Object} Configuración del servidor
     */
    getConfig(guildId) {
        if (!this.configs.has(guildId)) {
            this.configs.set(guildId, { ...this.defaultConfig });
        }
        return this.configs.get(guildId);
    }

    /**
     * Actualiza la configuración de un servidor
     * @param {string} guildId - ID del servidor
     * @param {Object} newConfig - Nueva configuración
     */
    async updateConfig(guildId, newConfig) {
        try {
            const currentConfig = this.getConfig(guildId);
            const updatedConfig = {
                ...currentConfig,
                ...newConfig
            };
            
            this.configs.set(guildId, updatedConfig);
            await this.saveConfigs();
            
            logger.info(`Configuración actualizada para el servidor ${guildId}`);
            return true;
        } catch (error) {
            logger.error(`Error al actualizar configuración del servidor ${guildId}:`, error);
            return false;
        }
    }

    /**
     * Guarda todas las configuraciones en el archivo
     */
    async saveConfigs() {
        try {
            const configData = Object.fromEntries(this.configs);
            await writeFile(this.configPath, JSON.stringify(configData, null, 2));
            logger.debug('Configuraciones guardadas exitosamente');
        } catch (error) {
            logger.error('Error al guardar configuraciones:', error);
            throw error;
        }
    }

    /**
     * Resetea la configuración de un servidor
     * @param {string} guildId - ID del servidor
     */
    async resetConfig(guildId) {
        try {
            this.configs.set(guildId, { ...this.defaultConfig });
            await this.saveConfigs();
            logger.info(`Configuración reseteada para el servidor ${guildId}`);
            return true;
        } catch (error) {
            logger.error(`Error al resetear configuración del servidor ${guildId}:`, error);
            return false;
        }
    }

    /**
     * Elimina la configuración de un servidor
     * @param {string} guildId - ID del servidor
     */
    async deleteConfig(guildId) {
        try {
            this.configs.delete(guildId);
            await this.saveConfigs();
            logger.info(`Configuración eliminada para el servidor ${guildId}`);
            return true;
        } catch (error) {
            logger.error(`Error al eliminar configuración del servidor ${guildId}:`, error);
            return false;
        }
    }
}

export default new GuildConfig(); 