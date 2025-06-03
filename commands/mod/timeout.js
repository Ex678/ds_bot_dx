import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Aplica un timeout a un usuario')
    .addUserOption(option =>
        option.setName('usuario')
            .setDescription('El usuario a quien aplicar timeout')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('duracion')
            .setDescription('Duración del timeout (ej: 1h, 1d, 1w)')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('razon')
            .setDescription('Razón del timeout')
            .setRequired(true));

export async function execute(interaction) {
    // Verificar permisos
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return interaction.reply({
            content: '❌ No tienes permisos para aplicar timeouts.',
            ephemeral: true
        });
    }

    const usuario = interaction.options.getUser('usuario');
    const duracionStr = interaction.options.getString('duracion');
    const razon = interaction.options.getString('razon');
    const miembro = await interaction.guild.members.fetch(usuario.id);

    // No permitir auto-timeout
    if (usuario.id === interaction.user.id) {
        return interaction.reply({
            content: '❌ No puedes aplicarte timeout a ti mismo.',
            ephemeral: true
        });
    }

    // Verificar si el bot puede aplicar timeout al usuario
    if (!miembro.moderatable) {
        return interaction.reply({
            content: '❌ No puedo aplicar timeout a este usuario. Puede que tenga un rol más alto que el mío.',
            ephemeral: true
        });
    }

    // Convertir la duración a milisegundos
    const duracionMs = parseDuration(duracionStr);
    if (!duracionMs) {
        return interaction.reply({
            content: '❌ Formato de duración inválido. Usa formato como: 1h, 1d, 1w',
            ephemeral: true
        });
    }

    try {
        await miembro.timeout(duracionMs, razon);
        await interaction.reply(`✅ Timeout aplicado a ${usuario.tag} por ${duracionStr}.\nRazón: ${razon}`);

        // Intentar notificar al usuario
        try {
            await usuario.send(`Se te ha aplicado un timeout en ${interaction.guild.name} por ${duracionStr}\nRazón: ${razon}`);
        } catch (dmError) {
            await interaction.followUp({
                content: '⚠️ No se pudo enviar un mensaje privado al usuario.',
                ephemeral: true
            });
        }
    } catch (error) {
        console.error('Error al aplicar timeout:', error);
        await interaction.reply({
            content: '❌ No se pudo aplicar el timeout al usuario.',
            ephemeral: true
        });
    }
}

function parseDuration(duration) {
    const match = duration.match(/^(\d+)([hdw])$/);
    if (!match) return null;

    const [, amount, unit] = match;
    const multipliers = {
        h: 60 * 60 * 1000,        // horas
        d: 24 * 60 * 60 * 1000,   // días
        w: 7 * 24 * 60 * 60 * 1000 // semanas
    };

    return parseInt(amount) * multipliers[unit];
}

