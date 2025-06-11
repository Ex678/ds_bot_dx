import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { createGzip } from 'zlib';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import logger from './logger.js';

class BackupSystem {
    constructor() {
        this.backupDir = join(process.cwd(), 'backups');
        this.maxBackups = 7; // Mantener una semana de respaldos
    }

    /**
     * Inicializa el sistema de respaldo
     */
    async init() {
        try {
            await mkdir(this.backupDir, { recursive: true });
            logger.info('Sistema de respaldo inicializado');
        } catch (error) {
            logger.error('Error al inicializar sistema de respaldo:', error);
        }
    }

    /**
     * Crea un respaldo de un archivo
     * @param {string} sourcePath - Ruta del archivo a respaldar
     * @param {string} name - Nombre identificador del respaldo
     */
    async backupFile(sourcePath, name) {
        try {
            const date = new Date().toISOString().split('T')[0];
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = join(this.backupDir, `${date}_${name}_${timestamp}.gz`);

            const gzip = createGzip();
            const source = createReadStream(sourcePath);
            const destination = createWriteStream(backupPath);

            await pipeline(source, gzip, destination);
            
            logger.info(`Respaldo creado: ${backupPath}`);
            
            // Limpiar respaldos antiguos
            await this.cleanOldBackups(name);
        } catch (error) {
            logger.error(`Error al crear respaldo de ${name}:`, error);
        }
    }

    /**
     * Limpia respaldos antiguos
     * @param {string} name - Nombre identificador del respaldo
     */
    async cleanOldBackups(name) {
        try {
            const files = await readdir(this.backupDir);
            const backups = files
                .filter(file => file.includes(name))
                .sort((a, b) => b.localeCompare(a)); // Ordenar por fecha descendente

            // Eliminar respaldos más antiguos que maxBackups
            if (backups.length > this.maxBackups) {
                for (const file of backups.slice(this.maxBackups)) {
                    await unlink(join(this.backupDir, file));
                    logger.debug(`Respaldo antiguo eliminado: ${file}`);
                }
            }
        } catch (error) {
            logger.error('Error al limpiar respaldos antiguos:', error);
        }
    }

    /**
     * Programa respaldos automáticos
     * @param {Object} config - Configuración de respaldos
     */
    scheduleBackups(config) {
        // Respaldar cada 24 horas
        setInterval(async () => {
            for (const [name, path] of Object.entries(config)) {
                await this.backupFile(path, name);
            }
        }, 24 * 60 * 60 * 1000);

        logger.info('Respaldos automáticos programados');
    }
}

export default new BackupSystem(); 