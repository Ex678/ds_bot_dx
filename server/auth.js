import express from 'express';
import axios from 'axios';
import { config } from '../../config.js'; // Import config

const router = express.Router();

// Use values from config.js
const DISCORD_CLIENT_ID = config.discordClientId;
const DISCORD_CLIENT_SECRET = config.discordClientSecret;
const DISCORD_REDIRECT_URI = config.discordRedirectUri;

// Session middleware is now handled globally in server.js

// Route to initiate Discord OAuth2 login
router.get('/discord', (req, res) => {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds' // Adjust scopes as needed
  });
  const discordLoginUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  res.redirect(discordLoginUrl);
});

// Route to handle Discord OAuth2 callback
router.get('/discord/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Error: No code provided in callback.');
  }

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: DISCORD_REDIRECT_URI,
      scope: 'identify guilds' // Ensure scopes match
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token, token_type } = tokenResponse.data;

    // Fetch user data from Discord
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: {
        authorization: `${token_type} ${access_token}`
      }
    });

    // Store user data in session (example)
    req.session.discordUser = userResponse.data;
    req.session.accessToken = access_token;

    // Redirect to the home page
    res.redirect('/');

  } catch (error) {
    console.error('Error during Discord OAuth2 callback:', error.response ? error.response.data : error.message);
    res.status(500).send('Error during authentication.');
  }
});

// Route to logout (example)
router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).send('Could not log out.');
    }
    res.redirect('/'); // Redirect to home page after logout
  });
});

export default router;
