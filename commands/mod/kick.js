import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulsa a un usuario del servidor')
    .addUserOption(option =>
        option.setName('usuario')
            .setDescription('El usuario a expulsar')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('razon')
            .setDescription('Razón de la expulsión')
            .setRequired(true));

export async function execute(interaction) {
    // Verificar permisos
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
        return interaction.reply({
            content: '❌ No tienes permisos para expulsar usuarios.',
            ephemeral: true
        });
    }

    const usuario = interaction.options.getUser('usuario');
    const razon = interaction.options.getString('razon');
    const miembro = await interaction.guild.members.fetch(usuario.id);

    // No permitir auto-expulsión
    if (usuario.id === interaction.user.id) {
        return interaction.reply({
            content: '❌ No puedes expulsarte a ti mismo.',
            ephemeral: true
        });
    }

    // Verificar si el bot puede expulsar al usuario
    if (!miembro.kickable) {
        return interaction.reply({
            content: '❌ No puedo expulsar a este usuario. Puede que tenga un rol más alto que el mío.',
            ephemeral: true
        });
    }

    try {
        await miembro.kick(razon);
        await interaction.reply(`✅ Usuario ${usuario.tag} ha sido expulsado.\nRazón: ${razon}`);

        // Intentar notificar al usuario
        try {
            await usuario.send(`Has sido expulsado de ${interaction.guild.name}\nRazón: ${razon}`);
        } catch (dmError) {
            await interaction.followUp({
                content: '⚠️ No se pudo enviar un mensaje privado al usuario.',
                ephemeral: true
            });
        }
    } catch (error) {
        console.error('Error al expulsar:', error);
        await interaction.reply({
            content: '❌ No se pudo expulsar al usuario.',
            ephemeral: true
        });
    }
}
 
