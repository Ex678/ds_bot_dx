const SpotifyWebApi = require('spotify-web-api-node');
let config = {}; // To be loaded from config.json
try {
  // Assuming spotifyService.js is in the root, alongside config.json
  config = require('./config.json'); 
} catch (error) {
  console.error('[Spotify Service] Could not load config.json. Spotify features will not work. Error:', error.message);
}

// Import play-dl
const playdl = require('play-dl');

const spotifyApi = new SpotifyWebApi({
  // Credentials will be set in initializeSpotifyClient if loaded from config
  // Setting them here directly from `config` might fail if config.json is missing at this point
});

let clientInitialized = false;
let tokenRefreshTimeout = null;

async function initializeSpotifyClient() {
  if (tokenRefreshTimeout) {
    clearTimeout(tokenRefreshTimeout); // Clear any existing refresh timeout
    tokenRefreshTimeout = null;
  }

  if (!config.spotifyClientId || !config.spotifyClientSecret) {
    console.error('[Spotify Service] Spotify Client ID or Client Secret not found in config.json.');
    clientInitialized = false;
    return false;
  }
  
  // Set credentials
  spotifyApi.setClientId(config.spotifyClientId);
  spotifyApi.setClientSecret(config.spotifyClientSecret);

  try {
    const data = await spotifyApi.clientCredentialsGrant();
    console.log('[Spotify Service] Spotify access token obtained.');
    spotifyApi.setAccessToken(data.body['access_token']);
    
    const expiresIn = data.body['expires_in']; // seconds
    // Schedule token refresh a bit before it expires (e.g., 1 minute before)
    // Ensures that we request a new token before the current one becomes invalid.
    if (expiresIn > 60) {
        tokenRefreshTimeout = setTimeout(initializeSpotifyClient, (expiresIn - 60) * 1000); 
        console.log(`[Spotify Service] Token will be refreshed in approx. ${(expiresIn - 60) / 60} minutes.`);
    } else {
        // If expires_in is very short, refresh sooner, e.g., halfway through
        tokenRefreshTimeout = setTimeout(initializeSpotifyClient, (expiresIn / 2) * 1000);
        console.log(`[Spotify Service] Token has a short expiry. Refreshing in approx. ${expiresIn / 2} seconds.`);
    }
    
    clientInitialized = true;
    return true;
  } catch (error) {
    console.error('[Spotify Service] Error obtaining Spotify access token:', error.message || error);
    if (error.body) console.error('[Spotify Service] Error body:', JSON.stringify(error.body));
    clientInitialized = false;
    
    // Optional: Retry initialization after a delay if it's a network issue or temporary hiccup
    // For now, we'll just log the error. A more robust implementation might retry a few times.
    // setTimeout(initializeSpotifyClient, 60 * 1000); // Retry after 1 minute
    return false;
  }
}

async function searchSpotifyTrack(trackName) {
  if (!clientInitialized) {
    console.warn('[Spotify Service] Spotify client not initialized or token not available. Attempting to initialize...');
    const success = await initializeSpotifyClient();
    if (!success) {
        console.error('[Spotify Service] Initialization failed. Cannot search track.');
        return null;
    }
    // If initialization was successful, clientInitialized is now true.
  }

  try {
    console.log(`[Spotify Service] Searching for track: "${trackName}"`);
    const searchResult = await spotifyApi.searchTracks(trackName, { limit: 1 });
    if (searchResult.body && searchResult.body.tracks && searchResult.body.tracks.items.length > 0) {
      const track = searchResult.body.tracks.items[0];
      console.log(`[Spotify Service] Found track: ${track.name} by ${track.artists.map(a => a.name).join(', ')} (ID: ${track.id})`);
      return track;
    } else {
      console.log(`[Spotify Service] No tracks found for "${trackName}"`);
      return null;
    }
  } catch (error) {
    console.error(`[Spotify Service] Error searching track "${trackName}":`, error.message || error);
    if (error.body) console.error('[Spotify Service] Error body:', JSON.stringify(error.body));
    
    // Handle token expiration (401 Unauthorized)
    if (error.statusCode === 401 && error.message.includes('token expired')) {
        console.log('[Spotify Service] Access token expired. Attempting to refresh and retry search...');
        const refreshed = await initializeSpotifyClient(); // This will get a new token
        if (refreshed) {
            console.log('[Spotify Service] Token refreshed successfully. Retrying search...');
            return searchSpotifyTrack(trackName); // Retry the search with the new token
        } else {
            console.error('[Spotify Service] Failed to refresh token. Cannot retry search.');
        }
    }
    return null;
  }
}

module.exports = {
  initializeSpotifyClient,
  searchSpotifyTrack,
  getSpotifyClient: () => clientInitialized ? spotifyApi : null
};

// New function to configure play-dl with Spotify credentials
async function configurePlayDlSpotify() {
  if (config.spotifyClientId && config.spotifyClientSecret) {
    try {
      await playdl.setToken({
        spotify: {
          client_id: config.spotifyClientId,
          client_secret: config.spotifyClientSecret,
          market: 'US' // Or your preferred market, e.g., 'ES' for Spain
        }
      });
      console.log('[PlayDL] Spotify token configured successfully for play-dl.');
      return true;
    } catch (e) {
      console.error('[PlayDL] Failed to set Spotify token for play-dl:', e.message || e);
      return false;
    }
  } else {
    console.warn('[PlayDL] Spotify Client ID or Client Secret not found in config.json. Play-dl Spotify features might be limited.');
    return false;
  }
}

// Keep a reference to the original initializeSpotifyClient
const originalInitializeSpotifyClient = initializeSpotifyClient;

// Redefine initializeSpotifyClient to also attempt play-dl configuration
initializeSpotifyClient = async () => {
  // Call the original function
  const success = await originalInitializeSpotifyClient(); 
  if (success) {
    // If the original initialization was successful, also configure play-dl
    // We don't want play-dl configuration failure to prevent the main Spotify client from working,
    // so we don't return its success status directly unless that's desired.
    await configurePlayDlSpotify(); 
  }
  return success; // Return the success status of the original Spotify client initialization
};


module.exports = {
  initializeSpotifyClient,
  searchSpotifyTrack,
  getSpotifyClient: () => clientInitialized ? spotifyApi : null,
  configurePlayDlSpotify // Exporting this separately in case it needs to be called independently
};
