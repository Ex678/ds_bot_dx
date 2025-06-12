import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getUserData, updateUserXP } from '../../utils/storage.js';

export const data = new SlashCommandBuilder()
    .setName('strikes')
    .setDescription('Gestiona las advertencias de los usuarios')
    .addSubcommand(subcommand =>
        subcommand
            .setName('add')
            .setDescription('Añade una advertencia a un usuario')
            .addUserOption(option =>
                option.setName('usuario')
                    .setDescription('Usuario a advertir')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('razón')
                    .setDescription('Razón de la advertencia')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('remove')
            .setDescription('Elimina una advertencia de un usuario')
            .addUserOption(option =>
                option.setName('usuario')
                    .setDescription('Usuario')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('list')
            .setDescription('Muestra las advertencias de un usuario')
            .addUserOption(option =>
                option.setName('usuario')
                    .setDescription('Usuario')
                    .setRequired(true)));

export async function execute(interaction) {
    if (!interaction.member.permissions.has('MODERATE_MEMBERS')) {
        return await interaction.reply({
            content: '❌ No tienes permisos para usar este comando.',
            ephemeral: true
        });
    }

    const subcommand = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('usuario');
    const userData = getUserData(targetUser.id, interaction.guildId);

    // Inicializar strikes si no existen
    if (!userData.strikes) {
        userData.strikes = [];
    }

    try {
        switch (subcommand) {
            case 'add': {
                const reason = interaction.options.getString('razón');
                const strike = {
                    reason,
                    date: new Date().toISOString(),
                    moderator: interaction.user.id
                };

                userData.strikes.push(strike);
                updateUserXP(targetUser.id, interaction.guildId, userData.xp, userData.level, userData.lastMessageTime, userData.strikes);

                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('⚠️ Nueva Advertencia')
                    .setDescription(`${targetUser} ha recibido una advertencia.`)
                    .addFields(
                        { name: 'Razón', value: reason },
                        { name: 'Advertencias totales', value: userData.strikes.length.toString() }
                    )
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
                break;
            }
            case 'remove': {
                if (userData.strikes.length === 0) {
                    return await interaction.reply({
                        content: `${targetUser} no tiene advertencias.`,
                        ephemeral: true
                    });
                }

                userData.strikes.pop();
                updateUserXP(targetUser.id, interaction.guildId, userData.xp, userData.level, userData.lastMessageTime, userData.strikes);

                await interaction.reply({
                    content: `✅ Se ha eliminado una advertencia de ${targetUser}. Advertencias restantes: ${userData.strikes.length}`,
                    ephemeral: true
                });
                break;
            }
            case 'list': {
                if (userData.strikes.length === 0) {
                    return await interaction.reply({
                        content: `${targetUser} no tiene advertencias.`,
                        ephemeral: true
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle(`📝 Advertencias de ${targetUser.tag}`)
                    .setDescription(`Total de advertencias: ${userData.strikes.length}`)
                    .setThumbnail(targetUser.displayAvatarURL());

                userData.strikes.forEach((strike, index) => {
                    const moderator = interaction.guild.members.cache.get(strike.moderator);
                    embed.addFields({
                        name: `Advertencia #${index + 1}`,
                        value: `**Razón:** ${strike.reason}\n**Fecha:** ${new Date(strike.date).toLocaleString()}\n**Moderador:** ${moderator ? moderator.user.tag : 'Desconocido'}`
                    });
                });

                await interaction.reply({ embeds: [embed] });
                break;
            }
        }
    } catch (error) {
        console.error('Error al manejar advertencias:', error);
        await interaction.reply({
            content: '❌ Hubo un error al procesar el comando.',
            ephemeral: true
        });
    }
} 