import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('decir')
    .setDescription('Hace que el bot diga algo')
    .addStringOption(option =>
        option.setName('mensaje')
            .setDescription('El mensaje que quieres que diga el bot')
            .setRequired(true));

export async function execute(interaction) {
    const mensaje = interaction.options.getString('mensaje');
    
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setDescription(mensaje)
        .setFooter({ text: `Mensaje enviado por ${interaction.user.username}` });

    await interaction.reply({ embeds: [embed] });
}
