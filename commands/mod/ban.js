import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Banea a un usuario del servidor')
    .addUserOption(option =>
        option.setName('usuario')
            .setDescription('El usuario a banear')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('razon')
            .setDescription('Razón del baneo')
            .setRequired(true));

export async function execute(interaction) {
    // Verificar permisos
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        return interaction.reply({
            content: '❌ No tienes permisos para banear usuarios.',
            ephemeral: true
        });
    }

    const usuario = interaction.options.getUser('usuario');
    const razon = interaction.options.getString('razon');

    // No permitir auto-baneo
    if (usuario.id === interaction.user.id) {
        return interaction.reply({
            content: '❌ No puedes banearte a ti mismo.',
            ephemeral: true
        });
    }

    try {
        await interaction.guild.members.ban(usuario, { reason: razon });
        await interaction.reply(`✅ Usuario ${usuario.tag} ha sido baneado.\nRazón: ${razon}`);

        // Intentar notificar al usuario
        try {
            await usuario.send(`Has sido baneado de ${interaction.guild.name}\nRazón: ${razon}`);
        } catch (dmError) {
            await interaction.followUp({
                content: '⚠️ No se pudo enviar un mensaje privado al usuario.',
                ephemeral: true
            });
        }
    } catch (error) {
        console.error('Error al banear:', error);
        await interaction.reply({
            content: '❌ No se pudo banear al usuario.',
            ephemeral: true
        });
    }
}

