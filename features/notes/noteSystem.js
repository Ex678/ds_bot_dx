import { EmbedBuilder } from 'discord.js';
import { getDatabase } from '../../database.js';

// Constantes para emojis y colores
const EMOJIS = {
    NOTE: '📝',
    SAVE: '💾',
    DELETE: '🗑️',
    EDIT: '✏️',
    TAG: '🏷️',
    CATEGORY: '📁',
    PIN: '📌',
    SEARCH: '🔍',
    LIST: '📋',
    STAR: '⭐',
    LINK: '🔗',
    CHECK: '✅',
    CROSS: '❌',
    INFO: 'ℹ️'
};

const COLORS = {
    PRIMARY: 0x3498DB,    // Azul para notas normales
    PINNED: 0xF1C40F,     // Amarillo para notas fijadas
    SUCCESS: 0x2ECC71,    // Verde para acciones exitosas
    ERROR: 0xE74C3C,      // Rojo para errores
    INFO: 0x95A5A6        // Gris para información
};

/**
 * Crea una nueva nota
 * @param {Object} options - Opciones de la nota
 * @param {string} options.userId - ID del usuario
 * @param {string} options.guildId - ID del servidor
 * @param {string} options.title - Título de la nota
 * @param {string} options.content - Contenido de la nota
 * @param {string} options.category - Categoría de la nota (opcional)
 * @param {Array<string>} options.tags - Etiquetas de la nota (opcional)
 * @returns {Promise<Object>} Datos de la nota creada
 */
async function createNote(options) {
    const db = getDatabase();
    
    try {
        const result = await db.run(`
            INSERT INTO notes (
                user_id, guild_id, title, content,
                category, tags, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            options.userId,
            options.guildId,
            options.title,
            options.content,
            options.category || null,
            options.tags ? JSON.stringify(options.tags) : '[]',
            Date.now()
        ]);

        return {
            id: result.lastID,
            ...options,
            pinned: false,
            created_at: Date.now()
        };
    } catch (error) {
        console.error('[Note System] Error al crear nota:', error);
        throw error;
    }
}

/**
 * Edita una nota existente
 * @param {number} noteId - ID de la nota
 * @param {Object} updates - Campos a actualizar
 * @returns {Promise<boolean>} True si se actualizó correctamente
 */
async function editNote(noteId, updates) {
    const db = getDatabase();
    
    try {
        const fields = [];
        const values = [];

        if (updates.title !== undefined) {
            fields.push('title = ?');
            values.push(updates.title);
        }
        if (updates.content !== undefined) {
            fields.push('content = ?');
            values.push(updates.content);
        }
        if (updates.category !== undefined) {
            fields.push('category = ?');
            values.push(updates.category);
        }
        if (updates.tags !== undefined) {
            fields.push('tags = ?');
            values.push(JSON.stringify(updates.tags));
        }
        if (updates.pinned !== undefined) {
            fields.push('pinned = ?');
            values.push(updates.pinned ? 1 : 0);
        }

        fields.push('updated_at = ?');
        values.push(Date.now());

        values.push(noteId);

        await db.run(`
            UPDATE notes
            SET ${fields.join(', ')}
            WHERE id = ?
        `, values);

        return true;
    } catch (error) {
        console.error('[Note System] Error al editar nota:', error);
        return false;
    }
}

/**
 * Elimina una nota
 * @param {number} noteId - ID de la nota
 * @returns {Promise<boolean>} True si se eliminó correctamente
 */
async function deleteNote(noteId) {
    const db = getDatabase();
    
    try {
        await db.run('DELETE FROM notes WHERE id = ?', [noteId]);
        return true;
    } catch (error) {
        console.error('[Note System] Error al eliminar nota:', error);
        return false;
    }
}

/**
 * Obtiene una nota por su ID
 * @param {number} noteId - ID de la nota
 * @returns {Promise<Object>} Datos de la nota
 */
async function getNote(noteId) {
    const db = getDatabase();
    
    try {
        const note = await db.get('SELECT * FROM notes WHERE id = ?', [noteId]);
        if (note) {
            note.tags = JSON.parse(note.tags);
        }
        return note;
    } catch (error) {
        console.error('[Note System] Error al obtener nota:', error);
        return null;
    }
}

/**
 * Busca notas por varios criterios
 * @param {Object} options - Opciones de búsqueda
 * @param {string} options.userId - ID del usuario
 * @param {string} options.guildId - ID del servidor
 * @param {string} options.query - Texto a buscar
 * @param {string} options.category - Categoría a filtrar
 * @param {Array<string>} options.tags - Etiquetas a filtrar
 * @param {boolean} options.pinnedOnly - Solo notas fijadas
 * @returns {Promise<Array>} Lista de notas encontradas
 */
async function searchNotes(options) {
    const db = getDatabase();
    
    try {
        let query = `
            SELECT * FROM notes
            WHERE user_id = ? AND guild_id = ?
        `;
        const params = [options.userId, options.guildId];

        if (options.query) {
            query += ' AND (title LIKE ? OR content LIKE ?)';
            const searchPattern = `%${options.query}%`;
            params.push(searchPattern, searchPattern);
        }

        if (options.category) {
            query += ' AND category = ?';
            params.push(options.category);
        }

        if (options.tags && options.tags.length > 0) {
            const tagConditions = options.tags.map(tag => 
                `tags LIKE '%${tag}%'`
            ).join(' AND ');
            query += ` AND (${tagConditions})`;
        }

        if (options.pinnedOnly) {
            query += ' AND pinned = 1';
        }

        query += ' ORDER BY pinned DESC, created_at DESC';

        const notes = await db.all(query, params);
        return notes.map(note => ({
            ...note,
            tags: JSON.parse(note.tags)
        }));
    } catch (error) {
        console.error('[Note System] Error al buscar notas:', error);
        return [];
    }
}

/**
 * Obtiene las categorías usadas por un usuario
 * @param {string} userId - ID del usuario
 * @param {string} guildId - ID del servidor
 * @returns {Promise<Array>} Lista de categorías
 */
async function getUserCategories(userId, guildId) {
    const db = getDatabase();
    
    try {
        const categories = await db.all(`
            SELECT DISTINCT category
            FROM notes
            WHERE user_id = ? AND guild_id = ?
            AND category IS NOT NULL
            ORDER BY category
        `, [userId, guildId]);

        return categories.map(c => c.category);
    } catch (error) {
        console.error('[Note System] Error al obtener categorías:', error);
        return [];
    }
}

/**
 * Obtiene las etiquetas usadas por un usuario
 * @param {string} userId - ID del usuario
 * @param {string} guildId - ID del servidor
 * @returns {Promise<Array>} Lista de etiquetas
 */
async function getUserTags(userId, guildId) {
    const db = getDatabase();
    
    try {
        const notes = await db.all(`
            SELECT tags
            FROM notes
            WHERE user_id = ? AND guild_id = ?
        `, [userId, guildId]);

        const tagSet = new Set();
        notes.forEach(note => {
            const tags = JSON.parse(note.tags);
            tags.forEach(tag => tagSet.add(tag));
        });

        return Array.from(tagSet).sort();
    } catch (error) {
        console.error('[Note System] Error al obtener etiquetas:', error);
        return [];
    }
}

/**
 * Crea un embed para mostrar una nota
 * @param {Object} note - Datos de la nota
 * @returns {EmbedBuilder} Embed de la nota
 */
function createNoteEmbed(note) {
    const embed = new EmbedBuilder()
        .setColor(note.pinned ? COLORS.PINNED : COLORS.PRIMARY)
        .setTitle(`${note.pinned ? EMOJIS.PIN + ' ' : ''}${note.title}`)
        .setDescription(note.content)
        .setFooter({
            text: `ID: ${note.id}`
        })
        .setTimestamp(note.created_at);

    if (note.category) {
        embed.addFields({
            name: `${EMOJIS.CATEGORY} Categoría`,
            value: note.category,
            inline: true
        });
    }

    if (note.tags && note.tags.length > 0) {
        embed.addFields({
            name: `${EMOJIS.TAG} Etiquetas`,
            value: note.tags.map(tag => `\`${tag}\``).join(', '),
            inline: true
        });
    }

    return embed;
}

/**
 * Crea un embed para mostrar una lista de notas
 * @param {Array} notes - Lista de notas
 * @param {string} title - Título del embed
 * @returns {EmbedBuilder} Embed con la lista
 */
function createNoteListEmbed(notes, title) {
    const embed = new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle(`${EMOJIS.LIST} ${title}`)
        .setTimestamp();

    if (notes.length === 0) {
        embed.setDescription('No se encontraron notas.');
        return embed;
    }

    const description = notes.map(note => {
        const icons = [];
        if (note.pinned) icons.push(EMOJIS.PIN);
        if (note.category) icons.push(EMOJIS.CATEGORY);
        if (note.tags.length > 0) icons.push(EMOJIS.TAG);

        return `${icons.join('')} **${note.title}** (ID: ${note.id})` +
            (note.category ? `\n└ ${EMOJIS.CATEGORY} ${note.category}` : '');
    }).join('\n\n');

    embed.setDescription(description);

    return embed;
}

export {
    createNote,
    editNote,
    deleteNote,
    getNote,
    searchNotes,
    getUserCategories,
    getUserTags,
    createNoteEmbed,
    createNoteListEmbed,
    EMOJIS,
    COLORS
}; 