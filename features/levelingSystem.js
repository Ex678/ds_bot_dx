const fs = require('node:fs').promises; // Changed to use fs.promises
const path = require('node:path');

// --- XP GAIN CONFIGURATION ---
// Base XP awarded for each message.
const XP_PER_MESSAGE = 10;
// For every `XP_BONUS_PER_CHARS` characters in a message, `XP_BONUS_CHAR_UNIT` XP is added.
const XP_BONUS_PER_CHARS = 10; 
// How much XP is awarded per unit of `XP_BONUS_PER_CHARS`.
const XP_BONUS_CHAR_UNIT = 1;  
// Maximum XP that can be gained from message length bonus.
const MAX_XP_BONUS_FROM_LENGTH = 5;
// Cooldown in seconds between messages that grant XP to a user.
const XP_COOLDOWN_SECONDS = 60;
// Final XP = XP_PER_MESSAGE + Min(MAX_XP_BONUS_FROM_LENGTH, Floor(message.length / XP_BONUS_PER_CHARS) * XP_BONUS_CHAR_UNIT)

// --- LEVELING FORMULA CONFIGURATION ---
// Formula: Total XP to reach Level L = LEVEL_CONSTANT * (L ^ LEVEL_POWER)
// `C` in the formula: Base XP multiplier. Adjusts overall XP needed per level.
const LEVEL_CONSTANT = 100; 
// `P` in the formula: Power exponent. Affects how steeply XP requirements increase per level.
const LEVEL_POWER = 1.5;    

// --- ROLE REWARDS CONFIGURATION ---
// Defines roles awarded at specific levels.
// To add a new reward:
// 1. Create a new object in the array: `{ level: DESIRED_LEVEL, roleId: "YOUR_ROLE_ID_HERE" }`
//    - `DESIRED_LEVEL`: The level at which the role should be awarded.
//    - `YOUR_ROLE_ID_HERE`: The actual ID of the role from your Discord server.
// 2. Ensure the bot has the 'Manage Roles' permission in your server.
// 3. Ensure the bot's highest role is positioned *above* all roles defined here in your server's role hierarchy.
// Example: { level: 5, roleId: "123456789012345678" }
const roleRewards = [
  { level: 5, roleId: "PLACEHOLDER_ROLE_ID_LEVEL_5" }, // Example: Award role for reaching level 5
  { level: 10, roleId: "PLACEHOLDER_ROLE_ID_LEVEL_10" },// Example: Award role for reaching level 10
  { level: 20, roleId: "PLACEHOLDER_ROLE_ID_LEVEL_20" } // Example: Award role for reaching level 20
  // Add more reward tiers here as needed
];
// --- END ROLE REWARDS CONFIGURATION ---

// levels.json will be stored in the project root directory
const LEVELS_FILE_PATH = path.resolve('./levels.json');

/**
 * Reads the levels data from levels.json asynchronously.
 * @returns {Promise<object>} The parsed JSON data or an empty object if file doesn't exist or on error.
 */
async function readLevelsData() {
  try {
    // Check if file exists before trying to read
    await fs.access(LEVELS_FILE_PATH); 
    const fileContent = await fs.readFile(LEVELS_FILE_PATH, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File not found is expected initially
      return {};
    }
    console.error('[Leveling System] Error reading levels.json:', error);
    return {}; // Return empty object on other errors to prevent crashes
  }
}

/**
 * Writes the provided data object to levels.json asynchronously.
 * @param {object} data - The data object to write.
 */
async function writeLevelsData(data) {
  try {
    const jsonData = JSON.stringify(data, null, 2); // Pretty print JSON
    await fs.writeFile(LEVELS_FILE_PATH, jsonData, 'utf8');
  } catch (error) {
    console.error('[Leveling System] Error writing to levels.json:', error);
  }
}

/**
 * Retrieves the data for a specific user asynchronously.
 * @param {string} userId - The ID of the user.
 * @returns {Promise<object>} The user's data or a default structure if not found.
 */
async function getUserData(userId) {
  const allData = await readLevelsData();
  if (allData[userId]) {
    return allData[userId];
  }
  // Default structure for a new user
  return {
    xp: 0,
    level: 0,
    lastMessageTimestamp: 0,
    userId: userId, // Store userId for easier identification if needed
  };
}

/**
 * Updates the data for a specific user and saves it asynchronously.
 * @param {object} userData - The user data object to update. Must include userId.
 */
async function updateUserData(userData) {
  if (!userData || !userData.userId) {
    console.error('[Leveling System] Attempted to update user data without a userId.');
    return;
  }
  const allData = await readLevelsData();
  allData[userData.userId] = userData;
  await writeLevelsData(allData);
}

/**
 * Handles a message to grant XP to the user.
 * @param {object} message - The Discord message object.
 * @returns {Promise<object|null>} The updated user data or null if no XP was granted.
 */
async function handleMessageForXP(message) {
  if (message.author.bot) {
    return null; // No XP for bots
  }

  const userData = await getUserData(message.author.id);
  const currentTime = Date.now();

  if ((currentTime - userData.lastMessageTimestamp) / 1000 < XP_COOLDOWN_SECONDS) {
    // Still in cooldown
    return null;
  }

  let xpGained = XP_PER_MESSAGE;
  const messageLengthBonus = Math.min(
    Math.floor(message.content.length / XP_BONUS_PER_CHARS) * XP_BONUS_CHAR_UNIT,
    MAX_XP_BONUS_FROM_LENGTH
  );
  xpGained += messageLengthBonus;

  userData.xp += xpGained;
  userData.lastMessageTimestamp = currentTime;

  await updateUserData(userData);

  console.log(`[Leveling System] User ${message.author.tag} gained ${xpGained} XP. Total XP: ${userData.xp}`);
  return userData;
}

module.exports = {
  getUserData,
  updateUserData,
  handleMessageForXP,
  checkAndHandleLevelUp,
  handleRoleRewards,
  getXpNeededForLevel,
  readLevelsData, // Exporting this function
};

/**
 * Calculates the total XP needed to reach a specific level.
 * @param {number} level - The target level.
 * @returns {number} The total XP required to reach that level.
 */
function getXpNeededForLevel(level) {
  if (level <= 0) {
    return 0;
  }
  return Math.floor(LEVEL_CONSTANT * Math.pow(level, LEVEL_POWER));
}

/**
 * Checks if a user has leveled up and handles the process.
 * @param {object} message - The Discord message object.
 * @param {object} userData - The user's current data object.
 * @returns {Promise<object>} The potentially updated user data object.
 */
async function checkAndHandleLevelUp(message, userData) {
  let currentLevel = userData.level;
  let xpNeededForNextLevel = getXpNeededForLevel(currentLevel + 1);
  let leveledUpInThisCheck = false;

  while (userData.xp >= xpNeededForNextLevel) {
    currentLevel++;
    userData.level = currentLevel;
    leveledUpInThisCheck = true;

    try {
      await message.channel.send(`🎉 ¡Felicidades ${message.author}! Has subido al nivel **${userData.level}**!`);
    } catch (sendError) {
      console.error(`[Leveling System] Error sending level up message for ${message.author.tag}:`, sendError);
      // Continue with level up even if message fails
    }
    
    console.log(`[Leveling System] User ${message.author.tag} leveled up to ${userData.level}`);
    xpNeededForNextLevel = getXpNeededForLevel(currentLevel + 1); // Check for the next level up
  }

  if (leveledUpInThisCheck) {
    await updateUserData(userData); // Save changes if a level up occurred
  }

  return userData; // Return the (potentially updated) userData
}

/**
 * Handles awarding roles to a member based on their level.
 * @param {object} member - The Discord GuildMember object.
 * @param {object} userData - The user's data object (containing level information).
 */
async function handleRoleRewards(member, userData) {
  if (!member || !userData) {
    console.error('[Role Rewards] Invalid member or userData provided.');
    return;
  }

  // Check bot's ManageRoles permission once at the start
  if (!member.guild.members.me.permissions.has('ManageRoles')) {
    console.error('[Role Rewards] Bot lacks ManageRoles permission in this guild.');
    return;
  }

  for (const reward of roleRewards) {
    if (userData.level >= reward.level) {
      if (member.roles.cache.has(reward.roleId)) {
        // console.log(`[Role Rewards] User ${member.user.tag} already has role for level ${reward.level}.`);
        continue; // Already has this reward role
      }

      const role = member.guild.roles.cache.get(reward.roleId);

      if (!role) {
        console.error(`[Role Rewards] Role with ID ${reward.roleId} for level ${reward.level} not found in guild ${member.guild.name}.`);
        continue;
      }

      if (role.position >= member.guild.members.me.roles.highest.position) {
        console.error(`[Role Rewards] Cannot assign role "${role.name}" (ID: ${role.id}) to ${member.user.tag} as it's higher or equal to my highest role.`);
        continue;
      }

      try {
        await member.roles.add(role);
        console.log(`[Role Rewards] User ${member.user.tag} received role "${role.name}" for reaching level ${reward.level}.`);
        
        // Attempt to send DM
        await member.send(`¡Felicidades! Has alcanzado el nivel ${reward.level} y se te ha otorgado el rol **${role.name}** en el servidor ${member.guild.name}.`)
          .catch(dmError => {
            console.log(`[Role Rewards] Could not DM user ${member.user.tag} about role reward "${role.name}". Error: ${dmError.message}`);
            // Optionally, send a message in a public channel if DM fails
            // For now, just logging the DM failure is fine as per instructions.
          });

      } catch (error) {
        console.error(`[Role Rewards] Error adding role "${role.name}" (ID: ${role.id}) to user ${member.user.tag}:`, error);
      }
    }
  }
}
