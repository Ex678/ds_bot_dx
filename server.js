import express from 'express';
import session from 'express-session';
import authRouter from './server/auth.js';
import autoModRouter from './server/routes/automod.js'; // Import the new automod router

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from server/public
app.use(express.static('server/public'));

// Session Configuration
// Note: In a production environment, the secret should be a strong, unique string
// ideally stored in an environment variable.
app.use(session({
  secret: process.env.SESSION_SECRET || 'a_placeholder_secret_key_that_should_be_changed',
  resave: false, // Do not save session if unmodified
  saveUninitialized: false, // Do not create session until something stored
  cookie: {
    secure: process.env.NODE_ENV === 'production', // True if running in production (HTTPS)
    httpOnly: true, // Prevents client-side JS from reading the cookie
    maxAge: 1000 * 60 * 60 * 24 // Cookie expiry: 1 day (example)
  }
}));

// Authentication routes
// The authRouter already configures its own session middleware if needed,
// but it's generally good practice to have a global session middleware
// if other parts of the app will also use sessions.
// If auth.js's router.use(session(...)) is meant to be self-contained for auth routes,
// ensure it doesn't conflict or consider removing it if this global one is sufficient.
// For now, we'll assume the global one is primary.
app.use('/auth', authRouter);

// Mount the automod router under /api
app.use('/api', autoModRouter);

// Simple protected route to get user's Discord information
app.get('/api/me', (req, res) => {
  if (req.session && req.session.discordUser) {
    res.json(req.session.discordUser);
  } else {
    res.status(401).json({ error: 'Not authenticated. Please login via /auth/discord' });
  }
});

// Basic home route (optional)
app.get('/', (req, res) => {
  let responseText = 'Welcome to the application.';
  if (req.session && req.session.discordUser) {
    responseText += ` Logged in as ${req.session.discordUser.username}. <a href="/auth/logout">Logout</a>`;
  } else {
    responseText += ' <a href="/auth/discord">Login with Discord</a>';
  }
  res.send(responseText);
});

// The server will be started from index.js, so app.listen is removed from here.
// console.log messages for PORT, SESSION_SECRET, and DISCORD_CLIENT_ID/SECRET
// will be handled by the main logger in index.js or are implicitly covered
// by application functionality checks.

export default app;
