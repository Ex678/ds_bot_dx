import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getDatabase } from '../../database.js';
import { createModActionEmbed } from '../../utils/moderation.js';

export const data = new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configura el sistema de auto-moderación')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
        subcommand
            .setName('rule')
            .setDescription('Añade o modifica una regla de auto-moderación')
            .addStringOption(option =>
                option.setName('tipo')
                    .setDescription('Tipo de regla')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Spam', value: 'SPAM' },
                        { name: 'Mayúsculas excesivas', value: 'CAPS' },
                        { name: 'Enlaces', value: 'LINKS' },
                        { name: 'Menciones excesivas', value: 'MENTIONS' },
                        { name: 'Palabras filtradas', value: 'WORDS' }
                    ))
            .addStringOption(option =>
                option.setName('acción')
                    .setDescription('Acción a tomar cuando se viola la regla')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Advertir', value: 'WARN' },
                        { name: 'Silenciar', value: 'MUTE' },
                        { name: 'Expulsar', value: 'KICK' },
                        { name: 'Banear', value: 'BAN' },
                        { name: 'Eliminar mensaje', value: 'DELETE' }
                    ))
            .addStringOption(option =>
                option.setName('configuración')
                    .setDescription('Configuración en formato JSON')
                    .setRequired(true)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('palabra')
            .setDescription('Añade o elimina una palabra filtrada')
            .addStringOption(option =>
                option.setName('acción')
                    .setDescription('Añadir o eliminar palabra')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Añadir', value: 'ADD' },
                        { name: 'Eliminar', value: 'REMOVE' }
                    ))
            .addStringOption(option =>
                option.setName('palabra')
                    .setDescription('Palabra a filtrar')
                    .setRequired(true))
            .addIntegerOption(option =>
                option.setName('severidad')
                    .setDescription('Nivel de severidad (1: bajo, 2: medio, 3: alto)')
                    .setMinValue(1)
                    .setMaxValue(3)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('lista')
            .setDescription('Muestra las reglas y palabras filtradas actuales'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('toggle')
            .setDescription('Activa o desactiva una regla')
            .addStringOption(option =>
                option.setName('tipo')
                    .setDescription('Tipo de regla')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Spam', value: 'SPAM' },
                        { name: 'Mayúsculas excesivas', value: 'CAPS' },
                        { name: 'Enlaces', value: 'LINKS' },
                        { name: 'Menciones excesivas', value: 'MENTIONS' },
                        { name: 'Palabras filtradas', value: 'WORDS' }
                    )));

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const db = getDatabase();

    try {
        switch (subcommand) {
            case 'rule': {
                const type = interaction.options.getString('tipo');
                const action = interaction.options.getString('acción');
                let config = interaction.options.getString('configuración');

                try {
                    config = JSON.parse(config);
                } catch (error) {
                    await interaction.reply({
                        embeds: [createModActionEmbed({
                            title: '❌ Error de configuración',
                            description: 'El formato JSON proporcionado no es válido.',
                            color: 0xFF0000
                        })],
                        ephemeral: true
                    });
                    return;
                }

                // Verificar si ya existe una regla de este tipo
                const existingRule = await db.get(
                    'SELECT id FROM auto_mod_rules WHERE guild_id = ? AND rule_type = ?',
                    [interaction.guild.id, type]
                );

                if (existingRule) {
                    await db.run(
                        'UPDATE auto_mod_rules SET action = ?, rule_data = ? WHERE id = ?',
                        [action, JSON.stringify(config), existingRule.id]
                    );
                } else {
                    await db.run(
                        'INSERT INTO auto_mod_rules (guild_id, rule_type, action, rule_data) VALUES (?, ?, ?, ?)',
                        [interaction.guild.id, type, action, JSON.stringify(config)]
                    );
                }

                await interaction.reply({
                    embeds: [createModActionEmbed({
                        title: '✅ Regla configurada',
                        description: `La regla de tipo ${type} ha sido ${existingRule ? 'actualizada' : 'creada'} correctamente.`,
                        color: 0x00FF00
                    })],
                    ephemeral: true
                });
                break;
            }

            case 'palabra': {
                const action = interaction.options.getString('acción');
                const word = interaction.options.getString('palabra');
                const severity = interaction.options.getInteger('severidad') || 1;

                if (action === 'ADD') {
                    await db.run(
                        'INSERT OR REPLACE INTO filtered_words (guild_id, word, severity) VALUES (?, ?, ?)',
                        [interaction.guild.id, word.toLowerCase(), severity]
                    );

                    await interaction.reply({
                        embeds: [createModActionEmbed({
                            title: '✅ Palabra añadida',
                            description: `La palabra "${word}" ha sido añadida al filtro con severidad ${severity}.`,
                            color: 0x00FF00
                        })],
                        ephemeral: true
                    });
                } else {
                    await db.run(
                        'DELETE FROM filtered_words WHERE guild_id = ? AND word = ?',
                        [interaction.guild.id, word.toLowerCase()]
                    );

                    await interaction.reply({
                        embeds: [createModActionEmbed({
                            title: '✅ Palabra eliminada',
                            description: `La palabra "${word}" ha sido eliminada del filtro.`,
                            color: 0x00FF00
                        })],
                        ephemeral: true
                    });
                }
                break;
            }

            case 'lista': {
                const rules = await db.all(
                    'SELECT * FROM auto_mod_rules WHERE guild_id = ?',
                    [interaction.guild.id]
                );

                const words = await db.all(
                    'SELECT * FROM filtered_words WHERE guild_id = ?',
                    [interaction.guild.id]
                );

                const rulesText = rules.map(rule => 
                    `• ${rule.rule_type}: ${rule.enabled ? '✅' : '❌'}\n` +
                    `  Acción: ${rule.action}\n` +
                    `  Config: \`${JSON.stringify(JSON.parse(rule.rule_data), null, 2)}\``
                ).join('\n\n');

                const wordsText = words.map(word =>
                    `• "${word.word}" (Severidad: ${word.severity})`
                ).join('\n');

                await interaction.reply({
                    embeds: [createModActionEmbed({
                        title: '📋 Configuración de Auto-Moderación',
                        description: 'Reglas y filtros actuales del servidor',
                        fields: [
                            {
                                name: '📜 Reglas',
                                value: rulesText || 'No hay reglas configuradas',
                                inline: false
                            },
                            {
                                name: '🚫 Palabras Filtradas',
                                value: wordsText || 'No hay palabras filtradas',
                                inline: false
                            }
                        ]
                    })],
                    ephemeral: true
                });
                break;
            }

            case 'toggle': {
                const type = interaction.options.getString('tipo');
                
                const rule = await db.get(
                    'SELECT * FROM auto_mod_rules WHERE guild_id = ? AND rule_type = ?',
                    [interaction.guild.id, type]
                );

                if (!rule) {
                    await interaction.reply({
                        embeds: [createModActionEmbed({
                            title: '❌ Error',
                            description: `No existe una regla de tipo ${type}.`,
                            color: 0xFF0000
                        })],
                        ephemeral: true
                    });
                    return;
                }

                await db.run(
                    'UPDATE auto_mod_rules SET enabled = NOT enabled WHERE id = ?',
                    [rule.id]
                );

                const updatedRule = await db.get(
                    'SELECT enabled FROM auto_mod_rules WHERE id = ?',
                    [rule.id]
                );

                await interaction.reply({
                    embeds: [createModActionEmbed({
                        title: '✅ Estado actualizado',
                        description: `La regla ${type} ha sido ${updatedRule.enabled ? 'activada' : 'desactivada'}.`,
                        color: 0x00FF00
                    })],
                    ephemeral: true
                });
                break;
            }
        }
    } catch (error) {
        console.error('Error en comando automod:', error);
        await interaction.reply({
            embeds: [createModActionEmbed({
                title: '❌ Error',
                description: 'Ha ocurrido un error al procesar el comando.',
                color: 0xFF0000
            })],
            ephemeral: true
        });
    }
} 