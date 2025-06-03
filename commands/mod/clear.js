import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Elimina un número específico de mensajes')
    .addIntegerOption(option =>
        option.setName('cantidad')
            .setDescription('Número de mensajes a eliminar (1-100)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100));

export async function execute(interaction) {
    // Verificar permisos
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return interaction.reply({
            content: '❌ No tienes permisos para eliminar mensajes.',
            ephemeral: true
        });
    }

    const cantidad = interaction.options.getInteger('cantidad');

    try {
        const mensajesBorrados = await interaction.channel.bulkDelete(cantidad, true);
        await interaction.reply({
            content: `✅ Se han eliminado ${mensajesBorrados.size} mensajes.`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error al eliminar mensajes:', error);
        await interaction.reply({
            content: '❌ No se pudieron eliminar los mensajes. Asegúrate de que no sean más antiguos de 14 días.',
            ephemeral: true
        });
    }
}

