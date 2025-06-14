import express from 'express';
import axios from 'axios';
import { config } from '../config.js'; // Import config

const router = express.Router();

// Use values from config.js
const DISCORD_CLIENT_ID = config.clientId;
const DISCORD_CLIENT_SECRET = config.discordClientSecret;
const DISCORD_REDIRECT_URI = config.discordRedirectUri;

// Session middleware is now handled globally in server.js

// Route to initiate Discord OAuth2 login
router.get('/discord', (req, res) => {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds' // Ensure 'guilds' scope is requested
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
      scope: 'identify guilds' // Ensure scopes match what was requested
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token, token_type } = tokenResponse.data;

    // Fetch user data from Discord
    let userResponse;
    try {
      userResponse = await axios.get('https://discord.com/api/users/@me', {
        headers: {
          authorization: `${token_type} ${access_token}`
        }
      });
    } catch (error) {
      console.error('Error fetching user data from Discord API (/users/@me):', error.response ? error.response.data : error.message);
      // If user data fetch fails, it's a critical error for authentication.
      return res.status(500).send('Error fetching user data from Discord.');
    }


    // Fetch user guilds from Discord
    let guildsResponse;
    try {
      guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
        headers: {
          authorization: `${token_type} ${access_token}`
        }
      });
    } catch (error) {
      console.error('Error fetching user guilds from Discord API (/users/@me/guilds):', error.response ? error.response.data : error.message);
      // If guilds fetch fails, we might still proceed with basic user data,
      // or treat it as an error depending on application requirements.
      // For this dashboard, guilds are essential.
      return res.status(500).send('Error fetching user guilds from Discord.');
    }


    // Store user data and guilds in session
    req.session.discordUser = userResponse.data;
    req.session.discordUser.guilds = guildsResponse.data; // Attach guilds to the user object
    req.session.accessToken = access_token; // Store access token if needed elsewhere

    // Redirect to the home page
    res.redirect('/');

  } catch (error) {
    // This catch block will handle errors from the token exchange primarily,
    // or any other errors not caught by the specific try-catch blocks for API calls.
    console.error('Error during Discord OAuth2 callback (token exchange or other):', error.response ? error.response.data : error.message);
    res.status(500).send('Error during authentication process.');
  }
});

// Route to logout (example)
router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      // Log the error but still try to redirect, or handle more gracefully
      console.error("Error destroying session:", err);
      return res.status(500).send('Could not log out.');
    }
    // Ensure response is sent only once
    if (!res.headersSent) {
        res.redirect('/'); // Redirect to home page after logout
    }
  });
});

export default router;
