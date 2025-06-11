import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db = null;

export async function initializeDatabase() {
    try {
        db = await open({
            filename: join(__dirname, 'bot.db'),
            driver: sqlite3.Database
        });

        // Habilitar claves foráneas
        await db.run('PRAGMA foreign_keys = ON');

        // Crear tablas si no existen
        await db.exec(`
            -- Tabla de niveles
            CREATE TABLE IF NOT EXISTS levels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                xp INTEGER DEFAULT 0,
                level INTEGER DEFAULT 0,
                messages_count INTEGER DEFAULT 0,
                last_message_timestamp INTEGER DEFAULT 0,
                created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                UNIQUE(user_id, guild_id)
            );

            -- Tabla de roles por nivel
            CREATE TABLE IF NOT EXISTS level_roles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT NOT NULL,
                role_id TEXT NOT NULL,
                level_required INTEGER NOT NULL,
                created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                UNIQUE(guild_id, role_id)
            );

            -- Tabla de configuración por servidor
            CREATE TABLE IF NOT EXISTS guild_settings (
                guild_id TEXT PRIMARY KEY,
                xp_per_message INTEGER DEFAULT 10,
                xp_cooldown_seconds INTEGER DEFAULT 60,
                level_up_channel_id TEXT,
                level_up_message TEXT DEFAULT '🎉 ¡Felicidades {user}! Has subido al nivel **{level}**!',
                created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
            );

            -- Tabla de auto-moderación
            CREATE TABLE IF NOT EXISTS auto_mod_rules (
                guild_id TEXT,
                enabled BOOLEAN DEFAULT false,
                max_mentions INTEGER DEFAULT 5,
                max_lines INTEGER DEFAULT 10,
                filter_invites BOOLEAN DEFAULT true,
                filter_links BOOLEAN DEFAULT false,
                ignored_channels TEXT DEFAULT '[]',
                ignored_roles TEXT DEFAULT '[]',
                filtered_words TEXT DEFAULT '[]',
                PRIMARY KEY (guild_id)
            );

            -- Crear tablas de auto-moderación
            CREATE TABLE IF NOT EXISTS filtered_words (
                guild_id TEXT,
                word TEXT,
                severity INTEGER DEFAULT 1,
                rule_type TEXT DEFAULT 'block',
                created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                PRIMARY KEY (guild_id, word)
            );

            CREATE TABLE IF NOT EXISTS auto_mod_settings (
                guild_id TEXT PRIMARY KEY,
                enabled BOOLEAN DEFAULT false,
                max_mentions INTEGER DEFAULT 5,
                max_lines INTEGER DEFAULT 10,
                filter_invites BOOLEAN DEFAULT true,
                filter_links BOOLEAN DEFAULT false,
                ignored_channels TEXT DEFAULT '[]',
                ignored_roles TEXT DEFAULT '[]',
                created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
            );

            CREATE TABLE IF NOT EXISTS auto_mod_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id TEXT,
                user_id TEXT,
                action TEXT,
                reason TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
            );

            -- Trigger para actualizar updated_at en levels
            CREATE TRIGGER IF NOT EXISTS update_levels_timestamp 
            AFTER UPDATE ON levels
            BEGIN
                UPDATE levels SET updated_at = (strftime('%s', 'now') * 1000)
                WHERE id = NEW.id;
            END;

            -- Trigger para actualizar updated_at en guild_settings
            CREATE TRIGGER IF NOT EXISTS update_guild_settings_timestamp 
            AFTER UPDATE ON guild_settings
            BEGIN
                UPDATE guild_settings SET updated_at = (strftime('%s', 'now') * 1000)
                WHERE guild_id = NEW.guild_id;
            END;
        `);

        console.log('[Database] Base de datos inicializada correctamente');
        return db;
    } catch (error) {
        console.error('[Database] Error al inicializar la base de datos:', error);
        throw error;
    }
}

export function getDatabase() {
    if (!db) {
        throw new Error('[Database] La base de datos no ha sido inicializada. Llama a initializeDatabase() primero.');
    }
    return db;
}

// Función para cerrar la conexión
export async function closeDatabase() {
    if (db) {
        await db.close();
        db = null;
        console.log('[Database] Conexión a la base de datos cerrada');
    }
}

// Funciones de utilidad para las configuraciones del servidor
export async function getGuildSettings(guildId) {
    const db = getDatabase();
    try {
        let settings = await db.get('SELECT * FROM guild_settings WHERE guild_id = ?', [guildId]);
        
        if (!settings) {
            // Crear configuración por defecto si no existe
            await db.run(`
                INSERT INTO guild_settings (
                    guild_id, 
                    xp_per_message, 
                    xp_cooldown_seconds
                ) VALUES (?, 10, 60)
            `, [guildId]);
            
            settings = await db.get('SELECT * FROM guild_settings WHERE guild_id = ?', [guildId]);
        }
        
        return settings;
    } catch (error) {
        console.error('[Database] Error al obtener configuración del servidor:', error);
        throw error;
    }
}

export async function updateGuildSettings(guildId, settings) {
    const db = getDatabase();
    try {
        const keys = Object.keys(settings);
        const values = Object.values(settings);
        
        if (keys.length === 0) return;

        const query = `
            UPDATE guild_settings 
            SET ${keys.map(key => `${key} = ?`).join(', ')}
            WHERE guild_id = ?
        `;

        await db.run(query, [...values, guildId]);
    } catch (error) {
        console.error('[Database] Error al actualizar configuración del servidor:', error);
        throw error;
    }
}

// Funciones de utilidad para los roles por nivel
export async function getLevelRoles(guildId) {
    const db = getDatabase();
    try {
        return await db.all('SELECT * FROM level_roles WHERE guild_id = ? ORDER BY level_required', [guildId]);
    } catch (error) {
        console.error('[Database] Error al obtener roles por nivel:', error);
        throw error;
    }
}

export async function addLevelRole(guildId, roleId, levelRequired) {
    const db = getDatabase();
    try {
        await db.run(`
            INSERT INTO level_roles (guild_id, role_id, level_required)
            VALUES (?, ?, ?)
            ON CONFLICT(guild_id, role_id) 
            DO UPDATE SET level_required = ?
        `, [guildId, roleId, levelRequired, levelRequired]);
    } catch (error) {
        console.error('[Database] Error al añadir rol por nivel:', error);
        throw error;
    }
}

export async function removeLevelRole(guildId, roleId) {
    const db = getDatabase();
    try {
        await db.run('DELETE FROM level_roles WHERE guild_id = ? AND role_id = ?', [guildId, roleId]);
    } catch (error) {
        console.error('[Database] Error al eliminar rol por nivel:', error);
        throw error;
    }
} 