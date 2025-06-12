import { SlashCommandBuilder } from 'discord.js';
import { updateGuildSettings, getGuildSettings } from '../../utils/storage.js';

export const data = new SlashCommandBuilder()
    .setName('setlevelmessage')
    .setDescription('Configura el mensaje de subida de nivel')
    .addStringOption(option =>
        option.setName('mensaje')
            .setDescription('El mensaje a mostrar (usa {user} para el usuario y {level} para el nivel)')
            .setRequired(true));

export async function execute(interaction) {
    if (!interaction.member.permissions.has('MANAGE_GUILD')) {
        return await interaction.reply({
            content: '❌ No tienes permisos para usar este comando.',
            ephemeral: true
        });
    }

    const message = interaction.options.getString('mensaje');

    // Verificar que el mensaje contiene las variables necesarias
    if (!message.includes('{user}') || !message.includes('{level}')) {
        return await interaction.reply({
            content: '❌ El mensaje debe incluir {user} y {level} para ser válido.',
            ephemeral: true
        });
    }

    const currentSettings = getGuildSettings(interaction.guildId);
    const newSettings = {
        ...currentSettings,
        levelUpMessage: message
    };

    try {
        updateGuildSettings(interaction.guildId, newSettings);
        
        // Mostrar ejemplo del mensaje
        const exampleMessage = message
            .replace('{user}', interaction.user.toString())
            .replace('{level}', '5');

        await interaction.reply({
            content: `✅ Mensaje de nivel actualizado.\nEjemplo:\n${exampleMessage}`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error al configurar mensaje de nivel:', error);
        await interaction.reply({
            content: '❌ Hubo un error al configurar el mensaje.',
            ephemeral: true
        });
    }
} 