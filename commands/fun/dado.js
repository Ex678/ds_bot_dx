import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('dado')
    .setDescription('Tira un dado')
    .addIntegerOption(option =>
        option.setName('caras')
            .setDescription('Número de caras del dado')
            .setRequired(false));

export async function execute(interaction) {
    const caras = interaction.options.getInteger('caras') || 6;
    const resultado = Math.floor(Math.random() * caras) + 1;

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🎲 Resultado del dado')
        .setDescription(`Has sacado un ${resultado} en un dado de ${caras} caras`);

    await interaction.reply({ embeds: [embed] });
}
