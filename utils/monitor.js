import os from 'os';
import { EventEmitter } from 'events';
import logger from './logger.js';

class SystemMonitor extends EventEmitter {
    constructor() {
        super();
        this.stats = {
            uptime: 0,
            cpu: 0,
            memory: {
                total: 0,
                used: 0,
                free: 0
            },
            commands: {
                total: 0,
                success: 0,
                failed: 0
            },
            latency: 0
        };
        
        this.warnings = {
            highCPU: 80, // Porcentaje
            highMemory: 80, // Porcentaje
            highLatency: 500 // ms
        };
    }

    /**
     * Inicia el monitoreo
     * @param {import('discord.js').Client} client - Cliente de Discord
     */
    start(client) {
        this.client = client;
        
        // Monitorear cada 1 minuto
        setInterval(() => this.updateStats(), 60000);
        
        // Monitorear latencia cada 5 minutos
        setInterval(() => this.checkLatency(), 300000);
        
        logger.info('Sistema de monitoreo iniciado');
    }

    /**
     * Actualiza las estadísticas del sistema
     */
    async updateStats() {
        try {
            // CPU
            const cpuUsage = await this.getCPUUsage();
            this.stats.cpu = cpuUsage;

            // Memoria
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            
            this.stats.memory = {
                total: totalMem,
                used: usedMem,
                free: freeMem
            };

            // Uptime
            this.stats.uptime = process.uptime();

            // Verificar umbrales
            this.checkThresholds();

            // Emitir actualización
            this.emit('statsUpdate', this.stats);
        } catch (error) {
            logger.error('Error al actualizar estadísticas:', error);
        }
    }

    /**
     * Obtiene el uso de CPU
     * @returns {Promise<number>} Porcentaje de uso de CPU
     */
    async getCPUUsage() {
        return new Promise((resolve) => {
            const startUsage = process.cpuUsage();
            
            setTimeout(() => {
                const endUsage = process.cpuUsage(startUsage);
                const totalUsage = (endUsage.user + endUsage.system) / 1000000; // Convertir a segundos
                resolve(Math.round((totalUsage * 100) / os.cpus().length));
            }, 100);
        });
    }

    /**
     * Verifica la latencia del bot
     */
    async checkLatency() {
        try {
            this.stats.latency = this.client.ws.ping;
            
            if (this.stats.latency > this.warnings.highLatency) {
                logger.warn(`Alta latencia detectada: ${this.stats.latency}ms`);
                this.emit('highLatency', this.stats.latency);
            }
        } catch (error) {
            logger.error('Error al verificar latencia:', error);
        }
    }

    /**
     * Verifica los umbrales de recursos
     */
    checkThresholds() {
        // CPU
        if (this.stats.cpu > this.warnings.highCPU) {
            logger.warn(`Alto uso de CPU detectado: ${this.stats.cpu}%`);
            this.emit('highCPU', this.stats.cpu);
        }

        // Memoria
        const memoryUsagePercent = (this.stats.memory.used / this.stats.memory.total) * 100;
        if (memoryUsagePercent > this.warnings.highMemory) {
            logger.warn(`Alto uso de memoria detectado: ${memoryUsagePercent}%`);
            this.emit('highMemory', memoryUsagePercent);
        }
    }

    /**
     * Registra un comando ejecutado
     * @param {boolean} success - Si el comando se ejecutó exitosamente
     */
    logCommand(success) {
        this.stats.commands.total++;
        if (success) {
            this.stats.commands.success++;
        } else {
            this.stats.commands.failed++;
        }
    }

    /**
     * Obtiene las estadísticas actuales
     * @returns {Object} Estadísticas del sistema
     */
    getStats() {
        return {
            ...this.stats,
            commandSuccess: this.stats.commands.total > 0 
                ? (this.stats.commands.success / this.stats.commands.total * 100).toFixed(2) 
                : 100
        };
    }

    /**
     * Actualiza los umbrales de advertencia
     * @param {Object} newWarnings - Nuevos umbrales
     */
    updateWarnings(newWarnings) {
        this.warnings = {
            ...this.warnings,
            ...newWarnings
        };
        logger.info('Umbrales de advertencia actualizados:', this.warnings);
    }
}

export default new SystemMonitor(); 