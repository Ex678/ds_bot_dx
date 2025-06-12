import { SlashCommandBuilder } from 'discord.js';
import { getAutoModRules, updateAutoModRule } from '../../utils/storage.js';

export const data = new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configura las reglas de automoderación')
    .addSubcommand(subcommand =>
        subcommand
            .setName('add')
            .setDescription('Añade una regla de automoderación')
            .addStringOption(option =>
                option.setName('tipo')
                    .setDescription('Tipo de regla')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Palabras prohibidas', value: 'banned_words' },
                        { name: 'Anti-spam', value: 'anti_spam' },
                        { name: 'Anti-menciones', value: 'anti_mention' },
                        { name: 'Anti-enlaces', value: 'anti_link' }
                    ))
            .addStringOption(option =>
                option.setName('valor')
                    .setDescription('Valor de la regla (palabras separadas por comas, número máximo, etc.)')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('remove')
            .setDescription('Elimina una regla de automoderación')
            .addStringOption(option =>
                option.setName('tipo')
                    .setDescription('Tipo de regla a eliminar')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Palabras prohibidas', value: 'banned_words' },
                        { name: 'Anti-spam', value: 'anti_spam' },
                        { name: 'Anti-menciones', value: 'anti_mention' },
                        { name: 'Anti-enlaces', value: 'anti_link' }
                    )))
    .addSubcommand(subcommand =>
        subcommand
            .setName('list')
            .setDescription('Lista todas las reglas de automoderación activas'));

export async function execute(interaction) {
    if (!interaction.member.permissions.has('MANAGE_GUILD')) {
        return await interaction.reply({
            content: '❌ No tienes permisos para usar este comando.',
            ephemeral: true
        });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
        switch (subcommand) {
            case 'add': {
                const type = interaction.options.getString('tipo');
                const value = interaction.options.getString('valor');
                
                updateAutoModRule(interaction.guildId, type, value);
                
                await interaction.reply({
                    content: `✅ Regla de automoderación "${type}" añadida con valor: ${value}`,
                    ephemeral: true
                });
                break;
            }
            case 'remove': {
                const type = interaction.options.getString('tipo');
                
                updateAutoModRule(interaction.guildId, type, null);
                
                await interaction.reply({
                    content: `✅ Regla de automoderación "${type}" eliminada.`,
                    ephemeral: true
                });
                break;
            }
            case 'list': {
                const rules = getAutoModRules(interaction.guildId);
                
                if (!rules || rules.length === 0) {
                    await interaction.reply({
                        content: '📝 No hay reglas de automoderación configuradas.',
                        ephemeral: true
                    });
                    return;
                }

                const rulesList = rules
                    .map(rule => `• ${rule.rule_type}: ${rule.rule_value}`)
                    .join('\n');

                await interaction.reply({
                    content: `📝 Reglas de automoderación activas:\n${rulesList}`,
                    ephemeral: true
                });
                break;
            }
        }
    } catch (error) {
        console.error('Error al manejar reglas de automoderación:', error);
        await interaction.reply({
            content: '❌ Hubo un error al procesar el comando.',
            ephemeral: true
        });
    }
} 