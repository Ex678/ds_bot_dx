import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ChannelType } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('anunciar')
    .setDescription('Envía un anuncio a un canal específico o al actual')
    .addStringOption(option =>
        option.setName('mensaje')
            .setDescription('El mensaje del anuncio')
            .setRequired(true))
    .addChannelOption(option =>
        option.setName('canal')
            .setDescription('El canal donde enviar el anuncio')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false))
    .addStringOption(option =>
        option.setName('everyone')
            .setDescription('Mencionar a @everyone')
            .setRequired(false)
            .addChoices(
                { name: '✅ Sí', value: 'true' },
                { name: '❌ No', value: 'false' }
            ))
    .addStringOption(option =>
        option.setName('here')
            .setDescription('Mencionar a @here')
            .setRequired(false)
            .addChoices(
                { name: '✅ Sí', value: 'true' },
                { name: '❌ No', value: 'false' }
            ))
    .addRoleOption(option =>
        option.setName('rol')
            .setDescription('Mencionar a un rol específico')
            .setRequired(false))
    .addStringOption(option =>
        option.setName('color')
            .setDescription('Color del anuncio')
            .addChoices(
                { name: '🔴 Rojo', value: '#FF0000' },
                { name: '🟢 Verde', value: '#00FF00' },
                { name: '🔵 Azul', value: '#0000FF' },
                { name: '🟡 Amarillo', value: '#FFD700' },
                { name: '🟣 Púrpura', value: '#800080' },
                { name: '🟠 Naranja', value: '#FFA500' },
                { name: '⚫ Negro', value: '#000000' },
                { name: '⚪ Blanco', value: '#FFFFFF' }
            )
            .setRequired(false))
    .addStringOption(option =>
        option.setName('título')
            .setDescription('Título personalizado para el anuncio')
            .setRequired(false))
    .addStringOption(option =>
        option.setName('imagen')
            .setDescription('URL de una imagen para adjuntar al anuncio')
            .setRequired(false));

export async function execute(interaction) {
    // Verificar permisos
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return interaction.reply({
            content: '❌ No tienes permisos para enviar anuncios.',
            flags: 1 << 6
        });
    }

    const mensaje = interaction.options.getString('mensaje');
    const targetChannelOption = interaction.options.getChannel('canal');
    const targetChannel = targetChannelOption || interaction.channel;
    const mentionEveryone = interaction.options.getString('everyone') === 'true';
    const mentionHere = interaction.options.getString('here') === 'true';
    const mentionRole = interaction.options.getRole('rol');
    const color = interaction.options.getString('color') || '#FFD700';
    const customTitle = interaction.options.getString('título') || '📢 Anuncio';
    const imageUrl = interaction.options.getString('imagen');

    // Verificar permisos en el canal objetivo
    if (!targetChannel.permissionsFor(interaction.guild.members.me).has(PermissionsBitField.Flags.SendMessages)) {
        return interaction.reply({
            content: `❌ No tengo permisos para enviar mensajes en ${targetChannel}.`,
            flags: 1 << 6
        });
    }

    // Construir el mensaje de menciones
    let mentions = '';
    if (mentionEveryone && interaction.member.permissions.has(PermissionsBitField.Flags.MentionEveryone)) {
        mentions += '@everyone ';
    }
    if (mentionHere && interaction.member.permissions.has(PermissionsBitField.Flags.MentionEveryone)) {
        mentions += '@here ';
    }
    if (mentionRole && interaction.member.permissions.has(PermissionsBitField.Flags.MentionEveryone)) {
        mentions += `${mentionRole} `;
    }

    // Crear embed del anuncio
    const announcementEmbed = new EmbedBuilder()
        .setColor(color)
        .setTitle(customTitle)
        .setDescription(mensaje)
        .setFooter({ 
            text: `Anunciado por: ${interaction.user.tag}`, 
            iconURL: interaction.user.displayAvatarURL() 
        })
        .setTimestamp();

    // Añadir imagen si se proporcionó una URL válida
    if (imageUrl) {
        try {
            new URL(imageUrl);
            announcementEmbed.setImage(imageUrl);
        } catch (e) {
            return interaction.reply({
                content: '❌ La URL de la imagen proporcionada no es válida.',
                flags: 1 << 6
            });
        }
    }

    try {
        // Enviar el anuncio con las menciones
        const announcement = await targetChannel.send({
            content: mentions.trim() || null,
            embeds: [announcementEmbed],
            allowedMentions: {
                parse: mentionEveryone || mentionHere ? ['everyone'] : [],
                roles: mentionRole ? [mentionRole.id] : []
            }
        });

        // Añadir reacciones predeterminadas si se menciona a everyone o here
        if (mentionEveryone || mentionHere) {
            try {
                await announcement.react('👍');
                await announcement.react('👎');
            } catch (error) {
                console.error('Error al añadir reacciones:', error);
            }
        }
        
        await interaction.reply({
            content: `✅ Anuncio enviado correctamente al canal ${targetChannel}.`,
            flags: 1 << 6
        });
    } catch (error) {
        console.error('Error al enviar el anuncio:', error);
        await interaction.reply({
            content: `❌ No se pudo enviar el anuncio al canal ${targetChannel}. Error: ${error.message}`,
            flags: 1 << 6
        });
    }
}
