const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js'); // Removed EmbedBuilder, Added AttachmentBuilder
const { readLevelsData } = require('../../features/levelingSystem.js');
const { generateLeaderboardImage } = require('../../features/imageGenerator.js'); // Added generateLeaderboardImage

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clasificacion')
    .setDescription('Muestra la tabla de clasificación de niveles del servidor.'),

  async execute(interaction) {
    try {
      const allUsersData = await readLevelsData();
      const usersArray = Object.values(allUsersData);

      usersArray.sort((a, b) => {
        if (b.level === a.level) {
          return b.xp - a.xp; // Sort by XP if levels are the same
        }
        return b.level - a.level; // Sort by level
      });

      const top10SortedData = usersArray.slice(0, 10);

      const top10UsersForImage = [];
      for (const levelData of top10SortedData) {
        let discordUser = null;
        try {
          discordUser = await interaction.client.users.fetch(levelData.userId);
        } catch (fetchError) {
          console.warn(`[Clasificacion Command] Could not fetch user ${levelData.userId} for leaderboard image: ${fetchError.message}`);
        }
        top10UsersForImage.push({
          userId: levelData.userId,
          username: discordUser ? discordUser.username : 'Usuario Desconocido',
          avatarURL: discordUser ? discordUser.displayAvatarURL({ extension: 'png', size: 128 }) : null,
          level: levelData.level,
          xp: levelData.xp,
        });
      }

      if (top10UsersForImage.length === 0) {
        await interaction.reply({ content: "Aún no hay nadie en la clasificación. ¡Empieza a chatear!", ephemeral: true });
        return;
      }

      try {
        const imageBuffer = await generateLeaderboardImage(top10UsersForImage);
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'leaderboard.png' });
        await interaction.reply({ files: [attachment] });
      } catch (imageError) {
        console.error("[Clasificacion Command] Error generating leaderboard image:", imageError);
        await interaction.reply({ content: "❌ ¡Uy! Hubo un error al generar la imagen de la clasificación. Por favor, inténtalo de nuevo más tarde.", ephemeral: true });
      }

    } catch (error) {
      console.error('[Clasificacion Command] General error:', error);
      await interaction.reply({ content: '❌ Hubo un error al obtener los datos de la clasificación.', ephemeral: true });
    }
  },
};
