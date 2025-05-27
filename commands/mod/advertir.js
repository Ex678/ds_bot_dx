const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('advertir')
    .setDescription('Advierte a un usuario.')
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('El usuario a advertir.')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('razon')
        .setDescription('Razón de la advertencia.')
        .setRequired(true)),

  async execute(interaction) {
    // 1. Permission Check
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      const permEmbed = new EmbedBuilder()
        .setTitle('❌ Permiso Denegado')
        .setDescription('No tenés permiso para advertir usuarios.')
        .setColor(0xFF0000) // Red
        .setTimestamp();
      return interaction.reply({ embeds: [permEmbed], ephemeral: true });
    }

    const targetMember = interaction.options.getMember('usuario');
    const reason = interaction.options.getString('razon');

    // 2. Target Exists Check
    if (!targetMember) {
      const noMemberEmbed = new EmbedBuilder()
        .setTitle('❌ Usuario no Encontrado')
        .setDescription('No pude encontrar al usuario especificado.')
        .setColor(0xFF0000) // Red
        .setTimestamp();
      return interaction.reply({ embeds: [noMemberEmbed], ephemeral: true });
    }

    // 3. Self/Bot Warn Check
    if (targetMember.id === interaction.user.id) {
      const selfWarnEmbed = new EmbedBuilder()
        .setTitle('❌ Acción Inválida')
        .setDescription('No puedes advertirte a ti mismo.')
        .setColor(0xFFCC00) // Yellow for warning
        .setTimestamp();
      return interaction.reply({ embeds: [selfWarnEmbed], ephemeral: true });
    }

    if (targetMember.id === interaction.client.user.id) {
      const botWarnEmbed = new EmbedBuilder()
        .setTitle('❌ Acción Inválida')
        .setDescription('No puedes advertir al bot.')
        .setColor(0xFFCC00) // Yellow for warning
        .setTimestamp();
      return interaction.reply({ embeds: [botWarnEmbed], ephemeral: true });
    }

    let dmSentSuccessfully = false;
    try {
      // 4. DM Embed
      const dmEmbed = new EmbedBuilder()
        .setTitle('⚠️ Has sido advertido/a')
        .setDescription(`Has recibido una advertencia en el servidor "${interaction.guild.name}" por la siguiente razón:`)
        .addFields({ name: 'Razón', value: reason })
        .setColor(0xFFA500) // Orange
        .setTimestamp();

      // 5. Attempt to send DM
      await targetMember.send({ embeds: [dmEmbed] });
      dmSentSuccessfully = true;

    } catch (dmError) {
      console.warn(`No se pudo enviar DM de advertencia a ${targetMember.user.tag}: ${dmError}`);
      dmSentSuccessfully = false;
    }

    // 6. Channel Confirmation Embed
    const confirmationEmbed = new EmbedBuilder()
      .setTitle('✅ Usuario Advertido')
      .addFields(
        { name: 'Usuario', value: targetMember.user.tag, inline: true },
        { name: 'Advertido por', value: interaction.user.tag, inline: true },
        { name: 'Razón', value: reason, inline: false }
      )
      .setColor(0x00FF00) // Green
      .setTimestamp();

    if (dmSentSuccessfully) {
      confirmationEmbed.setFooter({ text: 'El usuario ha sido notificado por DM.' });
    } else {
      confirmationEmbed.setFooter({ text: 'No se pudo notificar al usuario por DM (puede que los tenga desactivados).' });
    }

    try {
      await interaction.reply({ embeds: [confirmationEmbed] });
    } catch (replyError) {
        console.error('Error al enviar la confirmación de advertencia al canal:', replyError);
        // Attempt a fallback if the initial reply fails for some reason
        const fallbackErrorEmbed = new EmbedBuilder()
            .setTitle('❌ Error')
            .setDescription('Se advirtió al usuario, pero hubo un error al enviar la confirmación al canal.')
            .setColor(0xFF0000)
            .setTimestamp();
        await interaction.followUp({ embeds: [fallbackErrorEmbed], ephemeral: true });
    }
  },
};
