import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getDatabase } from '../../database.js';
import { createModActionEmbed } from '../../utils/moderation.js';

export const data = new SlashCommandBuilder()
    .setName('strikes')
    .setDescription('Configura el sistema de strikes')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
        subcommand
            .setName('config')
            .setDescription('Configura los umbrales de strikes')
            .addIntegerOption(option =>
                option.setName('mute')
                    .setDescription('Número de strikes para silenciar')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(10))
            .addIntegerOption(option =>
                option.setName('kick')
                    .setDescription('Número de strikes para expulsar')
                    .setRequired(true)
                    .setMinValue(2)
                    .setMaxValue(15))
            .addIntegerOption(option =>
                option.setName('ban')
                    .setDescription('Número de strikes para banear')
                    .setRequired(true)
                    .setMinValue(3)
                    .setMaxValue(20))
            .addIntegerOption(option =>
                option.setName('mute_duration')
                    .setDescription('Duración del silencio en minutos')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(1440))
            .addIntegerOption(option =>
                option.setName('strike_expiry')
                    .setDescription('Días hasta que expiran los strikes')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(365)))
    .addSubcommand(subcommand =>
        subcommand
            .setName('ver')
            .setDescription('Ver la configuración actual de strikes'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('reset')
            .setDescription('Reinicia los strikes de un usuario')
            .addUserOption(option =>
                option.setName('usuario')
                    .setDescription('Usuario al que reiniciar los strikes')
                    .setRequired(true)));

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const db = getDatabase();

    try {
        switch (subcommand) {
            case 'config': {
                const strikesMute = interaction.options.getInteger('mute');
                const strikesKick = interaction.options.getInteger('kick');
                const strikesBan = interaction.options.getInteger('ban');
                const muteDuration = interaction.options.getInteger('mute_duration') * 60; // Convertir a segundos
                const strikeExpiry = interaction.options.getInteger('strike_expiry') * 86400; // Convertir a segundos

                // Validar que los umbrales sean incrementales
                if (strikesMute >= strikesKick || strikesKick >= strikesBan) {
                    await interaction.reply({
                        embeds: [createModActionEmbed({
                            title: '❌ Error de configuración',
                            description: 'Los umbrales deben ser incrementales (mute < kick < ban).',
                            color: 0xFF0000
                        })],
                        ephemeral: true
                    });
                    return;
                }

                await db.run(`
                    INSERT OR REPLACE INTO strike_config (
                        guild_id,
                        strikes_for_mute,
                        strikes_for_kick,
                        strikes_for_ban,
                        mute_duration,
                        strike_expiry
                    ) VALUES (?, ?, ?, ?, ?, ?)
                `, [
                    interaction.guild.id,
                    strikesMute,
                    strikesKick,
                    strikesBan,
                    muteDuration,
                    strikeExpiry
                ]);

                await interaction.reply({
                    embeds: [createModActionEmbed({
                        title: '✅ Configuración actualizada',
                        description: 'La configuración de strikes ha sido actualizada.',
                        fields: [
                            {
                                name: '🔇 Silencio',
                                value: `${strikesMute} strikes`,
                                inline: true
                            },
                            {
                                name: '👢 Expulsión',
                                value: `${strikesKick} strikes`,
                                inline: true
                            },
                            {
                                name: '🔨 Baneo',
                                value: `${strikesBan} strikes`,
                                inline: true
                            },
                            {
                                name: '⏱️ Duración del silencio',
                                value: `${interaction.options.getInteger('mute_duration')} minutos`,
                                inline: true
                            },
                            {
                                name: '📅 Expiración de strikes',
                                value: `${interaction.options.getInteger('strike_expiry')} días`,
                                inline: true
                            }
                        ],
                        color: 0x00FF00
                    })],
                    ephemeral: true
                });
                break;
            }

            case 'ver': {
                const config = await db.get('SELECT * FROM strike_config WHERE guild_id = ?', [interaction.guild.id]);

                if (!config) {
                    await interaction.reply({
                        embeds: [createModActionEmbed({
                            title: '❌ Sin configuración',
                            description: 'No hay configuración de strikes para este servidor.',
                            color: 0xFF0000
                        })],
                        ephemeral: true
                    });
                    return;
                }

                await interaction.reply({
                    embeds: [createModActionEmbed({
                        title: '📋 Configuración de Strikes',
                        description: 'Configuración actual del sistema de strikes',
                        fields: [
                            {
                                name: '🔇 Silencio',
                                value: `${config.strikes_for_mute} strikes`,
                                inline: true
                            },
                            {
                                name: '👢 Expulsión',
                                value: `${config.strikes_for_kick} strikes`,
                                inline: true
                            },
                            {
                                name: '🔨 Baneo',
                                value: `${config.strikes_for_ban} strikes`,
                                inline: true
                            },
                            {
                                name: '⏱️ Duración del silencio',
                                value: `${config.mute_duration / 60} minutos`,
                                inline: true
                            },
                            {
                                name: '📅 Expiración de strikes',
                                value: `${config.strike_expiry / 86400} días`,
                                inline: true
                            }
                        ]
                    })],
                    ephemeral: true
                });
                break;
            }

            case 'reset': {
                const targetUser = interaction.options.getUser('usuario');

                await db.run(`
                    UPDATE user_strikes 
                    SET active = 0 
                    WHERE guild_id = ? AND user_id = ?
                `, [interaction.guild.id, targetUser.id]);

                await interaction.reply({
                    embeds: [createModActionEmbed({
                        title: '✅ Strikes reiniciados',
                        description: `Los strikes de ${targetUser.tag} han sido reiniciados.`,
                        color: 0x00FF00
                    })],
                    ephemeral: true
                });
                break;
            }
        }
    } catch (error) {
        console.error('Error en comando strikes:', error);
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