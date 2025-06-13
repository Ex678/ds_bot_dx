import express from 'express';
import { getAutoModRules } from '../../utils/storage.js';
import { updateAutoModeration } from '../../utils/moderation.js';

const router = express.Router();

// Placeholder functions removed as we are using actual functions now

const ADMIN_PERMISSION = 0x8; // Discord Administrator permission bit

// Middleware for authorization
const authorizeAdmin = (req, res, next) => {
  const { guildId } = req.params;
  if (!req.session || !req.session.discordUser || !req.session.discordUser.guilds) {
    return res.status(401).json({ error: 'Not authenticated or no guild data available.' });
  }

  const guild = req.session.discordUser.guilds.find(g => g.id === guildId);

  if (!guild) {
    return res.status(403).json({ error: 'User is not a member of this guild or guild not found.' });
  }

  // The permissions are a string in the Discord API response, convert to number
  const userPermissions = parseInt(guild.permissions);

  if ((userPermissions & ADMIN_PERMISSION) !== ADMIN_PERMISSION) {
    return res.status(403).json({ error: 'User does not have administrator permissions for this guild.' });
  }

  // Add guild object to request for easy access in route handlers
  req.guild = guild;
  next();
};

// GET /guilds/:guildId/automod/rules
router.get('/guilds/:guildId/automod/rules', authorizeAdmin, async (req, res) => {
  const { guildId } = req.params;
  try {
    // User is authorized by authorizeAdmin middleware
    const rules = getAutoModRules(guildId); // No await needed if it's synchronous

    if (!rules) {
      // This case might not be hit if getAutoModRules always returns [] for missing/empty
      return res.status(404).json({ message: 'No AutoMod rules found for this guild or an error occurred.' });
    }
    // If rules is an empty array, it's a valid state (no rules configured)
    res.json(rules);
  } catch (error) {
    console.error(`Error fetching automod rules for guild ${guildId}:`, error);
    res.status(500).json({ error: 'Failed to retrieve AutoMod rules.' });
  }
});

// POST /guilds/:guildId/automod/rules
router.post('/guilds/:guildId/automod/rules', authorizeAdmin, async (req, res) => {
  const { guildId } = req.params;
  const newRulesSettings = req.body;

  // Validate req.body
  if (!newRulesSettings || typeof newRulesSettings !== 'object' || Object.keys(newRulesSettings).length === 0) {
    return res.status(400).json({ error: 'Invalid or empty rules data provided. Expected a JSON object with rule types as keys and their values.' });
  }

  // Further validation can be added here to check if rule types and values are valid
  // For example, check against a predefined list of allowed rule types.

  try {
    // User is authorized by authorizeAdmin middleware
    const success = updateAutoModeration(guildId, newRulesSettings); // No await needed if it's synchronous

    if (success) {
      res.status(200).json({ message: 'AutoMod rules updated successfully.' });
    } else {
      // This path might be taken if updateAutoModeration itself has internal errors but doesn't throw
      res.status(500).json({ error: 'Failed to update AutoMod rules. Function returned false.' });
    }
  } catch (error) {
    console.error(`Error updating automod rules for guild ${guildId}:`, error);
    res.status(500).json({ error: 'An unexpected error occurred while updating AutoMod rules.' });
  }
});

export default router;
