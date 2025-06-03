import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Remueve el silencio de un usuario')
    .addUserOption(option =>
        option.setName('usuario')
            .setDescription('El usuario a quien remover el silencio')
            .setRequired(true));

export async function execute(interaction) {
    // Verificar permisos
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return interaction.reply({
            content: '❌ No tienes permisos para gestionar usuarios.',
            ephemeral: true
        });
    }

    const usuario = interaction.options.getUser('usuario');
    const miembro = await interaction.guild.members.fetch(usuario.id);

    // Verificar si el bot puede gestionar al usuario
    if (!miembro.moderatable) {
        return interaction.reply({
            content: '❌ No puedo gestionar a este usuario. Puede que tenga un rol más alto que el mío.',
            ephemeral: true
        });
    }

    try {
        // Remover el timeout (establecerlo a null)
        await miembro.timeout(null);
        await interaction.reply(`✅ Se ha removido el silencio de ${usuario.tag}.`);

        // Intentar notificar al usuario
        try {
            await usuario.send(`Se te ha removido el silencio en ${interaction.guild.name}.`);
        } catch (dmError) {
            await interaction.followUp({
                content: '⚠️ No se pudo enviar un mensaje privado al usuario.',
                ephemeral: true
            });
        }
    } catch (error) {
        console.error('Error al remover el silencio:', error);
        await interaction.reply({
            content: '❌ No se pudo remover el silencio del usuario.',
            ephemeral: true
        });
    }
}
