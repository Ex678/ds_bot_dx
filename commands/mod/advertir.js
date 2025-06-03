import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('advertir')
    .setDescription('Advierte a un usuario')
    .addUserOption(option =>
        option.setName('usuario')
            .setDescription('El usuario a advertir')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('razon')
            .setDescription('La razón de la advertencia')
            .setRequired(true));

export async function execute(interaction) {
    // Verificar permisos
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return interaction.reply({
            content: '❌ No tienes permisos para usar este comando.',
            ephemeral: true
        });
    }

    const usuario = interaction.options.getUser('usuario');
    const razon = interaction.options.getString('razon');
    const moderador = interaction.user;

    // No permitir advertir a uno mismo
    if (usuario.id === moderador.id) {
        return interaction.reply({
            content: '❌ No puedes advertirte a ti mismo.',
            ephemeral: true
        });
    }

    // No permitir advertir al bot
    if (usuario.bot) {
        return interaction.reply({
            content: '❌ No puedes advertir a un bot.',
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setColor('#FF4444')
        .setTitle('⚠️ Advertencia')
        .addFields(
            { name: 'Usuario Advertido', value: `${usuario.tag} (${usuario.id})`, inline: true },
            { name: 'Moderador', value: `${moderador.tag}`, inline: true },
            { name: 'Razón', value: razon }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    // Intentar enviar un DM al usuario advertido
    try {
        const dmEmbed = new EmbedBuilder()
            .setColor('#FF4444')
            .setTitle('⚠️ Has recibido una advertencia')
            .setDescription(`Has sido advertido en ${interaction.guild.name}`)
            .addFields(
                { name: 'Razón', value: razon },
                { name: 'Moderador', value: moderador.tag }
            )
            .setTimestamp();

        await usuario.send({ embeds: [dmEmbed] });
    } catch (error) {
        console.error('Error al enviar DM:', error);
        await interaction.followUp({
            content: '⚠️ No se pudo enviar un mensaje privado al usuario.',
            ephemeral: true
        });
    }
}
