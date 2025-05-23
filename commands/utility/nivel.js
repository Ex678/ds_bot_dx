const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserData, getXpNeededForLevel, readLevelsData } = require('../../features/levelingSystem.js'); // Added readLevelsData

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nivel')
    .setDescription('Muestra tu nivel y XP actual o el de otro usuario.')
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('El usuario cuyo nivel quieres ver.')
        .setRequired(false)),

  async execute(interaction) {
    try {
      const targetUser = interaction.options.getUser('usuario') || interaction.user;
      const userData = await getUserData(targetUser.id);

      // If getXpNeededForLevel(0) is 0, and a new user has level 0 and xp 0:
      // xpForCurrentLevel will be 0.
      // currentProgressXp will be 0.
      const xpForCurrentLevel = getXpNeededForLevel(userData.level); 
      const xpForNextLevel = getXpNeededForLevel(userData.level + 1);
      
      const currentProgressXp = userData.xp - xpForCurrentLevel;
      const xpNeededToLevelUp = xpForNextLevel - xpForCurrentLevel;

      let progressString;
      if (xpNeededToLevelUp <= 0 && userData.level > 0) { // Handles if level formula doesn't go higher or for max level
        progressString = "¡Máximo nivel alcanzado o XP ya supera el próximo nivel!";
      } else if (xpNeededToLevelUp <= 0 && userData.level === 0){ // New user or issue with level 0 calculation
         progressString = `0 / ${getXpNeededForLevel(1)} XP`; // Show progress to level 1
      }
      else {
        progressString = `${currentProgressXp} / ${xpNeededToLevelUp} XP`;
      }
      
      // Specific check for brand new user who hasn't sent a message yet
      if (userData.level === 0 && userData.xp === 0) {
        progressString = `0 / ${getXpNeededForLevel(1)} XP`;
      }


      const allUsersData = await readLevelsData();
      const usersArray = Object.values(allUsersData);

      usersArray.sort((a, b) => {
        if (b.level === a.level) {
          return b.xp - a.xp;
        }
        return b.level - a.level;
      });

      const rank = usersArray.findIndex(u => u.userId === targetUser.id) + 1;
      const rankDisplay = rank > 0 ? `#${rank}` : "Sin clasificar";


      const embed = new EmbedBuilder()
        .setTitle(`📊 Nivel de ${targetUser.username}`)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: 'Nivel', value: userData.level.toString(), inline: true },
          { name: 'XP Total', value: userData.xp.toString(), inline: true },
          { name: '🏆 Rango en el Servidor', value: rankDisplay, inline: true },
          { name: 'Progreso para el siguiente nivel', value: progressString, inline: false } // Made this non-inline
        )
        .setColor(0x0099FF) // Blue
        .setImage("https://media.tenor.com/images/2b207157150e90197943af22f851831c/tenor.gif") // Nyan Cat GIF
        .setFooter({ text: `Solicitado por ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('[Nivel Command] Error:', error);
      await interaction.reply({ content: '❌ Hubo un error al obtener la información del nivel.', ephemeral: true });
    }
  },
};
