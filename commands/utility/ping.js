import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Responde con el ping del bot');

export async function execute(interaction) {
    const sent = await interaction.reply({ content: 'Calculando ping...', fetchReply: true });
    const ping = sent.createdTimestamp - interaction.createdTimestamp;
    
    await interaction.editReply(`🏓 Pong!\nLatencia del bot: ${ping}ms\nLatencia de la API: ${interaction.client.ws.ping}ms`);
} 