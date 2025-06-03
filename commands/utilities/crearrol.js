import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('crearrol')
    .setDescription('Crea un nuevo rol en el servidor')
    .addStringOption(option =>
        option.setName('nombre')
            .setDescription('El nombre del nuevo rol')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('color')
            .setDescription('Color del rol en formato hexadecimal (ej: #FF0000)')
            .setRequired(false));

export async function execute(interaction) {
    // Verificar permisos
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        return interaction.reply({
            content: '❌ No tienes permisos para crear roles.',
            ephemeral: true
        });
    }

    const roleName = interaction.options.getString('nombre');
    const roleColor = interaction.options.getString('color') || '#99AAB5'; // Color por defecto

    try {
        // Validar el formato del color si se proporcionó
        if (roleColor !== '#99AAB5' && !/^#[0-9A-F]{6}$/i.test(roleColor)) {
            return interaction.reply({
                content: '❌ El color debe estar en formato hexadecimal válido (ej: #FF0000).',
                ephemeral: true
            });
        }

        // Crear el rol
        const newRole = await interaction.guild.roles.create({
            name: roleName,
            color: roleColor,
            reason: `Rol creado por ${interaction.user.tag}`
        });

        await interaction.reply(`✅ Rol ${newRole} creado correctamente.`);
    } catch (error) {
        console.error('Error al crear el rol:', error);
        await interaction.reply({
            content: '❌ No se pudo crear el rol. Verifica mis permisos.',
            ephemeral: true
        });
    }
}
