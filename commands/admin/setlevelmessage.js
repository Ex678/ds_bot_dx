import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { updateGuildSettings } from '../../database.js';

export const data = new SlashCommandBuilder()
    .setName('setlevelmessage')
    .setDescription('Configura el mensaje que se enviará cuando alguien suba de nivel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
        option.setName('mensaje')
            .setDescription('El mensaje a enviar. Usa {user} para el usuario y {level} para el nivel')
            .setRequired(true));

export async function execute(interaction) {
    try {
        const message = interaction.options.getString('mensaje');

        // Verificar que el mensaje contenga los placeholders necesarios
        if (!message.includes('{user}') || !message.includes('{level}')) {
            return interaction.reply({
                content: '❌ El mensaje debe incluir {user} y {level} para mostrar el usuario y su nivel.',
                ephemeral: true
            });
        }

        await updateGuildSettings(interaction.guild.id, {
            level_up_message: message
        });

        // Mostrar ejemplo
        const exampleMessage = message
            .replace('{user}', interaction.user.toString())
            .replace('{level}', '5');

        await interaction.reply({
            content: `✅ Mensaje configurado. Ejemplo:\n${exampleMessage}`,
            ephemeral: true
        });

    } catch (error) {
        console.error('[SetLevelMessage] Error:', error);
        await interaction.reply({
            content: '❌ Ocurrió un error al configurar el mensaje.',
            ephemeral: true
        });
    }
} 