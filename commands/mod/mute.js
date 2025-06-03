import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';

// Helper function to parse time string to milliseconds
function parseTimeToMs(timeString) {
  if (!timeString) return null;

  const value = parseInt(timeString.slice(0, -1));
  const unit = timeString.slice(-1).toLowerCase();

  if (isNaN(value) || value <= 0) return 'invalid_value';

  if (unit === 'm') return value * 60 * 1000;
  if (unit === 'h') return value * 60 * 60 * 1000;
  if (unit === 'd') return value * 24 * 60 * 60 * 1000;

  return 'invalid_unit';
}

// Helper function to format milliseconds to human-readable string
function formatMsToHuman(ms, timeString) {
    if (ms === null) return "Indefinido";

    const value = parseInt(timeString.slice(0, -1)); // Keep original value for clarity
    const unit = timeString.slice(-1).toLowerCase();

    if (unit === 'm') return `${value} minuto(s)`;
    if (unit === 'h') return `${value} hora(s)`;
    if (unit === 'd') return `${value} día(s)`;
    return "Indefinido"; // Fallback, should not happen if parseTimeToMs is correct
}

export const data = new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Silencia a un usuario')
    .addUserOption(option =>
        option.setName('usuario')
            .setDescription('El usuario a silenciar')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('razon')
            .setDescription('Razón del silenciamiento')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('duracion')
            .setDescription('Duración del silenciamiento (ej: 1h, 1d, 1w)')
            .setRequired(true));

export async function execute(interaction) {
    // Verificar permisos
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return interaction.reply({
            content: '❌ No tienes permisos para silenciar usuarios.',
            ephemeral: true
        });
    }

    const usuario = interaction.options.getUser('usuario');
    const razon = interaction.options.getString('razon');
    const duracionStr = interaction.options.getString('duracion');
    const miembro = await interaction.guild.members.fetch(usuario.id);

    // No permitir auto-silenciamiento
    if (usuario.id === interaction.user.id) {
        return interaction.reply({
            content: '❌ No puedes silenciarte a ti mismo.',
            ephemeral: true
        });
    }

    // Verificar si el bot puede silenciar al usuario
    if (!miembro.moderatable) {
        return interaction.reply({
            content: '❌ No puedo silenciar a este usuario. Puede que tenga un rol más alto que el mío.',
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
        await interaction.reply(`✅ Usuario ${usuario.tag} ha sido silenciado por ${duracionStr}.\nRazón: ${razon}`);

        // Intentar notificar al usuario
        try {
            await usuario.send(`Has sido silenciado en ${interaction.guild.name} por ${duracionStr}\nRazón: ${razon}`);
        } catch (dmError) {
            await interaction.followUp({
                content: '⚠️ No se pudo enviar un mensaje privado al usuario.',
                ephemeral: true
            });
        }
    } catch (error) {
        console.error('Error al silenciar:', error);
        await interaction.reply({
            content: '❌ No se pudo silenciar al usuario.',
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
