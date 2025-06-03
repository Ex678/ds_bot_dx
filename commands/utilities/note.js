import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import {
    createNote,
    editNote,
    deleteNote,
    getNote,
    searchNotes,
    getUserCategories,
    getUserTags,
    createNoteEmbed,
    createNoteListEmbed,
    EMOJIS
} from '../../features/notes/noteSystem.js';

export const data = new SlashCommandBuilder()
    .setName('note')
    .setDescription('Sistema de notas personales')
    .addSubcommand(subcommand =>
        subcommand
            .setName('crear')
            .setDescription('Crear una nueva nota')
            .addStringOption(option =>
                option.setName('título')
                    .setDescription('Título de la nota')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('contenido')
                    .setDescription('Contenido de la nota')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('categoría')
                    .setDescription('Categoría de la nota'))
            .addStringOption(option =>
                option.setName('etiquetas')
                    .setDescription('Etiquetas separadas por comas')))
    .addSubcommand(subcommand =>
        subcommand
            .setName('editar')
            .setDescription('Editar una nota existente')
            .addIntegerOption(option =>
                option.setName('id')
                    .setDescription('ID de la nota')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('título')
                    .setDescription('Nuevo título'))
            .addStringOption(option =>
                option.setName('contenido')
                    .setDescription('Nuevo contenido'))
            .addStringOption(option =>
                option.setName('categoría')
                    .setDescription('Nueva categoría'))
            .addStringOption(option =>
                option.setName('etiquetas')
                    .setDescription('Nuevas etiquetas separadas por comas')))
    .addSubcommand(subcommand =>
        subcommand
            .setName('eliminar')
            .setDescription('Eliminar una nota')
            .addIntegerOption(option =>
                option.setName('id')
                    .setDescription('ID de la nota')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('ver')
            .setDescription('Ver una nota')
            .addIntegerOption(option =>
                option.setName('id')
                    .setDescription('ID de la nota')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('lista')
            .setDescription('Ver lista de notas')
            .addStringOption(option =>
                option.setName('categoría')
                    .setDescription('Filtrar por categoría'))
            .addStringOption(option =>
                option.setName('etiquetas')
                    .setDescription('Filtrar por etiquetas (separadas por comas)'))
            .addBooleanOption(option =>
                option.setName('fijadas')
                    .setDescription('Mostrar solo notas fijadas')))
    .addSubcommand(subcommand =>
        subcommand
            .setName('buscar')
            .setDescription('Buscar en tus notas')
            .addStringOption(option =>
                option.setName('texto')
                    .setDescription('Texto a buscar')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('fijar')
            .setDescription('Fijar/Desfijar una nota')
            .addIntegerOption(option =>
                option.setName('id')
                    .setDescription('ID de la nota')
                    .setRequired(true)));

export async function execute(interaction) {
    try {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'crear':
                await handleCreate(interaction);
                break;
            case 'editar':
                await handleEdit(interaction);
                break;
            case 'eliminar':
                await handleDelete(interaction);
                break;
            case 'ver':
                await handleView(interaction);
                break;
            case 'lista':
                await handleList(interaction);
                break;
            case 'buscar':
                await handleSearch(interaction);
                break;
            case 'fijar':
                await handlePin(interaction);
                break;
        }
    } catch (error) {
        console.error('[Note Command] Error:', error);
        await interaction.reply({
            content: `${EMOJIS.CROSS} Ocurrió un error al procesar el comando.`,
            ephemeral: true
        });
    }
}

/**
 * Maneja el subcomando crear
 * @param {CommandInteraction} interaction 
 */
async function handleCreate(interaction) {
    const title = interaction.options.getString('título');
    const content = interaction.options.getString('contenido');
    const category = interaction.options.getString('categoría');
    const tagsString = interaction.options.getString('etiquetas');
    const tags = tagsString ? tagsString.split(',').map(t => t.trim()) : [];

    const note = await createNote({
        userId: interaction.user.id,
        guildId: interaction.guildId,
        title,
        content,
        category,
        tags
    });

    const embed = createNoteEmbed(note);
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`note_pin_${note.id}`)
                .setLabel('Fijar')
                .setStyle(ButtonStyle.Primary)
                .setEmoji(EMOJIS.PIN),
            new ButtonBuilder()
                .setCustomId(`note_edit_${note.id}`)
                .setLabel('Editar')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(EMOJIS.EDIT),
            new ButtonBuilder()
                .setCustomId(`note_delete_${note.id}`)
                .setLabel('Eliminar')
                .setStyle(ButtonStyle.Danger)
                .setEmoji(EMOJIS.DELETE)
        );

    await interaction.reply({
        content: `${EMOJIS.CHECK} Nota creada con éxito.`,
        embeds: [embed],
        components: [row]
    });
}

/**
 * Maneja el subcomando editar
 * @param {CommandInteraction} interaction 
 */
async function handleEdit(interaction) {
    const noteId = interaction.options.getInteger('id');
    const note = await getNote(noteId);

    if (!note || note.user_id !== interaction.user.id) {
        return interaction.reply({
            content: `${EMOJIS.CROSS} No se encontró la nota o no tienes permiso para editarla.`,
            ephemeral: true
        });
    }

    const updates = {};
    const title = interaction.options.getString('título');
    const content = interaction.options.getString('contenido');
    const category = interaction.options.getString('categoría');
    const tagsString = interaction.options.getString('etiquetas');

    if (title) updates.title = title;
    if (content) updates.content = content;
    if (category) updates.category = category;
    if (tagsString) updates.tags = tagsString.split(',').map(t => t.trim());

    const success = await editNote(noteId, updates);
    if (success) {
        const updatedNote = await getNote(noteId);
        const embed = createNoteEmbed(updatedNote);
        await interaction.reply({
            content: `${EMOJIS.CHECK} Nota actualizada con éxito.`,
            embeds: [embed]
        });
    } else {
        await interaction.reply({
            content: `${EMOJIS.CROSS} No se pudo actualizar la nota.`,
            ephemeral: true
        });
    }
}

/**
 * Maneja el subcomando eliminar
 * @param {CommandInteraction} interaction 
 */
async function handleDelete(interaction) {
    const noteId = interaction.options.getInteger('id');
    const note = await getNote(noteId);

    if (!note || note.user_id !== interaction.user.id) {
        return interaction.reply({
            content: `${EMOJIS.CROSS} No se encontró la nota o no tienes permiso para eliminarla.`,
            ephemeral: true
        });
    }

    const success = await deleteNote(noteId);
    await interaction.reply({
        content: success
            ? `${EMOJIS.CHECK} Nota eliminada con éxito.`
            : `${EMOJIS.CROSS} No se pudo eliminar la nota.`,
        ephemeral: true
    });
}

/**
 * Maneja el subcomando ver
 * @param {CommandInteraction} interaction 
 */
async function handleView(interaction) {
    const noteId = interaction.options.getInteger('id');
    const note = await getNote(noteId);

    if (!note || note.user_id !== interaction.user.id) {
        return interaction.reply({
            content: `${EMOJIS.CROSS} No se encontró la nota o no tienes permiso para verla.`,
            ephemeral: true
        });
    }

    const embed = createNoteEmbed(note);
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`note_pin_${note.id}`)
                .setLabel(note.pinned ? 'Desfijar' : 'Fijar')
                .setStyle(note.pinned ? ButtonStyle.Secondary : ButtonStyle.Primary)
                .setEmoji(EMOJIS.PIN),
            new ButtonBuilder()
                .setCustomId(`note_edit_${note.id}`)
                .setLabel('Editar')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(EMOJIS.EDIT),
            new ButtonBuilder()
                .setCustomId(`note_delete_${note.id}`)
                .setLabel('Eliminar')
                .setStyle(ButtonStyle.Danger)
                .setEmoji(EMOJIS.DELETE)
        );

    await interaction.reply({
        embeds: [embed],
        components: [row]
    });
}

/**
 * Maneja el subcomando lista
 * @param {CommandInteraction} interaction 
 */
async function handleList(interaction) {
    const category = interaction.options.getString('categoría');
    const tagsString = interaction.options.getString('etiquetas');
    const pinnedOnly = interaction.options.getBoolean('fijadas') ?? false;

    const notes = await searchNotes({
        userId: interaction.user.id,
        guildId: interaction.guildId,
        category,
        tags: tagsString ? tagsString.split(',').map(t => t.trim()) : undefined,
        pinnedOnly
    });

    const title = pinnedOnly ? 'Notas Fijadas' :
                 category ? `Notas en ${category}` :
                 'Tus Notas';

    const embed = createNoteListEmbed(notes, title);
    await interaction.reply({ embeds: [embed] });
}

/**
 * Maneja el subcomando buscar
 * @param {CommandInteraction} interaction 
 */
async function handleSearch(interaction) {
    const query = interaction.options.getString('texto');
    
    const notes = await searchNotes({
        userId: interaction.user.id,
        guildId: interaction.guildId,
        query
    });

    const embed = createNoteListEmbed(notes, `Resultados de búsqueda: "${query}"`);
    await interaction.reply({ embeds: [embed] });
}

/**
 * Maneja el subcomando fijar
 * @param {CommandInteraction} interaction 
 */
async function handlePin(interaction) {
    const noteId = interaction.options.getInteger('id');
    const note = await getNote(noteId);

    if (!note || note.user_id !== interaction.user.id) {
        return interaction.reply({
            content: `${EMOJIS.CROSS} No se encontró la nota o no tienes permiso para modificarla.`,
            ephemeral: true
        });
    }

    const success = await editNote(noteId, { pinned: !note.pinned });
    if (success) {
        await interaction.reply({
            content: note.pinned
                ? `${EMOJIS.CHECK} Nota desfijada.`
                : `${EMOJIS.PIN} Nota fijada.`,
            ephemeral: true
        });
    } else {
        await interaction.reply({
            content: `${EMOJIS.CROSS} No se pudo ${note.pinned ? 'desfijar' : 'fijar'} la nota.`,
            ephemeral: true
        });
    }
} 