const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');

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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Silencia a un usuario impidiéndole enviar mensajes.')
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('El usuario a silenciar.')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('tiempo')
        .setDescription('Duración del silencio (e.g., 10m, 1h, 1d). Por defecto indefinido.')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('razon')
        .setDescription('Razón del silencio.')
        .setRequired(false)),

  async execute(interaction) {
    // 1. Permission Check
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      const permEmbed = new EmbedBuilder()
        .setTitle('❌ Permiso Denegado')
        .setDescription('No tenés permiso para silenciar usuarios.')
        .setColor(0xFF0000) // Red
        .setTimestamp();
      return interaction.reply({ embeds: [permEmbed], ephemeral: true });
    }

    const targetMember = interaction.options.getMember('usuario');
    const timeString = interaction.options.getString('tiempo');
    const reason = interaction.options.getString('razon') || 'Sin razón especificada';

    // 2. Moderatable Check
    if (!targetMember) {
        const noMemberEmbed = new EmbedBuilder()
            .setTitle('❌ Usuario no Encontrado')
            .setDescription('No pude encontrar al usuario especificado.')
            .setColor(0xFF0000)
            .setTimestamp();
        return interaction.reply({ embeds: [noMemberEmbed], ephemeral: true });
    }

    if (!targetMember.moderatable) {
      const modEmbed = new EmbedBuilder()
        .setTitle('❌ Acción Imposible')
        .setDescription('No puedo silenciar a este usuario. Puede que tenga un rol superior o que yo no tenga permisos suficientes.')
        .setColor(0xFF0000)
        .setTimestamp();
      return interaction.reply({ embeds: [modEmbed], ephemeral: true });
    }
    
    if (targetMember.id === interaction.user.id) {
        const selfMuteEmbed = new EmbedBuilder()
            .setTitle('❌ Acción Inválida')
            .setDescription('No te podés silenciar a vos mismo.')
            .setColor(0xFFCC00) // Yellow for warning
            .setTimestamp();
        return interaction.reply({ embeds: [selfMuteEmbed], ephemeral: true });
    }


    // 3. Parse Duration
    let durationMs = null;
    let humanDuration = "Indefinido";

    if (timeString) {
      durationMs = parseTimeToMs(timeString);
      if (durationMs === 'invalid_value' || durationMs === 'invalid_unit') {
        const formatEmbed = new EmbedBuilder()
          .setTitle('❌ Formato de Tiempo Inválido')
          .setDescription('El valor del tiempo debe ser un número positivo. Usa m (minutos), h (horas), d (días). Ejemplo: 10m, 2h, 1d.')
          .setColor(0xFFCC00) // Yellow for warning
          .setTimestamp();
        return interaction.reply({ embeds: [formatEmbed], ephemeral: true });
      }

      // Discord API allows up to 28 days for timeouts.
      const maxDurationMs = 28 * 24 * 60 * 60 * 1000;
      if (durationMs > maxDurationMs) {
        const longEmbed = new EmbedBuilder()
          .setTitle('❌ Duración Excesiva')
          .setDescription('El tiempo de silencio no puede exceder los 28 días.')
          .setColor(0xFFCC00) // Yellow for warning
          .setTimestamp();
        return interaction.reply({ embeds: [longEmbed], ephemeral: true });
      }
      humanDuration = formatMsToHuman(durationMs, timeString);
    }

    // 4. Mute Operation
    try {
      await targetMember.timeout(durationMs, reason);

      const successEmbed = new EmbedBuilder()
        .setTitle('🔇 Usuario Silenciado')
        .addFields(
          { name: 'Usuario', value: targetMember.user.tag, inline: true },
          { name: 'Duración', value: humanDuration, inline: true },
          { name: 'Razón', value: reason, inline: false }
        )
        .setColor(0x00FF00) // Green
        .setThumbnail(targetMember.user.displayAvatarURL())
        .setTimestamp();
      await interaction.reply({ embeds: [successEmbed] });

    } catch (error) {
      console.error('Error al silenciar al usuario:', error);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Error al Silenciar')
        .setDescription('Hubo un error al intentar silenciar al usuario. Revisa mis permisos.')
        .setColor(0xFF0000)
        .setTimestamp();
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },
};
