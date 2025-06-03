import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { removeLevelRole } from '../../database.js';

export const data = new SlashCommandBuilder()
    .setName('removelevelrole')
    .setDescription('Elimina un rol de las recompensas por nivel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addRoleOption(option =>
        option.setName('rol')
            .setDescription('El rol que ya no se otorgará por nivel')
            .setRequired(true));

export async function execute(interaction) {
    try {
        const role = interaction.options.getRole('rol');

        await removeLevelRole(interaction.guild.id, role.id);

        await interaction.reply({
            content: `✅ El rol **${role.name}** ya no será otorgado por nivel.`,
            ephemeral: true
        });

    } catch (error) {
        console.error('[RemoveLevelRole] Error:', error);
        await interaction.reply({
            content: '❌ Ocurrió un error al eliminar el rol de las recompensas.',
            ephemeral: true
        });
    }
} 