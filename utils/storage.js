import { promises as fs } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, '..', 'data');
const defaultData = {
    levels: {},
    settings: {},
    automod: {},
    roleRewards: {},
    customCommands: {}
};

let data = { ...defaultData };

// Asegurarse de que el directorio data existe
async function ensureDataDir() {
    try {
        await fs.access(DATA_DIR);
    } catch {
        await fs.mkdir(DATA_DIR, { recursive: true });
    }
}

// Cargar datos
async function loadData() {
    try {
        await ensureDataDir();
        const files = await fs.readdir(DATA_DIR);
        
        for (const file of files) {
            if (file.endsWith('.json')) {
                const content = await fs.readFile(join(DATA_DIR, file), 'utf8');
                const key = file.replace('.json', '');
                data[key] = JSON.parse(content);
            }
        }
        
        logger.info('Datos cargados correctamente');
    } catch (error) {
        logger.error('Error al cargar datos:', error);
    }
}

// Guardar datos
async function saveData(key) {
    try {
        await ensureDataDir();
        await fs.writeFile(
            join(DATA_DIR, `${key}.json`),
            JSON.stringify(data[key], null, 2),
            'utf8'
        );
    } catch (error) {
        logger.error(`Error al guardar ${key}:`, error);
    }
}

// Funciones de niveles
export function getUserData(userId, guildId) {
    const key = `${guildId}-${userId}`;
    return data.levels[key] || { xp: 0, level: 0, lastMessageTime: 0 };
}

export function updateUserXP(userId, guildId, xp, level, lastMessageTime) {
    const key = `${guildId}-${userId}`;
    data.levels[key] = { xp, level, lastMessageTime };
    saveData('levels');
}

// Funciones de configuración
export function getGuildSettings(guildId) {
    return data.settings[guildId] || {
        prefix: '!',
        language: 'es',
        welcomeChannel: null,
        logChannel: null,
        musicChannel: null,
        djRole: null,
        xpSettings: {
            xpPerMessage: 15,
            cooldown: 60
        }
    };
}

export function updateGuildSettings(guildId, settings) {
    data.settings[guildId] = {
        ...data.settings[guildId],
        ...settings
    };
    saveData('settings');
}

// Funciones de auto-moderación
export function getAutoModRules(guildId) {
    return data.automod[guildId] || [];
}

export function updateAutoModRule(guildId, ruleType, ruleValue) {
    if (!data.automod[guildId]) {
        data.automod[guildId] = [];
    }
    
    const ruleIndex = data.automod[guildId].findIndex(r => r.rule_type === ruleType);
    if (ruleIndex >= 0) {
        data.automod[guildId][ruleIndex].rule_value = ruleValue;
    } else {
        data.automod[guildId].push({ rule_type: ruleType, rule_value: ruleValue });
    }
    
    saveData('automod');
}

// Funciones de roles por nivel
export function getRoleRewards(guildId) {
    return data.roleRewards[guildId] || [];
}

export function addRoleReward(guildId, level, roleId) {
    if (!data.roleRewards[guildId]) {
        data.roleRewards[guildId] = [];
    }
    
    const rewardIndex = data.roleRewards[guildId].findIndex(r => r.level === level);
    if (rewardIndex >= 0) {
        data.roleRewards[guildId][rewardIndex].roleId = roleId;
    } else {
        data.roleRewards[guildId].push({ level, roleId });
    }
    
    saveData('roleRewards');
}

export function removeRoleReward(guildId, level) {
    if (data.roleRewards[guildId]) {
        data.roleRewards[guildId] = data.roleRewards[guildId].filter(r => r.level !== level);
        saveData('roleRewards');
    }
}

// Función de inicialización
export async function initializeStorage() {
    await loadData();
    return data;
}

// Función de cierre
export async function closeStorage() {
    // Guardar todos los datos antes de cerrar
    for (const key of Object.keys(data)) {
        await saveData(key);
    }
    logger.info('Almacenamiento cerrado correctamente');
} 