import { SlashCommandBuilder } from 'discord.js';
import { removeRoleReward } from '../../utils/storage.js';

export const data = new SlashCommandBuilder()
    .setName('removelevelrole')
    .setDescription('Elimina un rol de recompensa por nivel')
    .addIntegerOption(option =>
        option.setName('nivel')
            .setDescription('El nivel del rol a eliminar')
            .setRequired(true));

export async function execute(interaction) {
    if (!interaction.member.permissions.has('MANAGE_ROLES')) {
        return await interaction.reply({
            content: '❌ No tienes permisos para usar este comando.',
            ephemeral: true
        });
    }

    const level = interaction.options.getInteger('nivel');

    try {
        removeRoleReward(interaction.guildId, level);
        await interaction.reply(`✅ Rol de nivel ${level} eliminado correctamente.`);
    } catch (error) {
        console.error('Error al eliminar rol de nivel:', error);
        await interaction.reply({
            content: '❌ Hubo un error al eliminar el rol.',
            ephemeral: true
        });
    }
} 