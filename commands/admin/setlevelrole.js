import { SlashCommandBuilder } from 'discord.js';
import { addRoleReward } from '../../utils/storage.js';

export const data = new SlashCommandBuilder()
    .setName('setlevelrole')
    .setDescription('Configura un rol como recompensa por nivel')
    .addRoleOption(option =>
        option.setName('rol')
            .setDescription('El rol que se otorgará')
            .setRequired(true))
    .addIntegerOption(option =>
        option.setName('nivel')
            .setDescription('El nivel requerido para obtener el rol')
            .setRequired(true)
            .setMinValue(1));

export async function execute(interaction) {
    if (!interaction.member.permissions.has('MANAGE_ROLES')) {
        return await interaction.reply({
            content: '❌ No tienes permisos para usar este comando.',
            ephemeral: true
        });
    }

    const role = interaction.options.getRole('rol');
    const level = interaction.options.getInteger('nivel');

    // Verificar que el rol puede ser asignado por el bot
    if (role.position >= interaction.guild.members.me.roles.highest.position) {
        return await interaction.reply({
            content: '❌ No puedo asignar ese rol porque está por encima de mi rol más alto.',
            ephemeral: true
        });
    }

    try {
        addRoleReward(interaction.guildId, level, role.id);
        await interaction.reply(`✅ El rol **${role.name}** será otorgado al alcanzar el nivel ${level}.`);
    } catch (error) {
        console.error('Error al configurar rol de nivel:', error);
        await interaction.reply({
            content: '❌ Hubo un error al configurar el rol.',
            ephemeral: true
        });
    }
} 