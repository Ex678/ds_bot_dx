import { Events } from 'discord.js';
import { checkAutoMod, addStrike, logModAction, createModActionEmbed } from '../utils/moderation.js';

export const name = Events.MessageCreate;
export const once = false;

export async function execute(message) {
    // Ignorar mensajes de bots y DMs
    if (message.author.bot || !message.guild) return;

    try {
        const violation = await checkAutoMod(message);
        
        if (violation) {
            const { rule, violation: violationDetails } = violation;
            
            // Aplicar acción según la regla
            switch (rule.action) {
                case 'DELETE':
                    await message.delete();
                    break;

                case 'WARN':
                    const strikeResult = await addStrike(
                        message.guild.id,
                        message.author.id,
                        message.client.user.id,
                        `Violación de regla ${rule.rule_type}`
                    );

                    await logModAction({
                        guildId: message.guild.id,
                        userId: message.author.id,
                        moderatorId: message.client.user.id,
                        actionType: 'WARN',
                        reason: `Auto-moderación: Violación de regla ${rule.rule_type}`
                    });

                    // Si el strike resulta en una acción adicional
                    if (strikeResult.action) {
                        switch (strikeResult.action) {
                            case 'MUTE':
                                // Implementar mute
                                const muteRole = message.guild.roles.cache.find(role => role.name === 'Muted');
                                if (muteRole) {
                                    await message.member.roles.add(muteRole);
                                    setTimeout(() => {
                                        message.member.roles.remove(muteRole).catch(console.error);
                                    }, strikeResult.duration * 1000);
                                }
                                break;

                            case 'KICK':
                                await message.member.kick(`Auto-moderación: Alcanzado límite de strikes`);
                                break;

                            case 'BAN':
                                await message.member.ban({
                                    reason: `Auto-moderación: Alcanzado límite de strikes`
                                });
                                break;
                        }

                        await logModAction({
                            guildId: message.guild.id,
                            userId: message.author.id,
                            moderatorId: message.client.user.id,
                            actionType: strikeResult.action,
                            reason: `Auto-moderación: Alcanzado límite de strikes`,
                            duration: strikeResult.duration
                        });
                    }

                    // Notificar al usuario
                    const warningEmbed = createModActionEmbed({
                        title: '⚠️ Advertencia',
                        description: `Has recibido una advertencia por violar las reglas del servidor.\nRegla: ${rule.rule_type}`,
                        fields: [
                            {
                                name: '📝 Detalles',
                                value: `Strikes totales: ${strikeResult.totalStrikes}`,
                                inline: true
                            }
                        ],
                        color: 0xFFA500
                    });

                    await message.author.send({ embeds: [warningEmbed] }).catch(() => {
                        // Si no se puede enviar DM, enviar en el canal
                        message.channel.send({ embeds: [warningEmbed] });
                    });
                    break;

                case 'MUTE':
                    const muteRole = message.guild.roles.cache.find(role => role.name === 'Muted');
                    if (muteRole) {
                        await message.member.roles.add(muteRole);
                        setTimeout(() => {
                            message.member.roles.remove(muteRole).catch(console.error);
                        }, 3600000); // 1 hora por defecto
                    }
                    break;

                case 'KICK':
                    await message.member.kick(`Auto-moderación: Violación de regla ${rule.rule_type}`);
                    break;

                case 'BAN':
                    await message.member.ban({
                        reason: `Auto-moderación: Violación de regla ${rule.rule_type}`
                    });
                    break;
            }

            // Log de la acción
            const logChannel = message.guild.channels.cache.find(
                channel => channel.name === 'mod-logs'
            );

            if (logChannel) {
                const logEmbed = createModActionEmbed({
                    title: '🛡️ Acción de Auto-Moderación',
                    description: `Se ha detectado una violación de reglas.`,
                    fields: [
                        {
                            name: '👤 Usuario',
                            value: `${message.author.tag} (${message.author.id})`,
                            inline: true
                        },
                        {
                            name: '📜 Regla',
                            value: rule.rule_type,
                            inline: true
                        },
                        {
                            name: '⚡ Acción',
                            value: rule.action,
                            inline: true
                        },
                        {
                            name: '💬 Mensaje',
                            value: message.content.length > 1024 
                                ? message.content.substring(0, 1021) + '...'
                                : message.content || '[No hay contenido de texto]'
                        }
                    ],
                    color: 0xFF0000
                });

                await logChannel.send({ embeds: [logEmbed] });
            }
        }
    } catch (error) {
        console.error('Error en auto-moderación:', error);
    }
} 