import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { addLevelRole } from '../../database.js';

export const data = new SlashCommandBuilder()
    .setName('setlevelrole')
    .setDescription('Configura un rol que se otorgará al alcanzar cierto nivel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addRoleOption(option =>
        option.setName('rol')
            .setDescription('El rol que se otorgará')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('nivel')
            .setDescription('El nivel requerido para obtener el rol')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100));

export async function execute(interaction) {
    try {
        const role = interaction.options.getRole('rol');
        const level = interaction.options.getInteger('nivel');

        // Verificar permisos del bot
        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({
                content: '❌ No tengo permisos para gestionar roles en este servidor.',
                ephemeral: true
            });
        }

        // Verificar posición del rol
        if (role.position >= interaction.guild.members.me.roles.highest.position) {
            return interaction.reply({
                content: '❌ No puedo asignar ese rol porque está por encima de mi rol más alto.',
                ephemeral: true
            });
        }

        await addLevelRole(interaction.guild.id, role.id, level);

        await interaction.reply({
            content: `✅ El rol **${role.name}** será otorgado al alcanzar el nivel **${level}**.`,
            ephemeral: true
        });

    } catch (error) {
        console.error('[SetLevelRole] Error:', error);
        await interaction.reply({
            content: '❌ Ocurrió un error al configurar el rol.',
            ephemeral: true
        });
    }
} 