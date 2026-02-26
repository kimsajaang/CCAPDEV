// server.js — Express server for Backlog Hero Phase 2
// Serves static HTML files and implements backend with MongoDB

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const fetch = require('node-fetch');
const connectDB = require('./model/db');
const User = require('./model/User');
const Game = require('./model/Game');
const LibraryEntry = require('./model/LibraryEntry');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Session Configuration ---
app.use(session({
  secret: 'backlog-hero-secret-key-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));

// --- Middleware ---
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public')); // serve HTML, CSS, images from public folder

// --- Auth Middleware ---
const isLoggedIn = (req, res, next) => {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }
};

// --- Database Connection ---
let dbConnected = false;
connectDB().then(() => {
  dbConnected = true;
});

// --- Twitch OAuth token management ---
let accessToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  console.log('[IGDB] Fetching new Twitch access token...');
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID,
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      grant_type: 'client_credentials'
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twitch auth failed: ${err}`);
  }

  const data = await res.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
  console.log('[IGDB] Got access token, expires in', Math.round(data.expires_in / 3600), 'hours');
  return accessToken;
}

// ======================== API ROUTES ========================

// ─── USER ROUTES ───

// POST /api/users/register - Register new user
app.post('/api/users/register', async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const newUser = new User({
      username,
      email,
      password,
      displayName: displayName || username,
    });

    await newUser.save();
    
    // Set session
    req.session.userId = newUser._id;
    req.session.username = newUser.username;
    
    res.status(201).json({
      message: 'User registered successfully',
      userId: newUser._id,
      username: newUser.username,
      email: newUser.email,
      displayName: newUser.displayName,
    });
  } catch (err) {
    console.error('[REGISTER] Error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/users/login - User login
app.post('/api/users/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await User.findOne({ $or: [{ username }, { email: username }] });
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const isValid = await user.comparePassword(password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Set session
    req.session.userId = user._id;
    req.session.username = user.username;

    res.json({
      message: 'Login successful',
      userId: user._id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
    });
  } catch (err) {
    console.error('[LOGIN] Error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/current - Get current logged-in user
app.get('/api/auth/current', isLoggedIn, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      bio: user.bio,
      avatar: user.avatar,
      favoriteGames: user.favoriteGames,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error('[GET CURRENT USER] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch current user' });
  }
});

// POST /api/auth/logout - User logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

// GET /api/auth/stats - Get user library stats
app.get('/api/auth/stats', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.userId;
    const entries = await LibraryEntry.find({ userId });
    
    const stats = {
      total: entries.length,
      completed: entries.filter(e => e.status === 'completed').length,
      playing: entries.filter(e => e.status === 'playing').length,
      backlog: entries.filter(e => e.status === 'backlog').length,
      totalHours: entries.reduce((sum, e) => sum + (e.playtime || 0), 0),
      avgRating: entries.length > 0 
        ? (entries.reduce((sum, e) => sum + (e.rating || 0), 0) / entries.length).toFixed(1)
        : 0,
    };

    res.json(stats);
  } catch (err) {
    console.error('[GET STATS] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/users/:userId - Get user profile (protected)
app.get('/api/users/:userId', isLoggedIn, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      bio: user.bio,
      avatar: user.avatar,
      favoriteGames: user.favoriteGames,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error('[GET USER] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// PUT /api/users/:userId - Update user profile (protected)
app.put('/api/users/:userId', isLoggedIn, async (req, res) => {
  try {
    // Only allow users to edit their own profile
    if (req.session.userId !== req.params.userId && req.session.userId.toString() !== req.params.userId) {
      return res.status(403).json({ error: 'Forbidden. You can only edit your own profile.' });
    }

    const { displayName, bio, avatar, favoriteGames } = req.body;
    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (displayName) user.displayName = displayName;
    if (bio !== undefined) user.bio = bio;
    if (avatar) user.avatar = avatar;
    if (favoriteGames) user.favoriteGames = favoriteGames;

    await user.save();
    res.json({ message: 'Profile updated', user });
  } catch (err) {
    console.error('[UPDATE USER] Error:', err.message);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ─── GAME ROUTES ───

// GET /api/games - Get all games
app.get('/api/games', async (req, res) => {
  try {
    const games = await Game.find().limit(50);
    res.json(games);
  } catch (err) {
    console.error('[GET GAMES] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

// GET /api/games/db/:gameId - Get single game from DB
app.get('/api/games/db/:gameId', async (req, res) => {
  try {
    const game = await Game.findById(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    res.json(game);
  } catch (err) {
    console.error('[GET GAME] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch game' });
  }
});

// POST /api/games - Create a new game
app.post('/api/games', async (req, res) => {
  try {
    const { name, coverUrl, rating, genres, platforms, releaseDate, summary } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Game name is required' });
    }

    const newGame = new Game({
      name,
      coverUrl,
      rating,
      genres,
      platforms,
      releaseDate,
      summary,
    });

    await newGame.save();
    res.status(201).json({ message: 'Game created', game: newGame });
  } catch (err) {
    console.error('[CREATE GAME] Error:', err.message);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

// ─── LIBRARY ROUTES ───

// GET /api/library/:userId - Get user's library
app.get('/api/library/:userId', async (req, res) => {
  try {
    const entries = await LibraryEntry.find({ userId: req.params.userId })
      .populate('gameId')
      .sort({ addedAt: -1 });

    res.json(entries);
  } catch (err) {
    console.error('[GET LIBRARY] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch library' });
  }
});

// GET /api/library/:userId/status/:status - Get library by status
app.get('/api/library/:userId/status/:status', async (req, res) => {
  try {
    const { userId, status } = req.params;
    if (!['backlog', 'playing', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const entries = await LibraryEntry.find({ userId, status })
      .populate('gameId')
      .sort({ addedAt: -1 });

    res.json(entries);
  } catch (err) {
    console.error('[GET LIBRARY BY STATUS] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch library' });
  }
});

// POST /api/library - Add game to library
app.post('/api/library', async (req, res) => {
  try {
    const { userId, gameId, status } = req.body;

    if (!userId || !gameId || !status) {
      return res.status(400).json({ error: 'userId, gameId, and status are required' });
    }

    // Check if game already in library
    const exists = await LibraryEntry.findOne({ userId, gameId });
    if (exists) {
      return res.status(409).json({ error: 'Game already in library' });
    }

    const entry = new LibraryEntry({ userId, gameId, status });
    await entry.save();
    await entry.populate('gameId');

    res.status(201).json({ message: 'Game added to library', entry });
  } catch (err) {
    console.error('[ADD TO LIBRARY] Error:', err.message);
    res.status(500).json({ error: 'Failed to add game to library' });
  }
});

// PUT /api/library/:entryId - Update library entry
app.put('/api/library/:entryId', async (req, res) => {
  try {
    const { status, rating, playtime, notes } = req.body;
    const entry = await LibraryEntry.findById(req.params.entryId);

    if (!entry) {
      return res.status(404).json({ error: 'Library entry not found' });
    }

    if (status) entry.status = status;
    if (rating !== undefined) entry.rating = rating;
    if (playtime !== undefined) entry.playtime = playtime;
    if (notes !== undefined) entry.notes = notes;

    await entry.save();
    await entry.populate('gameId');

    res.json({ message: 'Library entry updated', entry });
  } catch (err) {
    console.error('[UPDATE LIBRARY] Error:', err.message);
    res.status(500).json({ error: 'Failed to update library entry' });
  }
});

// DELETE /api/library/:entryId - Remove game from library
app.delete('/api/library/:entryId', async (req, res) => {
  try {
    const entry = await LibraryEntry.findByIdAndDelete(req.params.entryId);

    if (!entry) {
      return res.status(404).json({ error: 'Library entry not found' });
    }

    res.json({ message: 'Game removed from library' });
  } catch (err) {
    console.error('[DELETE FROM LIBRARY] Error:', err.message);
    res.status(500).json({ error: 'Failed to remove game from library' });
  }
});

// ─── IGDB API ROUTES (EXISTING) ───

// POST /api/games/search - Search games by name (IGDB)
app.post('/api/games/search', async (req, res) => {
  try {
    const { query, limit = 20 } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    const token = await getAccessToken();
    const igdbRes = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/plain'
      },
      body: `search "${query}"; fields name,cover.url,rating,genres.name,first_release_date,summary,platforms.name; where cover != null; limit ${limit};`
    });

    const data = await igdbRes.json();
    res.json(data);
  } catch (err) {
    console.error('[IGDB SEARCH] Error:', err.message);
    res.status(500).json({ error: 'Failed to search games' });
  }
});

// GET /api/games/popular - Get popular/trending games (IGDB)
app.get('/api/games/popular', async (req, res) => {
  try {
    const token = await getAccessToken();
    const igdbRes = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/plain'
      },
      body: `fields name,cover.url,rating,genres.name,first_release_date,summary; where rating > 80 & cover != null; sort rating desc; limit 20;`
    });

    const data = await igdbRes.json();
    res.json(data);
  } catch (err) {
    console.error('[IGDB POPULAR] Error:', err.message);
    res.status(500).json({ error: 'Failed to get popular games' });
  }
});

// GET /api/games/igdb/:id - Get single game details by IGDB ID
app.get('/api/games/igdb/:id', async (req, res) => {
  try {
    const token = await getAccessToken();
    const igdbRes = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/plain'
      },
      body: `fields name,cover.url,rating,genres.name,first_release_date,summary,screenshots.url,platforms.name,involved_companies.company.name; where id = ${req.params.id};`
    });

    const data = await igdbRes.json();
    res.json(data[0] || {});
  } catch (err) {
    console.error('[IGDB GAME DETAIL] Error:', err.message);
    res.status(500).json({ error: 'Failed to get game details' });
  }
});

// --- Start Server ---
const PORT_NUM = process.env.PORT || 3001;
app.listen(PORT_NUM, () => {
  console.log(`\n  🛡️  Backlog Hero server running at http://localhost:${PORT_NUM}`);
  console.log(`  📂 Open that URL in your browser to use the site.\n`);
  console.log(`  Database: ${dbConnected ? '✓ Connected' : '✗ Not connected'}`);

  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
    console.log('  ⚠️  IGDB search requires TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env\n');
  }
});
