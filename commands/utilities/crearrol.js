const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crearrol')
    .setDescription('Crea un nuevo rol en el servidor.')
    .addStringOption(option =>
      option.setName('nombre')
        .setDescription('El nombre del nuevo rol.')
        .setRequired(true)),

  async execute(interaction) {
    // Check for ManageRoles permission
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Permiso Denegado')
        .setDescription('No tenés permiso para crear roles.')
        .setColor(0xFF0000); // Red
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const roleName = interaction.options.getString('nombre');

    try {
      await interaction.guild.roles.create({ name: roleName });
      const embed = new EmbedBuilder()
        .setTitle('✅ Rol Creado')
        .setDescription(`Se ha creado el rol: ${roleName}`)
        .setColor(0x00FF00); // Green
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error al crear el rol:', error);
      const embed = new EmbedBuilder()
        .setTitle('❌ Error al Crear Rol')
        .setDescription('Hubo un error al intentar crear el rol.')
        .setColor(0xFF0000); // Red
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
