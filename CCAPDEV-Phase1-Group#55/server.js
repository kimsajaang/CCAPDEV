// server.js — Express server for Backlog Hero Phase 2
// Uses Handlebars template engine for views and implements backend with MongoDB

require('dotenv').config();
const express = require('express');
const { engine } = require('express-handlebars');
const bodyParser = require('body-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo').default;
const compression = require('compression');
const fetch = require('node-fetch');
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const connectDB = require('./model/db');
const User = require('./model/User');
const Game = require('./model/Game');
const LibraryEntry = require('./model/LibraryEntry');
const Post = require('./model/Post');
const Feedback = require('./model/Feedback');
const Message = require('./model/Message');
const GroupChat = require('./model/GroupChat');
const axios = require('axios'); // Ensure axios is installed: npm install axios

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/backlog-hero';
app.use(express.json({ limit: '150mb' })); // Allow large base64 image and video payloads
// --- Handlebars Template Engine ---
app.engine('hbs', engine({
  extname: '.hbs',
  defaultLayout: 'main',
  helpers: {
    eq: (a, b) => a === b
  }
}));
app.set('view engine', 'hbs');
app.set('views', __dirname + '/views');
app.set('view cache', true); // Compile templates once instead of on every request

// --- Session Configuration (MongoDB-backed for persistence across restarts) ---
app.use(session({
  secret: 'backlog-hero-secret-key-change-in-prod',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: MONGO_URI,
    collectionName: 'sessions',
    ttl: 7 * 24 * 60 * 60, // 7 days in seconds
  }),
  cookie: { secure: false, httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));

// --- Middleware ---
app.use(compression()); // Gzip compression to vastly reduce HTML payload sizes
app.use(bodyParser.json({ limit: '150mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '150mb' }));

// --- Auth Middleware ---
const isLoggedIn = (req, res, next) => {
  if (req.session && req.session.userId) {
    next();
  } else {
    // If it's a browser request for a view, redirect to login
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
      return res.redirect('/login');
    }
    res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }
};

// --- View Routes (Handlebars) ---
// These are defined BEFORE express.static so the template engine handles  routes
// instead of serving raw files from public/
// Cache intro stats to avoid DB hits on every page load
let introStatsCache = null;
let introStatsCacheTime = 0;
const INTRO_STATS_TTL = 60 * 1000; // 1 minute

app.get('/', async (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/dashboard');

  try {
    const now = Date.now();
    if (!introStatsCache || (now - introStatsCacheTime) > INTRO_STATS_TTL) {
      const [totalUsers, totalReviews, platforms, totalIGDBGames] = await Promise.all([
        User.countDocuments(),
        Post.countDocuments(),
        Game.distinct('platforms'),
        getIgdbGameCount()
      ]);
      introStatsCache = {
        totalUsers,
        totalGames: (totalIGDBGames / 1000).toFixed(1),
        totalReviews,
        totalPlatforms: platforms.length || 15
      };
      introStatsCacheTime = now;
    }

    res.render('intro', {
      title: 'Welcome',
      user: req.user,
      stats: introStatsCache
    });
  } catch (err) {
    console.error('[INTRO STATS] Error:', err.message);
    res.render('intro', { title: 'Welcome', user: req.user, stats: { totalUsers: 0, totalGames: '357.1', totalReviews: 0, totalPlatforms: 15 } });
  }
});

app.get('/index', (req, res) => res.redirect('/'));
app.get('/intro', (req, res) => res.redirect('/'));
app.get('/login', (req, res) => res.render('login', { title: 'Login', user: req.user }));
app.get('/register', (req, res) => res.render('register', { title: 'Register', user: req.user }));
app.get('/Dashboard', isLoggedIn, (req, res) => {
  console.log('[DASHBOARD ROUTE] Rendering dashboard template');
  res.render('dashboard', { title: 'Dashboard', bodyClass: 'loading', user: req.user }, (err, html) => {
    if (err) {
      console.error('[DASHBOARD RENDER ERROR]', err.message);
      return res.render('login', { title: 'Login', user: req.user });
    }
    console.log('[DASHBOARD RENDER SUCCESS] Sending ' + html.length + ' bytes');
    res.send(html);
  });
});
app.get('/dashboard', (req, res) => res.redirect('/Dashboard'));
app.get('/library', (req, res) => res.render('library', { title: 'My Library', user: req.user }));
app.get('/profile', (req, res) => res.render('profile', { title: 'Profile', user: req.user }));
app.get('/profile-edit', (req, res) => res.render('profile-edit', { title: 'Edit Profile', user: req.user }));
app.get('/search', (req, res) => res.render('search', { title: 'Search Games', user: req.user }));
app.get('/stats', (req, res) => res.render('stats', { title: 'Community', user: req.user }));
app.get('/friends', (req, res) => res.render('friends', { title: 'Find Friends', user: req.user }));
app.get('/about', (req, res) => res.render('about', { title: 'About', user: req.user }));
app.get('/feedback', isLoggedIn, (req, res) => res.render('feedback', { title: 'Feedback', user: req.user }));
app.get('/feedback-list', isLoggedIn, (req, res) => res.render('feedback-list', { title: 'Feedback Management', user: req.user }));
app.get('/users-list', isLoggedIn, (req, res) => res.render('users-list', { title: 'Community Directory', user: req.user }));

// /profile-view?username=xxx  OR  /profile-view?user=<id>  →  redirects to /profile?user=<id>
app.get('/profile-view', async (req, res) => {
  try {
    const { username, user: userId } = req.query;
    let found = null;
    if (userId) {
      found = await User.findById(userId).select('_id').lean();
    } else if (username) {
      found = await User.findOne({ username }).select('_id').lean();
    }
    if (found) return res.redirect(`/profile?user=${found._id}`);
    res.redirect('/friends');
  } catch (e) {
    res.redirect('/friends');
  }
});

// Static files (CSS, images, client-side assets) — after view routes
app.use(express.static(__dirname + '/public'));

// --- Passport Configuration ---
passport.serializeUser((user, done) => done(null, user._id.toString()));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

const STEAM_API_KEY = process.env.STEAM_API_KEY || 'F89327857A7FC98A53F87A6099FC1D2D';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: `http://localhost:${PORT}/auth/google/callback`,
    passReqToCallback: true  // Allow access to req object
  },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        // Try to find by Google ID first
        let user = await User.findOne({ googleId: profile.id });
        if (user) {
          console.log('[GOOGLE AUTH] Existing user found:', user.displayName, '| Google ID:', profile.id);
          return done(null, user);
        }
        
        // Try to find by email (to link accounts)
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        if (email) {
          user = await User.findOne({ email });
          if (user) {
            // Link Google ID to existing account
            user.googleId = profile.id;
            await user.save();
            console.log('[GOOGLE AUTH] Linked Google profile to existing email:', email);
            return done(null, user);
          }
        }
        
        // Check if this is a login flow (strict) or signup flow (permissive)
        const flow = req.session?.googleFlow || 'signup';
        
        if (flow === 'login') {
          // Login flow: account must exist, show error if not found
          console.log('[GOOGLE AUTH] Login flow - account not found for email:', email);
          return done(null, false, { message: 'Account not found' });
        }
        
        // Signup flow: Auto-create new account for Google sign-up
        console.log('[GOOGLE AUTH] Creating new user for Google ID:', profile.id);
        user = new User({
          username: 'google_' + profile.id,
          email: email || profile.id + '@google.local',
          password: require('crypto').randomBytes(32).toString('hex'),
          displayName: profile.displayName || 'Google User',
          avatar: profile.photos && profile.photos[0] ? profile.photos[0].value : undefined,
          googleId: profile.id,
        });
        await user.save();
        console.log('[GOOGLE AUTH] Created new user:', user.displayName, '| Google ID:', profile.id);
        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  ));
}

passport.use(new SteamStrategy({
  returnURL: `http://localhost:${PORT}/auth/steam/callback`,
  realm: `http://localhost:${PORT}/`,
  apiKey: STEAM_API_KEY
},
  async (identifier, profile, done) => {
    try {
      const steamId = profile.id;
      // Try to find user by Steam ID
      let user = await User.findOne({ steamId });
      if (user) {
        console.log('[STEAM AUTH] Existing user found:', user.displayName, '| Steam ID:', steamId);
        return done(null, user);
      }
      
      // Auto-create new account for Steam users
      console.log('[STEAM AUTH] Creating new user for Steam ID:', steamId);
      user = new User({
        username: 'steam_' + steamId,
        email: steamId + '@steam.local',
        password: require('crypto').randomBytes(32).toString('hex'),
        displayName: profile.displayName || 'Steam User',
        avatar: profile.photos && profile.photos[2] ? profile.photos[2].value
          : profile.photos && profile.photos[0] ? profile.photos[0].value
            : undefined,
        steamId: steamId,
      });
      await user.save();
      console.log('[STEAM AUTH] Created new user:', user.displayName, '| Steam ID:', steamId);
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

app.use(passport.initialize());
app.use(passport.session());


// --- Database Connection ---
let dbConnected = false;

const initializeServer = async () => {
  try {
    await connectDB();
    dbConnected = true;
    console.log('MongoDB connected successfully');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
  }

  // --- Start Server ---
  app.listen(PORT, () => {
    console.log(`\n  🛡️  Backlog Hero server running at http://localhost:${PORT}`);
    console.log(`  📂 Open that URL in your browser to use the site.\n`);
    console.log(`  Database: ${dbConnected ? 'Connected' : 'Not connected'}`);

    if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
      console.log('  ⚠️  IGDB search requires TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env\n');
    }
  });
};

initializeServer();

// Warm up IGDB game count in background after startup
setTimeout(() => getIgdbGameCount(), 2000);

// Per-user Steam sync cooldown: only sync once every 5 minutes max
const steamSyncCooldown = new Map();
const STEAM_SYNC_INTERVAL_MS = 5 * 60 * 1000;

// --- Twitch OAuth token management ---
let accessToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  try {
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
      console.error(`[IGDB] Twitch auth failed: ${err}`);
      return null;
    }

    const data = await res.json();
    accessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
    console.log('[IGDB] Got access token, expires in', Math.round(data.expires_in / 3600), 'hours');
    return accessToken;
  } catch (err) {
    console.error('[IGDB] Network error fetching access token:', err.message);
    return null;
  }
}

// Global cache for IGDB stats
let igdbGameCount = 285000; // Fallback
let lastCountFetch = 0;
const COUNT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function getIgdbGameCount() {
  if (Date.now() - lastCountFetch < COUNT_CACHE_TTL && lastCountFetch !== 0) return igdbGameCount;
  try {
    const token = await getAccessToken();
    if (!token) return igdbGameCount;
    const res = await fetch('https://api.igdb.com/v4/games/count', {
      method: 'POST',
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`
      }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.count) {
        igdbGameCount = data.count;
        lastCountFetch = Date.now();
        console.log('[IGDB] Updated total game count:', igdbGameCount);
      }
    }
  } catch (err) {
    console.warn('[IGDB COUNT] Failed to fetch:', err.message);
  }
  return igdbGameCount;
}

// Helper to get IGDB Access Token (Twitch OAuth)
// You need these in your .env file!
// (Redundant getIGDBToken removed, using getAccessToken instead)

// (Redundant routes removed, merged below in API ROUTES section)

// ======================== API ROUTES ========================

// GET /api/steam/friends - Fetch Steam friends and their statuses
app.get('/api/steam/friends', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.user.steamId) return res.status(400).json({ error: 'Steam not linked' });
  try {
    const friendUrl = `https://api.steampowered.com/ISteamUser/GetFriendList/v0001/?key=${STEAM_API_KEY}&steamid=${req.user.steamId}&relationship=friend`;
    const friendRes = await fetch(friendUrl);
    if (!friendRes.ok) return res.status(404).json({ error: 'Could not fetch friends list' });
    const friendData = await friendRes.json();
    if (!friendData.friendslist || !friendData.friendslist.friends) return res.json([]);

    // Sort friends by friend_since and take up to 100
    const friendIds = friendData.friendslist.friends.map(f => f.steamid).slice(0, 100);
    if (friendIds.length === 0) return res.json([]);

    // Fetch summaries to get names, avatars, and currently playing games
    const summaryUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${friendIds.join(',')}`;
    const summaryRes = await fetch(summaryUrl);
    if (!summaryRes.ok) return res.status(500).json({ error: 'Could not fetch player summaries' });
    const summaryData = await summaryRes.json();

    if (!summaryData.response || !summaryData.response.players) return res.json([]);

    const players = summaryData.response.players.map(p => ({
      steamId: p.steamid,
      name: p.personaname,
      avatar: p.avatarfull || p.avatarmedium || p.avatar,
      gameName: p.gameextrainfo || null,
      isPlaying: !!p.gameextrainfo,
      isOnline: p.personastate > 0,
      profileUrl: p.profileurl
    }));

    // Sort: Playing -> Online -> Offline -> Alphabetical
    players.sort((a, b) => {
      if (a.isPlaying && !b.isPlaying) return -1;
      if (!a.isPlaying && b.isPlaying) return 1;
      if (a.isPlaying && b.isPlaying) return a.name.localeCompare(b.name);

      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;

      return a.name.localeCompare(b.name);
    });

    res.json(players);
  } catch (err) {
    console.error('[STEAM FRIENDS API]', err.message);
    res.status(500).json({ error: 'Server error fetching Steam friends' });
  }
});

// ─── USER ROUTES ───

// POST /api/users/register - Register new user
app.post('/api/users/register', async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    // Strict validation
    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'Username is required' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!password || !password.trim()) {
      return res.status(400).json({ error: 'Password is required' });
    }
    
    // Validate username length
    if (username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    
    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Check if user already exists (by username or email)
    const existingUser = await User.findOne({ $or: [{ username: username.trim() }, { email: email.trim().toLowerCase() }] });
    if (existingUser) {
      if (existingUser.username === username.trim()) {
        return res.status(409).json({ error: 'Username already exists. Please choose a different username.' });
      } else {
        return res.status(409).json({ error: 'Email already exists. Please log in or use a different email.' });
      }
    }

    const newUser = new User({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password,
      displayName: displayName || username.trim(),
    });

    await newUser.save();

    // Set session
    req.session.userId = newUser._id.toString();
    req.session.username = newUser.username;
    console.log('[REGISTER] Session set for user:', newUser.displayName, '| Session ID:', req.sessionID);

    // Save session before responding
    req.session.save((err) => {
      if (err) {
        console.error('[REGISTER] Session save failed:', err.message);
        return res.status(500).json({ error: 'Session save failed' });
      }

      res.status(201).json({
        message: 'User registered successfully',
        userId: newUser._id,
        username: newUser.username,
        email: newUser.email,
        displayName: newUser.displayName,
      });
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

    // Strict validation
    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'Username or email is required' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    // Try to find user by username or email
    const user = await User.findOne({ 
      $or: [
        { username: username.trim() },
        { email: username.trim().toLowerCase() }
      ] 
    });
    
    // User not found - recommend registration
    if (!user) {
      console.log('[LOGIN] User not found with username/email:', username);
      return res.status(401).json({ error: 'Account not found. Please create a new account or check your username/email.' });
    }

    // Validate password
    const isValid = await user.comparePassword(password);
    if (!isValid) {
      console.log('[LOGIN] Invalid password for user:', user.username);
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    // Set session
    req.session.userId = user._id.toString();
    req.session.username = user.username;
    console.log('[LOGIN] Session set for user:', user.displayName, '| Session ID:', req.sessionID);

    // Save session before responding
    req.session.save((err) => {
      if (err) {
        console.error('[LOGIN] Session save failed:', err.message);
        return res.status(500).json({ error: 'Session save failed' });
      }

      res.json({
        message: 'Login successful',
        userId: user._id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
      });
    });
  } catch (err) {
    console.error('[LOGIN] Error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/current - Get current logged-in user
app.get('/api/auth/current', isLoggedIn, async (req, res) => {
  try {
    console.log('[GET CURRENT USER] Session userId:', req.session.userId);
    const user = await User.findById(req.session.userId);
    if (!user) {
      console.error('[GET CURRENT USER] User not found in DB');
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('[GET CURRENT USER] Retrieved user:', user.displayName);
    const pendingRequests = (user.friendRequests || []).filter(r => r.status === 'pending').length;
    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      bio: user.bio,
      avatar: user.avatar,
      favoriteGames: user.favoriteGames,
      steamId: user.steamId || '',
      xboxGamertag: user.xboxGamertag || '',
      psnId: user.psnId || '',
      wallpaper: user.wallpaper || '',
      wallpaperPosition: user.wallpaperPosition != null ? user.wallpaperPosition : 50,
      friendsCount: (user.friends || []).length,
      pendingRequests,
      settings: user.settings,
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

// GET /api/auth/steam-status - Get user's currently playing Steam game
app.get('/api/auth/steam-status', isLoggedIn, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user || !user.steamId) {
      return res.json({ playing: false, message: 'No Steam account linked' });
    }

    const steamUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${encodeURIComponent(user.steamId)}`;
    const response = await fetch(steamUrl);
    const data = await response.json();

    if (data && data.response && data.response.players && data.response.players.length > 0) {
      const player = data.response.players[0];

      if (player.gameextrainfo) {
        // User is currently playing a game on Steam
        const coverUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${player.gameid}/library_600x900_2x.jpg`;
        return res.json({
          playing: true,
          gameName: player.gameextrainfo,
          gameId: player.gameid,
          coverUrl: coverUrl
        });
      }
    }

    // Fallback: Check user's Backlog Hero library for any game actively marked as "playing"
    const LibraryEntry = require('./model/LibraryEntry');
    const activeGame = await LibraryEntry.findOne({ userId: user._id, status: 'playing' })
      .sort({ updatedAt: -1 })
      .populate('gameId');

    if (activeGame && activeGame.gameId) {
      return res.json({
        playing: true,
        gameName: activeGame.gameId.name,
        gameId: activeGame.gameId._id,
        coverUrl: activeGame.gameId.coverUrl || '',
        isFallback: true
      });
    }

    // Not currently playing anything (Steam or Local)
    res.json({ playing: false });
  } catch (err) {
    console.error('[STEAM STATUS] Error checking live status:', err.message);
    res.status(500).json({ error: 'Failed to check Steam status' });
  }
});

// GET /api/users/:userId/steam-status - Get any user's currently playing game (Steam or Backlog)
app.get('/api/users/:userId/steam-status', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.json({ playing: false, message: 'User not found' });
    }

    // If user has Steam linked, check Steam first (live status)
    if (user.steamId) {
      try {
        const steamUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${encodeURIComponent(user.steamId)}`;
        const response = await fetch(steamUrl);
        const data = await response.json();

        if (data && data.response && data.response.players && data.response.players.length > 0) {
          const player = data.response.players[0];

          if (player.gameextrainfo) {
            // User is currently playing a game on Steam
            const coverUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${player.gameid}/library_600x900_2x.jpg`;
            return res.json({
              playing: true,
              gameName: player.gameextrainfo,
              gameId: player.gameid,
              coverUrl: coverUrl,
              source: 'steam'
            });
          }
        }
      } catch (err) {
        // Silently fail Steam check, fall through to Backlog check
      }
    }

    // Fallback: Check user's Backlog Hero library for any game actively marked as "playing"
    const LibraryEntry = require('./model/LibraryEntry');
    const activeGame = await LibraryEntry.findOne({ userId: user._id, status: 'playing' })
      .sort({ updatedAt: -1 })
      .populate('gameId');

    if (activeGame && activeGame.gameId) {
      return res.json({
        playing: true,
        gameName: activeGame.gameId.name,
        gameId: activeGame.gameId._id,
        coverUrl: activeGame.gameId.coverUrl || '',
        source: 'backlog'
      });
    }

    // Not currently playing anything
    res.json({ playing: false });
  } catch (err) {
    console.error('[USER STEAM STATUS] Error:', err.message);
    res.json({ playing: false });
  }
});



// ─── STEAM AUTH ROUTES ───

// Helper: try to get an IGDB cover URL for a game by name
async function getIgdbCover(gameName) {
  try {
    if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) return null;
    const token = await getAccessToken();
    const escaped = gameName.replace(/"/g, '\\"');
    const igdbRes = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/plain'
      },
      body: `search "${escaped}"; fields name,cover.url; where cover != null; limit 1;`
    });
    const data = await igdbRes.json();
    if (data && data[0] && data[0].cover && data[0].cover.url) {
      return 'https:' + data[0].cover.url.replace('t_thumb', 't_cover_big');
    }
  } catch (err) {
    console.warn('[IGDB COVER] Failed for', gameName, err.message);
  }
  return null;
}

// Helper: import a user's Steam games into their Backlog Hero library
async function importSteamGames(user) {
  try {
    const steamUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${encodeURIComponent(user.steamId)}&format=json&include_appinfo=1&include_played_free_games=1`;
    const steamRes = await fetch(steamUrl);
    const steamData = await steamRes.json();

    if (!steamData.response || !steamData.response.games) {
      console.log('[STEAM IMPORT] No games found (profile may be private). Steam ID:', user.steamId);
      return { imported: 0, updated: 0 };
    }

    const steamGames = steamData.response.games;
    let imported = 0, updated = 0;

    for (const sg of steamGames) {
      if (!sg.name) continue;

      // Find or create the Game document
      let game = await Game.findOne({ name: { $regex: new RegExp('^' + sg.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') } });
      const steamCover = `https://cdn.cloudflare.steamstatic.com/steam/apps/${sg.appid}/library_600x900_2x.jpg`;
      if (!game) {
        // Try IGDB first, fall back to Steam CDN
        const igdbCover = await getIgdbCover(sg.name);
        game = new Game({
          name: sg.name,
          coverUrl: igdbCover || steamCover,
          platforms: ['PC'],
        });
        await game.save();
      } else if (game.coverUrl && (game.coverUrl.includes('via.placeholder.com') || game.coverUrl.includes('/header.jpg'))) {
        // Upgrade placeholder or old header URLs
        const igdbCover = await getIgdbCover(sg.name);
        game.coverUrl = igdbCover || steamCover;
        await game.save();
      }

      // Check if already in library (including hidden/removed entries)
      const existing = await LibraryEntry.findOne({ userId: user._id, gameId: game._id });
      const steamHours = Math.round((sg.playtime_forever / 60) * 10) / 10;

      if (!existing) {
        // Determine status based on playtime
        let status = 'backlog';
        if (steamHours > 0) status = 'playing';

        const entry = new LibraryEntry({
          userId: user._id,
          gameId: game._id,
          status,
          playtime: steamHours,
        });
        await entry.save();
        imported++;
      } else if (existing.hidden) {
        // User previously removed this game — don't re-import, just update playtime silently
        if (steamHours > (existing.playtime || 0)) {
          existing.playtime = steamHours;
          await existing.save();
        }
      } else if (steamHours > (existing.playtime || 0)) {
        // Update playtime if Steam has more
        existing.playtime = steamHours;
        await existing.save();
        updated++;
      }
    }

    console.log(`[STEAM IMPORT] ${user.displayName}: imported ${imported} new games, updated ${updated} playtimes (${steamGames.length} total Steam games)`);
    return { imported, updated, total: steamGames.length, hadActivity: imported > 0 || updated > 0 };
  } catch (err) {
    console.error(`[STEAM IMPORT] Fatal error for ${user.displayName}:`, err.message);
    return { imported: 0, updated: 0, total: 0, hadActivity: false, error: err.message };
  }
}

// Helper: auto-sync Steam friends that have Backlog Hero accounts
async function syncSteamFriends(user) {
  if (!user || !user.steamId) return 0;

  try {
    const steamUrl = `https://api.steampowered.com/ISteamUser/GetFriendList/v0001/?key=${STEAM_API_KEY}&steamid=${user.steamId}&relationship=friend`;
    const steamRes = await fetch(steamUrl);

    // Steam API returns 401/403 or empty if profile is private
    if (!steamRes.ok) return 0;

    const steamData = await steamRes.json();
    if (!steamData.friendslist || !steamData.friendslist.friends) return 0;

    const steamFriendIds = steamData.friendslist.friends.map(f => f.steamid);
    if (steamFriendIds.length === 0) return 0;

    // Find all Backlog Hero users that match these steam IDs
    const matchingPlatformUsers = await User.find({ steamId: { $in: steamFriendIds } });
    if (matchingPlatformUsers.length === 0) return 0;

    let newFriendsAdded = 0;

    for (const friendUser of matchingPlatformUsers) {
      // Check if they are already friends
      const alreadyFriends = user.friends && user.friends.includes(friendUser._id);
      if (!alreadyFriends) {
        // Add to current user's friends list
        if (!user.friends) user.friends = [];
        user.friends.push(friendUser._id);

        // Add to the other user's friends list (two-way)
        if (!friendUser.friends) friendUser.friends = [];
        if (!friendUser.friends.includes(user._id)) {
          friendUser.friends.push(user._id);
          await friendUser.save();
        }

        newFriendsAdded++;
      }
    }

    if (newFriendsAdded > 0) {
      await user.save();
      console.log(`[STEAM FRIENDS] ${user.displayName}: Auto-synced ${newFriendsAdded} friends from Steam!`);
    }

    return newFriendsAdded;
  } catch (err) {
    console.error(`[STEAM FRIENDS] Sync failed for ${user.displayName}:`, err.message);
    return 0;
  }
}

// GET /auth/steam - Redirect to Steam login page
app.get('/auth/steam', passport.authenticate('steam', { failureRedirect: '/login' }));

// GET /auth/steam/callback - Steam redirects back here after login
app.get('/auth/steam/callback', (req, res, next) => {
  passport.authenticate('steam', (err, user, info) => {
    if (err) {
      console.error('[STEAM AUTH] Error:', err);
      return res.redirect('/login');
    }

    if (!user) {
      console.log('[STEAM AUTH] Authentication failed');
      return res.redirect('/login');
    }

    // User authenticated successfully - establish session
    req.logIn(user, (err) => {
      if (err) {
        console.error('[STEAM AUTH] Login error:', err);
        return res.redirect('/login');
      }

      // Set session userId so existing auth middleware works
      req.session.userId = user._id.toString();
      console.log('[STEAM AUTH] Login successful. User:', user.displayName);

      // Auto-import Steam games into library
      let hadActivity = false;
      try {
        importSteamGames(user).then(result => {
          hadActivity = result.hadActivity;
          console.log('[STEAM AUTH] Import result:', result);
        }).catch(err => {
          console.error('[STEAM AUTH] Import failed (non-blocking):', err.message);
        });
      } catch (err) {
        console.error('[STEAM AUTH] Import failed (non-blocking):', err.message);
      }

      // Auto-sync Steam friends
      try { 
        syncSteamFriends(user).catch(e => console.warn('[STEAM AUTH] Friends sync failed:', e.message));
      } catch (e) { 
        console.warn('[STEAM AUTH] Friends sync failed:', e.message); 
      }

      res.redirect('/Dashboard');
    });
  })(req, res, next);
});

// --- GOOGLE AUTH ROUTES ---

// GET /auth/google - Redirect to Google login page (STRICT - account must exist)
app.get('/auth/google', (req, res, next) => {
  req.session.googleFlow = 'login';
  req.session.save(() => {
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
  });
});

// GET /auth/google/register - Redirect to Google for signup (PERMISSIVE - auto-create account)
app.get('/auth/google/register', (req, res, next) => {
  req.session.googleFlow = 'signup';
  req.session.save(() => {
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
  });
});

// GET /auth/google/callback - Google redirects back here after login
app.get('/auth/google/callback', (req, res, next) => {
  passport.authenticate('google', (err, user, info) => {
    if (err) {
      console.error('[GOOGLE AUTH] Error:', err);
      return res.redirect('/auth/login-error?provider=google&reason=failed');
    }

    if (!user) {
      // Authentication failed - check why
      const reason = info?.message === 'Account not found' ? 'not_found' : 'failed';
      console.log('[GOOGLE AUTH] Authentication failed:', reason);
      return res.redirect(`/auth/login-error?provider=google&reason=${reason}`);
    }

    // User authenticated successfully
    req.logIn(user, (err) => {
      if (err) {
        console.error('[GOOGLE AUTH] Login error:', err);
        return res.redirect('/login');
      }

      // Set session userId
      req.session.userId = user._id.toString();
      console.log('[GOOGLE AUTH] Login successful. User:', user.displayName);
      res.redirect('/Dashboard');
    });
  })(req, res, next);
});

// GET /auth/login-error - Show authentication error on login page
app.get('/auth/login-error', (req, res) => {
  const provider = req.query.provider || 'unknown';
  const reason = req.query.reason || 'failed';
  
  let errorMessage = '';
  
  if (provider === 'google') {
    if (reason === 'not_found') {
      errorMessage = 'Account not registered. This Google account is not registered with Backlog Hero. Please create an account first.';
    } else {
      errorMessage = 'Google login failed. Please try again or use another login method.';
    }
  } else if (provider === 'steam') {
    if (reason === 'not_found') {
      errorMessage = 'Account not registered. This Steam account is not registered with Backlog Hero. Please create an account first.';
    } else {
      errorMessage = 'Steam login failed. Please try again or use another login method.';
    }
  }
  
  res.render('login', {
    title: 'Login',
    user: req.user,
    oauthError: errorMessage,
    provider: provider
  });
});

// GET /api/auth/stats - Get user library stats

// ─── XBOX INTEGRATION ───

// Helper: import games into a user's library from a list of {name, playtime}
async function importGamesFromList(userId, gamesList, source) {
  let imported = 0, updated = 0;
  for (const g of gamesList) {
    if (!g.name) continue;
    const escaped = g.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let game = await Game.findOne({ name: { $regex: new RegExp('^' + escaped + '$', 'i') } });
    if (!game) {
      const igdbCover = await getIgdbCover(g.name);
      game = new Game({ name: g.name, coverUrl: igdbCover || '', platforms: [source] });
      await game.save();
    }
    const existing = await LibraryEntry.findOne({ userId, gameId: game._id });
    const hours = g.playtime || 0;
    if (!existing) {
      const entry = new LibraryEntry({ userId, gameId: game._id, status: hours > 0 ? 'playing' : 'backlog', playtime: hours });
      await entry.save();
      imported++;
    } else if (!existing.hidden && hours > (existing.playtime || 0)) {
      existing.playtime = hours;
      await existing.save();
      updated++;
    }
  }
  return { imported, updated };
}

// POST /api/integrations/xbox/sync
app.post('/api/integrations/xbox/sync', isLoggedIn, async (req, res) => {
  try {
    const { gamertag } = req.body;
    if (!gamertag) return res.status(400).json({ error: 'Gamertag is required' });

    const XBL_API_KEY = process.env.XBL_API_KEY;
    if (!XBL_API_KEY) {
      // Simulate mode (no API key) — return a mock success response
      console.log('[XBOX SYNC] No XBL_API_KEY set — running in demo mode');
      return res.json({ imported: 0, updated: 0, total: 0, demo: true, message: 'No API key configured. Set XBL_API_KEY in your .env to enable live sync.' });
    }

    // Use OpenXBL (xbl.io) — free tier: 150 req/hour
    // Step 1: resolve gamertag → XUID
    const lookupRes = await fetch(`https://xbl.io/api/v2/search/${encodeURIComponent(gamertag)}`, {
      headers: { 'x-authorization': XBL_API_KEY, 'Accept': 'application/json' }
    });
    if (!lookupRes.ok) {
      const err = await lookupRes.json().catch(() => ({}));
      return res.status(400).json({ error: err.message || 'Gamertag not found or profile is private' });
    }
    const lookupData = await lookupRes.json();
    const xuid = lookupData?.people?.[0]?.xuid;
    if (!xuid) return res.status(404).json({ error: 'Gamertag not found' });

    // Step 2: fetch titles (game history)
    const titlesRes = await fetch(`https://xbl.io/api/v2/${xuid}/achievements`, {
      headers: { 'x-authorization': XBL_API_KEY, 'Accept': 'application/json' }
    });

    if (!titlesRes.ok) {
      return res.status(400).json({ error: 'Could not fetch games. The Xbox profile may be private.' });
    }
    const titlesData = await titlesRes.json();
    const titles = titlesData?.titles || [];

    const gamesList = titles.map(t => ({
      name: t.name,
      playtime: t.minutesPlayed ? Math.round(t.minutesPlayed / 60 * 10) / 10 : 0
    }));

    // Save gamertag to user profile
    await User.findByIdAndUpdate(req.session.userId, { xboxGamertag: gamertag });

    const result = await importGamesFromList(req.session.userId, gamesList, 'Xbox');
    console.log(`[XBOX SYNC] ${gamertag}: imported ${result.imported}, updated ${result.updated}`);
    res.json({ ...result, total: gamesList.length });
  } catch (err) {
    console.error('[XBOX SYNC] Error:', err.message);
    res.status(500).json({ error: 'Xbox sync failed: ' + err.message });
  }
});

// POST /api/integrations/psn/sync
app.post('/api/integrations/psn/sync', isLoggedIn, async (req, res) => {
  try {
    const { psnId } = req.body;
    if (!psnId) return res.status(400).json({ error: 'PSN ID is required' });

    // PSN has no public official API for 3rd parties.
    // We use the community psn-api wrapper via npsso token, OR fall back to demo mode.
    const NPSSO_TOKEN = process.env.PSN_NPSSO;
    if (!NPSSO_TOKEN) {
      console.log('[PSN SYNC] No PSN_NPSSO token set — running in demo mode');
      return res.json({ imported: 0, updated: 0, total: 0, demo: true, message: 'No PSN token configured. Set PSN_NPSSO in your .env to enable live sync.' });
    }

    // Get access token from npsso
    const authRes = await fetch('https://ca.account.sony.com/api/authz/v3/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': `npsso=${NPSSO_TOKEN}` },
      body: 'scope=psn%3Amobile.v2.core+psn%3Aclientapp&grant_type=sso_cookie&token_format=jwt'
    });

    if (!authRes.ok) return res.status(401).json({ error: 'PSN token expired or invalid. Please refresh your npsso.' });
    const { access_token } = await authRes.json();

    // Lookup the user's accountId by online ID
    const profileRes = await fetch(`https://us-prof.np.community.playstation.net/userProfile/v1/users/${encodeURIComponent(psnId)}/profile2?fields=accountId`, {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });
    if (!profileRes.ok) return res.status(404).json({ error: 'PSN ID not found or profile is private.' });
    const profileData = await profileRes.json();
    const accountId = profileData?.profile?.accountId;
    if (!accountId) return res.status(404).json({ error: 'Could not resolve PSN account ID.' });

    // Fetch titles
    const titlesRes = await fetch(`https://m.np.community.playstation.net/trophy/v1/users/${accountId}/titles?fields=@default&limit=200`, {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });

    if (!titlesRes.ok) return res.status(400).json({ error: 'Could not retrieve game titles. Profile may be private.' });
    const titlesData = await titlesRes.json();
    const titles = titlesData?.titles || [];

    const gamesList = titles.map(t => ({ name: t.trophyTitleName || t.npTitleId, playtime: 0 }));

    await User.findByIdAndUpdate(req.session.userId, { psnId });
    const result = await importGamesFromList(req.session.userId, gamesList, 'PlayStation');
    console.log(`[PSN SYNC] ${psnId}: imported ${result.imported}, updated ${result.updated}`);
    res.json({ ...result, total: gamesList.length });
  } catch (err) {
    console.error('[PSN SYNC] Error:', err.message);
    res.status(500).json({ error: 'PSN sync failed: ' + err.message });
  }
});


app.get('/api/auth/stats', isLoggedIn, async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = await User.findById(userId);

    // For Steam users: auto-sync playtime
    // Throttle to once every 5 minutes to prevent lag on every page load
    let hadGamingActivity = false;
    if (user && user.steamId) {
      const lastSync = steamSyncCooldown.get(userId);
      const shouldSync = !lastSync || (Date.now() - lastSync) > STEAM_SYNC_INTERVAL_MS;
      if (shouldSync) {
        steamSyncCooldown.set(userId, Date.now());
        try {
          const result = await importSteamGames(user);
          hadGamingActivity = result.hadActivity;
          // Also sync friends silently in background
          syncSteamFriends(user).catch(() => { });
        } catch (err) {
          console.warn('[STATS] Steam auto-sync failed (non-blocking):', err.message);
        }
      }
    }



    const [entries, postsCount] = await Promise.all([
      LibraryEntry.find({ userId, hidden: { $ne: true } }),
      Post.countDocuments({ author: userId })
    ]);

    const stats = {
      total: entries.length,
      completed: entries.filter(e => e.status === 'completed').length,
      playing: entries.filter(e => e.status === 'playing').length,
      backlog: entries.filter(e => e.status === 'backlog').length,
      postsCount,
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
      steamId: user.steamId || '',
      xboxGamertag: user.xboxGamertag || '',
      psnId: user.psnId || '',
      wallpaper: user.wallpaper || '',
      wallpaperPosition: user.wallpaperPosition != null ? user.wallpaperPosition : 50,
      friendsCount: (user.friends || []).length,
      settings: user.settings,
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

    const { displayName, username, bio, avatar, favoriteGames, steamId, xboxGamertag, psnId, wallpaper, wallpaperPosition, settings } = req.body;
    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (displayName) user.displayName = displayName;
    if (username) user.username = username;
    if (bio !== undefined) user.bio = bio;
    if (avatar) user.avatar = avatar;
    if (wallpaper !== undefined) user.wallpaper = wallpaper;
    if (wallpaperPosition !== undefined) user.wallpaperPosition = wallpaperPosition;
    if (favoriteGames) user.favoriteGames = favoriteGames;
    if (steamId !== undefined) user.steamId = steamId;
    if (xboxGamertag !== undefined) user.xboxGamertag = xboxGamertag;
    if (psnId !== undefined) user.psnId = psnId;
    if (settings) {
      if (!user.settings) user.settings = {};
      if (settings.privacy) user.settings.privacy = settings.privacy;
      if (settings.defaultSort) user.settings.defaultSort = settings.defaultSort;
      if (settings.emailNotifs) {
        if (!user.settings.emailNotifs) user.settings.emailNotifs = {};
        if (settings.emailNotifs.friendRequests !== undefined) user.settings.emailNotifs.friendRequests = settings.emailNotifs.friendRequests;
        if (settings.emailNotifs.chatMessages !== undefined) user.settings.emailNotifs.chatMessages = settings.emailNotifs.chatMessages;
        if (settings.emailNotifs.marketing !== undefined) user.settings.emailNotifs.marketing = settings.emailNotifs.marketing;
      }
    }

    await user.save();
    res.json({ message: 'Profile updated', user });
  } catch (err) {
    console.error('[UPDATE USER] Error:', err.message);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// PUT /api/users/:userId/security - Update password
app.put('/api/users/:userId/security', isLoggedIn, async (req, res) => {
  try {
    if (req.session.userId !== req.params.userId && req.session.userId.toString() !== req.params.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.params.userId);

    if (!user) return res.status(404).json({ error: 'User not found' });

    // For users created via auth providers, they might have random hashed passwords
    // Ensure we correctly validate the old one
    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect current password' });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    user.password = newPassword;
    await user.save(); // pre-save hook handles hashing
    
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('[UPDATE SECURITY] Error:', err.message);
    res.status(500).json({ error: 'Failed to update security settings' });
  }
});

// GET /api/users-list - Get all users for the list
app.get('/api/users-list', isLoggedIn, async (req, res) => {
  try {
    const users = await User.find({}, 'username displayName avatar bio createdAt').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    console.error('[GET USERS LIST] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/feedback - Submit feedback
app.post('/api/feedback', isLoggedIn, async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const feedback = new Feedback({
      userId: req.session.userId || null,
      name,
      email,
      subject,
      message
    });

    await feedback.save();
    res.status(201).json({ message: 'Feedback submitted successfully' });
  } catch (err) {
    console.error('[SUBMIT FEEDBACK] Error:', err.message);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// GET /api/feedback-list - Get all feedback
app.get('/api/feedback-list', isLoggedIn, async (req, res) => {
  try {
    const feedbacks = await Feedback.find().sort({ createdAt: -1 });
    res.json(feedbacks);
  } catch (err) {
    console.error('[GET FEEDBACK LIST] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

// DELETE /api/feedback/:id - Delete feedback (protected)
app.delete('/api/feedback/:id', isLoggedIn, async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) return res.status(404).json({ error: 'Feedback not found' });
    
    await Feedback.findByIdAndDelete(req.params.id);
    res.json({ message: 'Feedback deleted successfully' });
  } catch (err) {
    console.error('[DELETE FEEDBACK] Error:', err.message);
    res.status(500).json({ error: 'Failed to delete feedback' });
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

// POST /api/games/search - Search IGDB for games
app.post('/api/games/search', async (req, res) => {
  try {
    const { query, limit } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    const maxResults = limit || 10;
    const token = await getAccessToken();
    const escaped = query.replace(/"/g, '\\"');
    
    console.log(`[IGDB SEARCH] Querying: "${query}"`);
    const igdbRes = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/plain'
      },
      body: `search "${escaped}"; fields name,cover.url,rating,genres.name,first_release_date,summary; limit ${maxResults};`
    });

    const data = await igdbRes.json();
    console.log(`[IGDB SEARCH RESPONSE] ${data ? data.length : 0} results`);
    res.json(data);
  } catch (err) {
    console.error('[IGDB SEARCH] Error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

// POST /api/games - Find existing game by name or create a new one
app.post('/api/games', async (req, res) => {
  try {
    const { name, coverUrl, rating, genres, platforms, releaseDate, summary, igdbId } = req.body;

    console.log(`[CREATE GAME] Received: name="${name}", igdbId=${igdbId}`);

    if (!name) {
      return res.status(400).json({ error: 'Game name is required' });
    }

    // Check if a game with this IGDB ID already exists
    if (igdbId) {
      const existingGame = await Game.findOne({ igdbId });
      console.log(`[CREATE GAME] Checking for existing game with igdbId=${igdbId}:`, existingGame ? 'FOUND' : 'NOT FOUND');
      if (existingGame) {
        return res.status(200).json({ message: 'Game already exists', game: existingGame });
      }
    }

    // Check if a game with this name already exists (case-insensitive)
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let game = await Game.findOne({ name: { $regex: new RegExp('^' + escaped + '$', 'i') } });

    if (game) {
      // Update missing fields if the new request has better data
      let updated = false;
      if (coverUrl && (!game.coverUrl || game.coverUrl.includes('via.placeholder.com'))) {
        game.coverUrl = coverUrl;
        updated = true;
      }
      if (genres && genres.length && !game.genres.length) { game.genres = genres; updated = true; }
      if (releaseDate && !game.releaseDate) { game.releaseDate = releaseDate; updated = true; }
      if (summary && !game.summary) { game.summary = summary; updated = true; }
      if (igdbId && !game.igdbId) { 
        game.igdbId = igdbId; 
        updated = true;
        console.log(`[CREATE GAME] Updated existing game "${name}" with igdbId=${igdbId}`);
      }
      if (updated) await game.save();

      return res.status(200).json({ message: 'Game already exists', game });
    }

    game = new Game({ name, coverUrl, rating, genres, platforms, releaseDate, summary, igdbId });
    await game.save();
    console.log(`[CREATE GAME] Created new game "${name}" with igdbId=${igdbId}`);
    res.status(201).json({ message: 'Game created', game });
  } catch (err) {
    console.error('[CREATE GAME] Error:', err.message);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

// ─── LIBRARY ROUTES ───

// GET /api/library/:userId - Get user's library
app.get('/api/library/:userId', async (req, res) => {
  try {
    // Optimization: limit to 500, use lean() for massive speedup, and only project needed fields
    const entries = await LibraryEntry.find({ userId: req.params.userId, hidden: { $ne: true } })
      .populate('gameId', 'name coverUrl genres')
      .sort({ addedAt: -1 })
      .limit(500)
      .lean();

    // Deduplicate by game name (keep earliest entry, merge best data)
    const seen = new Map();
    const unique = [];
    for (const entry of entries) {
      if (!entry.gameId) continue;
      const key = entry.gameId.name.toLowerCase();
      if (seen.has(key)) {
        // Mark this duplicate hidden so it won't appear again
        entry.hidden = true;
        LibraryEntry.updateOne({ _id: entry._id }, { hidden: true }).catch(() => { });
        continue;
      }
      seen.set(key, true);
      unique.push(entry);
    }

    res.json(unique);
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

    const entries = await LibraryEntry.find({ userId, status, hidden: { $ne: true } })
      .populate('gameId', 'name coverUrl genres')
      .sort({ addedAt: -1 })
      .limit(200)
      .lean();

    res.json(entries);
  } catch (err) {
    console.error('[GET LIBRARY BY STATUS] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch library' });
  }
});

// GET /api/community/backlog-members - Get all users with backlog games
app.get('/api/community/backlog-members', async (req, res) => {
  try {
    // Find all unique users who have at least one backlog game
    const userIds = await LibraryEntry.distinct('userId', { status: 'backlog', hidden: { $ne: true } });
    
    if (!userIds.length) {
      return res.json([]);
    }

    // Fetch user profiles - get displayName, avatar, and count of backlog games
    const users = await Promise.all(userIds.map(async (uid) => {
      const user = await User.findById(uid).lean();
      const backlogCount = await LibraryEntry.countDocuments({ userId: uid, status: 'backlog', hidden: { $ne: true } });
      
      if (!user) return null;
      
      return {
        _id: user._id,
        id: user._id,
        displayName: user.displayName || 'Anonymous',
        avatar: user.avatar,
        backlogCount,
        gamerTag: user.gamerTag
      };
    }));

    // Filter out nulls and sort by most recently active (or by backlog count descending)
    const filtered = users.filter(u => u !== null)
      .sort((a, b) => b.backlogCount - a.backlogCount)
      .slice(0, 10);  // Top 10 users

    res.json(filtered);
  } catch (err) {
    console.error('[GET BACKLOG MEMBERS] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch backlog members' });
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

    // Track if rating is being changed to invalidate community scores cache
    const ratingChanged = rating !== undefined && entry.rating !== rating;

    if (status) entry.status = status;
    if (rating !== undefined) entry.rating = rating;
    if (playtime !== undefined) entry.playtime = playtime;
    if (notes !== undefined) entry.notes = notes;

    await entry.save();
    await entry.populate('gameId');

    // Clear community scores cache if rating was changed
    if (ratingChanged) {
      _communityScoresCache = null;
      _communityScoresCacheTime = 0;
      console.log('[UPDATE LIBRARY] Rating changed - cleared community scores cache');
    }

    res.json({ message: 'Library entry updated', entry });
  } catch (err) {
    console.error('[UPDATE LIBRARY] Error:', err.message);
    res.status(500).json({ error: 'Failed to update library entry' });
  }
});

// DELETE /api/library/:entryId - Remove game from library
app.delete('/api/library/:entryId', async (req, res) => {
  try {
    const entry = await LibraryEntry.findById(req.params.entryId);

    if (!entry) {
      return res.status(404).json({ error: 'Library entry not found' });
    }

    // Soft-delete: mark hidden so Steam sync won't re-import
    entry.hidden = true;
    await entry.save();

    res.json({ message: 'Game removed from library' });
  } catch (err) {
    console.error('[DELETE FROM LIBRARY] Error:', err.message);
    res.status(500).json({ error: 'Failed to remove game from library' });
  }
});

// POST /api/reviews/comment - Add comment to a friend's review
app.post('/api/reviews/comment', isLoggedIn, async (req, res) => {
  try {
    const { gameId, friendId, comment } = req.body;
    
    if (!gameId || !friendId || !comment) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const review = await LibraryEntry.findOne({
      userId: friendId,
      gameId: gameId
    });

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const user = await User.findById(req.session.userId);
    
    review.comments.push({
      userId: req.session.userId,
      userName: user.displayName || user.username,
      text: comment,
      createdAt: new Date()
    });

    await review.save();
    res.json({ message: 'Comment added successfully' });
  } catch (err) {
    console.error('[ADD REVIEW COMMENT] Error:', err.message);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// POST /api/reviews/react - Add reaction to a friend's review
app.post('/api/reviews/react', isLoggedIn, async (req, res) => {
  try {
    const { gameId, friendId, reaction } = req.body;
    
    if (!gameId || !friendId || !reaction) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const review = await LibraryEntry.findOne({
      userId: friendId,
      gameId: gameId
    });

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // For now, just track that a reaction was added (could be extended to store reactions separately)
    res.json({ message: 'Reaction added successfully' });
  } catch (err) {
    console.error('[ADD REVIEW REACTION] Error:', err.message);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

// GET /api/reviews/game - Get community reviews for a game by IGDB ID or name
app.get('/api/reviews/game', async (req, res) => {
  try {
    const { igdbId, name } = req.query;
    
    console.log(`[GET REVIEWS] Looking for reviews - igdbId: ${igdbId}, name: ${name}`);
    
    let game = null;

    // Try to find the game by IGDB ID first
    if (igdbId) {
      const igdbIdNum = parseInt(igdbId);
      game = await Game.findOne({ igdbId: igdbIdNum });
      if (game) {
        console.log(`[GET REVIEWS] Found game by IGDB ID: ${game.name}`);
      }
    }

    // If not found by IGDB ID, try by name
    if (!game && name) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      game = await Game.findOne({ name: { $regex: new RegExp('^' + escaped + '$', 'i') } });
      if (game) {
        console.log(`[GET REVIEWS] Found game by name: ${game.name}`);
      }
    }

    if (!game) {
      console.log(`[GET REVIEWS] No game found for igdbId=${igdbId}, name=${name}`);
      return res.json([]);
    }

    // Find all library entries for this game with reviews (notes exist, regardless of rating)
    const entries = await LibraryEntry.find({
      gameId: game._id,
      notes: { $exists: true, $ne: '' }
    })
    .populate('userId', 'username profileImage')
    .sort({ createdAt: -1 })
    .limit(20);

    console.log(`[GET REVIEWS] Found ${entries.length} reviews for game ${game.name}`);

    // Format reviews for display
    const reviews = entries.map(entry => ({
      _id: entry._id,
      username: entry.userId?.username || 'Anonymous',
      profileImage: entry.userId?.profileImage,
      rating: entry.rating,
      notes: entry.notes,
      createdAt: entry.createdAt
    }));

    res.json(reviews);
  } catch (err) {
    console.error('[GET COMMUNITY REVIEWS] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// ─── IGDB API ROUTES (EXISTING) ───

// POST /api/games/search - Search games by name (IGDB)
app.post('/api/games/search', async (req, res) => {
  try {
    const { query, limit: rawLimit = 20 } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });
    const limit = Math.min(Math.max(1, parseInt(rawLimit) || 20), 50);

    let data = [];
    try {
      const token = await getAccessToken();
      const igdbRes = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: {
          'Client-ID': process.env.TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'text/plain'
        },
        body: `search "${query}"; fields name,cover.url,first_release_date,genres.name,rating,summary; limit ${limit};`
      });
      data = await igdbRes.json();
      console.log('[IGDB SEARCH RESPONSE]', data.length, 'results');
    } catch (err) {
      console.error('[IGDB SEARCH] Error:', err.message);
    }
    res.json(data);
  } catch (err) {
    console.error('[IGDB SEARCH] Error:', err.message);
    res.status(500).json({ error: 'Failed to search games' });
  }
});

let _trendingCache = null;
let _trendingCacheTime = 0;
const TRENDING_CACHE_TTL = 15 * 60 * 1000; // 15 mins

// GET /api/games/trending — fetch recent trending games (IGDB)
app.get('/api/games/trending', async (req, res) => {
  try {
    if (_trendingCache && Date.now() - _trendingCacheTime < TRENDING_CACHE_TTL) {
      return res.json(_trendingCache);
    }
    const token = await getAccessToken();
    const now = Math.floor(Date.now() / 1000);
    const ninetyDaysAgo = now - (90 * 24 * 60 * 60);
    const response = await fetch("https://api.igdb.com/v4/games", {
      method: 'POST',
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/plain'
      },
      // Trending: recent releases with high rating, limit 20
      body: `fields name, cover.url, first_release_date, genres.name, rating, summary; sort rating desc; where rating != null & first_release_date != null & first_release_date < ${now} & first_release_date > ${ninetyDaysAgo}; limit 20;`
    });
    const data = await response.json();
    console.log('[IGDB TRENDING] Results:', data.length);
    _trendingCache = data;
    _trendingCacheTime = Date.now();
    res.json(data);
  } catch (err) {
    console.error('[IGDB TRENDING] Error:', err.message);
    if (_trendingCache) return res.json(_trendingCache);
    res.status(500).json({ error: "Failed to fetch trending games" });
  }
});

// GET /api/games/popular - Get popular/trending games (IGDB) — cached 5 min
let _popularCache = null;
let _popularCacheTime = 0;
const POPULAR_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

app.get('/api/games/popular', async (req, res) => {
  try {
    // Return cached data if fresh
    if (_popularCache && Date.now() - _popularCacheTime < POPULAR_CACHE_TTL) {
      return res.json(_popularCache);
    }
    const token = await getAccessToken();
    const now = Math.floor(Date.now() / 1000);
    // Get trending/popular games — released in the last 6 months for wider trailer coverage
    const sixMonthsAgo = now - (180 * 24 * 60 * 60);
    const igdbRes = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/plain'
      },
      body: `fields name,cover.url,total_rating,total_rating_count,genres.name,first_release_date,summary,hypes,videos.video_id,videos.name,screenshots.*; where first_release_date > ${sixMonthsAgo} & first_release_date < ${now} & cover != null & videos != null; sort total_rating_count desc; limit 20;`
    });

    const data = await igdbRes.json();
    _popularCache = data;
    _popularCacheTime = Date.now();
    res.json(data);
  } catch (err) {
    console.error('[IGDB POPULAR] Error:', err.message);
    // Return stale cache if available
    if (_popularCache) return res.json(_popularCache);
    res.status(500).json({ error: 'Failed to get popular games' });
  }
});

// GET /api/games/top - Get top 50 highest-rated games overall (cached 10 min)
let _topCache = null;
let _topCacheTime = 0;
const TOP_CACHE_TTL = 10 * 60 * 1000;

app.get('/api/games/top', async (req, res) => {
  try {
    if (_topCache && Date.now() - _topCacheTime < TOP_CACHE_TTL) {
      return res.json(_topCache);
    }
    const token = await getAccessToken();
    const now = Math.floor(Date.now() / 1000);
    // Only recent games: released in the last 12 months
    const oneYearAgo = now - (365 * 24 * 60 * 60);
    const igdbRes = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/plain'
      },
      body: `fields name,cover.url,total_rating,total_rating_count,genres.name,first_release_date; where total_rating_count > 5 & cover != null & total_rating != null & first_release_date > ${oneYearAgo} & first_release_date < ${now}; sort total_rating desc; limit 50;`
    });
    const data = await igdbRes.json();
    _topCache = data;
    _topCacheTime = Date.now();
    res.json(data);
  } catch (err) {
    console.error('[IGDB TOP] Error:', err.message);
    if (_topCache) return res.json(_topCache);
    res.status(500).json({ error: 'Failed to get top games' });
  }
});

// GET /api/community/quality-scores - Get aggregated community quality scores from all users (cached 5 min)
let _communityScoresCache = null;
let _communityScoresCacheTime = 0;
const COMMUNITY_SCORES_TTL = 5 * 60 * 1000;

app.get('/api/community/quality-scores', async (req, res) => {
  try {
    // Check cache
    if (_communityScoresCache && Date.now() - _communityScoresCacheTime < COMMUNITY_SCORES_TTL) {
      return res.json(_communityScoresCache);
    }

    // Exclude test/seed users from community scores
    const testUsernames = ['gaminglead', 'speedrunner99', 'casualplayer', 'indiegames'];
    const testUsers = await User.find({ username: { $in: testUsernames } }).select('_id');
    const testUserIds = testUsers.map(u => u._id.toString());

    // Aggregate ratings from all users EXCEPT test users
    const entries = await LibraryEntry.find({
      rating: { $gt: 0 },
      hidden: { $ne: true },
      userId: { $nin: testUsers.map(u => u._id) } // Exclude test users
    })
      .populate('gameId', 'name coverUrl _id')
      .lean();

    // Group by game and calculate averages
    const gameScoresMap = new Map();

    for (const entry of entries) {
      if (!entry.gameId || !entry.rating || entry.rating < 1 || entry.rating > 5) continue;

      const gameId = entry.gameId._id.toString();
      const gameName = entry.gameId.name;
      const rating = parseFloat(entry.rating);

      if (!gameScoresMap.has(gameId)) {
        gameScoresMap.set(gameId, {
          id: gameId,
          name: gameName,
          coverUrl: entry.gameId.coverUrl,
          ratings: []
        });
      }

      gameScoresMap.get(gameId).ratings.push(rating);
    }

    // Calculate averages and format
    const result = Array.from(gameScoresMap.values())
      .map(game => {
        const sum = game.ratings.reduce((a, b) => a + b, 0);
        const average = sum / game.ratings.length;
        return {
          ...game,
          ratingCount: game.ratings.length,
          averageRating: parseFloat(average.toFixed(1)),
          ratings: undefined // Don't send raw ratings to frontend
        };
      })
      .filter(game => game.ratingCount >= 1) // Only games with at least 1 rating
      .sort((a, b) => b.averageRating - a.averageRating)
      .slice(0, 10); // Top 10

    _communityScoresCache = result;
    _communityScoresCacheTime = Date.now();

    console.log('[COMMUNITY SCORES] Calculated:', result.length, 'games (excluded test users)');
    res.json(result);
  } catch (err) {
    console.error('[COMMUNITY SCORES] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch community scores' });
  }
});

// GET /api/gaming-news - Get real gaming/esports news articles
let _gaminNewsCache = null;
let _gamingNewsCacheTime = 0;
const GAMING_NEWS_TTL = 6 * 60 * 60 * 1000; // 6 hours

app.get('/api/gaming-news', isLoggedIn, async (req, res) => {
  try {
    // Check cache
    if (_gaminNewsCache && Date.now() - _gamingNewsCacheTime < GAMING_NEWS_TTL) {
      return res.json(_gaminNewsCache);
    }

    const newsItems = [];
    const newsApiKey = process.env.NEWS_API_KEY;

    if (!newsApiKey) {
      console.warn('[GAMING NEWS] No NEWS_API_KEY configured, returning mock data');
      // Return mock data if no API key
      const mockNews = [
        {
          type: 'article',
          title: '🎮 Final Fantasy VII Rebirth Releases Next Week',
          description: 'The highly anticipated PS5 exclusive launches March 29th',
          image: 'https://via.placeholder.com/300x200?text=FF7+Rebirth',
          url: '#',
          source: 'GameSpot',
          date: new Date()
        },
        {
          type: 'article',
          title: '📊 GPU Prices Drop 15% - Best Gaming PC Builds 2024',
          description: 'RTX 4070 and RX 7800 XT see significant price cuts',
          image: 'https://via.placeholder.com/300x200?text=GPU+Prices',
          url: '#',
          source: 'TechPowerUp',
          date: new Date(Date.now() - 24 * 60 * 60 * 1000)
        },
        {
          type: 'article',
          title: '🏆 Esports Update: T1 Wins LCK Spring Finals',
          description: 'Faker leads team to dominant 3-0 victory',
          image: 'https://via.placeholder.com/300x200?text=T1+Esports',
          url: '#',
          source: 'ESPN Esports',
          date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        }
      ];
      return res.json(mockNews);
    }

    // Fetch real gaming news from NewsAPI
    const queries = [
      'gaming news',
      'video game releases',
      'esports',
      'game patch notes'
    ];

    for (const query of queries) {
      if (newsItems.length >= 10) break;

      try {
        const response = await fetch(
          `https://newsapi.org/v2/everything?q=${query}&sortBy=publishedAt&language=en&pageSize=10&apiKey=${newsApiKey}`
        );

        if (!response.ok) continue;

        const data = await response.json();
        if (!data.articles) continue;

        for (const article of data.articles) {
          if (newsItems.length >= 10) break;

          // Filter out low-quality or duplicate articles
          if (!article.title || !article.description || !article.url) continue;
          if (article.description.includes('[Removed]')) continue;

          newsItems.push({
            type: 'article',
            title: article.title,
            description: article.description,
            image: article.urlToImage,
            url: article.url,
            source: article.source.name,
            date: new Date(article.publishedAt),
            author: article.author
          });
        }
      } catch (err) {
        console.warn(`[GAMING NEWS] Fetch for "${query}" failed:`, err.message);
      }
    }

    // Remove duplicates (by title)
    const uniqueNews = [];
    const titles = new Set();
    for (const item of newsItems) {
      if (!titles.has(item.title)) {
        uniqueNews.push(item);
        titles.add(item.title);
      }
    }

    // Sort by date descending
    uniqueNews.sort((a, b) => new Date(b.date) - new Date(a.date));

    _gaminNewsCache = uniqueNews.slice(0, 12); // Top 12 items
    _gamingNewsCacheTime = Date.now();

    console.log('[GAMING NEWS] Fetched:', _gaminNewsCache.length, 'real articles');
    res.json(_gaminNewsCache);
  } catch (err) {
    console.error('[GAMING NEWS] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch gaming news' });
  }
});

let _homeCache = null;
let _homeCacheTime = 0;
const HOME_CACHE_TTL = 15 * 60 * 1000;

// GET /api/igdb/games - Alias for getting popular games (for homepage)
app.get('/api/igdb/games', async (req, res) => {
  try {
    if (_homeCache && Date.now() - _homeCacheTime < HOME_CACHE_TTL) {
      return res.json(_homeCache);
    }
    const token = await getAccessToken();
    const now = Math.floor(Date.now() / 1000);
    const igdbRes = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/plain'
      },
      body: `fields name,cover.url,rating,genres.name,first_release_date,summary; where rating > 85 & cover != null & first_release_date < ${now}; sort rating desc; limit 10;`
    });

    const data = await igdbRes.json();
    _homeCache = data;
    _homeCacheTime = Date.now();
    res.json(data);
  } catch (err) {
    console.error('[IGDB GAMES] Error:', err.message);
    if (_homeCache) return res.json(_homeCache);
    res.status(500).json({ error: 'Failed to get games' });
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

// ─── FRIEND ROUTES ───

// GET /api/users/search/friends?q=query - Search users by username or displayName
app.get('/api/users/search/friends', isLoggedIn, async (req, res) => {
  try {
    const q = req.query.q;
    if (!q || q.length < 2) return res.status(400).json({ error: 'Query must be at least 2 characters' });
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const users = await User.find({
      _id: { $ne: req.session.userId },
      $or: [{ username: regex }, { displayName: regex }]
    }).select('_id username displayName avatar').limit(10);
    res.json(users);
  } catch (err) {
    console.error('[SEARCH USERS] Error:', err.message);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// POST /api/friends/request/:userId - Send friend request
app.post('/api/friends/request/:userId', isLoggedIn, async (req, res) => {
  try {
    const targetId = req.params.userId;
    const myId = req.session.userId;
    if (targetId === myId || targetId === myId.toString()) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }
    const target = await User.findById(targetId);
    if (!target) return res.status(404).json({ error: 'User not found' });

    // Check if already friends
    const me = await User.findById(myId);
    if (me.friends.some(f => f.toString() === targetId)) {
      return res.status(409).json({ error: 'Already friends' });
    }

    // Check if request already pending
    const existing = target.friendRequests.find(
      r => r.from.toString() === myId.toString() && r.status === 'pending'
    );
    if (existing) return res.status(409).json({ error: 'Friend request already sent' });

    // Check if they already sent us a request — auto-accept
    const theirRequest = me.friendRequests.find(
      r => r.from.toString() === targetId && r.status === 'pending'
    );
    if (theirRequest) {
      theirRequest.status = 'accepted';
      me.friends.addToSet(targetId);
      target.friends.addToSet(myId);
      await me.save();
      await target.save();
      return res.json({ message: 'Friend request auto-accepted! You are now friends.', status: 'friends' });
    }

    target.friendRequests.push({ from: myId });
    await target.save();
    res.json({ message: 'Friend request sent', status: 'pending' });
  } catch (err) {
    console.error('[FRIEND REQUEST] Error:', err.message);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// POST /api/friends/accept/:requestId - Accept friend request
app.post('/api/friends/accept/:requestId', isLoggedIn, async (req, res) => {
  try {
    const me = await User.findById(req.session.userId);
    const request = me.friendRequests.id(req.params.requestId);
    if (!request || request.status !== 'pending') {
      return res.status(404).json({ error: 'Friend request not found' });
    }
    request.status = 'accepted';
    me.friends.addToSet(request.from);
    await me.save();

    // Add reciprocal friendship
    const sender = await User.findById(request.from);
    if (sender) {
      sender.friends.addToSet(me._id);
      await sender.save();
    }

    res.json({ message: 'Friend request accepted' });
  } catch (err) {
    console.error('[ACCEPT FRIEND] Error:', err.message);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// POST /api/friends/reject/:requestId - Reject friend request
app.post('/api/friends/reject/:requestId', isLoggedIn, async (req, res) => {
  try {
    const me = await User.findById(req.session.userId);
    const request = me.friendRequests.id(req.params.requestId);
    if (!request || request.status !== 'pending') {
      return res.status(404).json({ error: 'Friend request not found' });
    }
    request.status = 'rejected';
    await me.save();
    res.json({ message: 'Friend request rejected' });
  } catch (err) {
    console.error('[REJECT FRIEND] Error:', err.message);
    res.status(500).json({ error: 'Failed to reject friend request' });
  }
});

// DELETE /api/friends/:friendId - Remove friend
app.delete('/api/friends/:friendId', isLoggedIn, async (req, res) => {
  try {
    const myId = req.session.userId;
    const friendId = req.params.friendId;
    const me = await User.findById(myId);
    const friend = await User.findById(friendId);

    me.friends.pull(friendId);
    await me.save();
    if (friend) {
      friend.friends.pull(myId);
      await friend.save();
    }
    res.json({ message: 'Friend removed' });
  } catch (err) {
    console.error('[REMOVE FRIEND] Error:', err.message);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// GET /api/friends - Get current user's friends list
app.get('/api/friends', isLoggedIn, async (req, res) => {
  try {
    const me = await User.findById(req.session.userId).populate('friends', '_id username displayName avatar bio');
    res.json(me.friends || []);
  } catch (err) {
    console.error('[GET FRIENDS] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

// GET /api/friends/requests - Get pending friend requests for current user
app.get('/api/friends/requests', isLoggedIn, async (req, res) => {
  try {
    const me = await User.findById(req.session.userId).populate('friendRequests.from', '_id username displayName avatar');
    const pending = (me.friendRequests || []).filter(r => r.status === 'pending');
    res.json(pending);
  } catch (err) {
    console.error('[GET FRIEND REQUESTS] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch friend requests' });
  }
});

// GET /api/friends/status/:userId - Get friendship status with a specific user
app.get('/api/friends/status/:userId', isLoggedIn, async (req, res) => {
  try {
    const myId = req.session.userId;
    const targetId = req.params.userId;
    const me = await User.findById(myId);
    const target = await User.findById(targetId);

    if (me.friends.some(f => f.toString() === targetId)) {
      return res.json({ status: 'friends' });
    }
    // Check if I sent them a request
    if (target) {
      const sentReq = target.friendRequests.find(
        r => r.from.toString() === myId.toString() && r.status === 'pending'
      );
      if (sentReq) return res.json({ status: 'pending_sent' });
    }
    // Check if they sent me a request
    const receivedReq = me.friendRequests.find(
      r => r.from.toString() === targetId && r.status === 'pending'
    );
    if (receivedReq) return res.json({ status: 'pending_received', requestId: receivedReq._id });

    res.json({ status: 'none' });
  } catch (err) {
    console.error('[FRIEND STATUS] Error:', err.message);
    res.status(500).json({ error: 'Failed to check friend status' });
  }
});

// GET /api/friends/activity - Get friends' recent activity (for dashboard feed)
app.get('/api/friends/activity', isLoggedIn, async (req, res) => {
  try {
    const me = await User.findById(req.session.userId);
    const friendIds = me.friends || [];
    
    // Always include current user's posts/reviews/achievements, even if no friends
    const queryIds = [...friendIds, req.session.userId];

    const feed = [];

    // ═══ FRIEND ACHIEVEMENTS ═══
    for (const friendId of friendIds) {
      const friendLibrary = await LibraryEntry.find({ userId: friendId });
      const completedGames = friendLibrary.filter(e => e.status === 'completed').length;
      const totalHours = friendLibrary.reduce((sum, e) => sum + (e.hoursPlayed || 0), 0);
      const fiveStarGames = friendLibrary.filter(e => e.rating === 5).length;
      
      const friend = await User.findById(friendId);
      
      // Completion milestones
      if (completedGames === 5 || completedGames === 10 || completedGames === 20) {
        feed.push({
          type: 'achievement',
          subtype: 'completion',
          friendId,
          friendName: friend.displayName || friend.username,
          friendAvatar: friend.avatar,
          message: `Completed ${completedGames} games!`,
          count: completedGames,
          timestamp: new Date(),
          icon: '🏁'
        });
      }

      // Playtime milestones
      if (totalHours >= 100 && totalHours < 150) {
        feed.push({
          type: 'achievement',
          subtype: 'playtime',
          friendId,
          friendName: friend.displayName || friend.username,
          friendAvatar: friend.avatar,
          message: `Reached 100+ hours!`,
          count: Math.floor(totalHours),
          timestamp: new Date(),
          icon: '⏱️'
        });
      } else if (totalHours >= 500 && totalHours < 550) {
        feed.push({
          type: 'achievement',
          subtype: 'playtime',
          friendId,
          friendName: friend.displayName || friend.username,
          friendAvatar: friend.avatar,
          message: `Reached 500+ hours!`,
          count: Math.floor(totalHours),
          timestamp: new Date(),
          icon: '⏱️'
        });
      }

      // 5-star achievements
      if (fiveStarGames === 3 || fiveStarGames === 10) {
        feed.push({
          type: 'achievement',
          subtype: 'rating',
          friendId,
          friendName: friend.displayName || friend.username,
          friendAvatar: friend.avatar,
          message: `Found ${fiveStarGames} masterpieces!`,
          count: fiveStarGames,
          timestamp: new Date(),
          icon: '⭐'
        });
      }
    }

    // ═══ FRIEND REVIEWS ═══
    // Get games my friends rated (any rating, 1-5 stars) + my own reviews
    const myGames = await LibraryEntry.find({ userId: req.session.userId });
    const myGameIds = myGames.map(g => g.gameId.toString());
    
    const friendReviews = await LibraryEntry.find({
      userId: { $in: queryIds },
      rating: { $gte: 1, $lte: 5 }
    })
      .populate('gameId', 'name coverUrl')
      .populate('userId', '_id username displayName avatar')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    for (const entry of friendReviews) {
      const rating = Math.floor(entry.rating);
      const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
      const statusLabel = rating === 5 ? 'loved' : rating >= 4 ? 'really liked' : rating >= 3 ? 'liked' : rating >= 2 ? 'was okay with' : 'didn\'t like';
      
      feed.push({
        type: 'review',
        friendId: entry.userId._id,
        friendName: entry.userId.displayName || entry.userId.username,
        friendAvatar: entry.userId.avatar,
        game: entry.gameId.name,
        gameId: entry.gameId._id,
        coverUrl: entry.gameId.coverUrl,
        rating: rating,
        stars: stars,
        message: `${entry.userId.displayName || entry.userId.username} ${statusLabel}`,
        comments: entry.comments || [],
        timestamp: entry.createdAt || new Date(),
        icon: '⭐'
      });
    }

    // Sort by timestamp descending
    feed.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json(feed.slice(0, 20)); // Return top 20 items
  } catch (err) {
    console.error('[FRIEND ACTIVITY] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch friend activity' });
  }
});

// ─── COMMUNITY / POST ROUTES ───

// ─── CHAT ROUTES ───

// GET /api/chat/general - Get general chat messages
app.get('/api/chat/general', isLoggedIn, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const messages = await Message.find({ chatRoom: 'general' })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    res.json(messages.reverse());
  } catch (err) {
    console.error('[GET GENERAL CHAT] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/chat/message - Send a message to general or group chat
app.post('/api/chat/message', isLoggedIn, async (req, res) => {
  try {
    const { text, chatRoom } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }
    if (!chatRoom || !chatRoom.trim()) {
      return res.status(400).json({ error: 'Chat room is required' });
    }

    const user = await User.findById(req.session.userId);
    const message = new Message({
      sender: req.session.userId,
      senderName: user.displayName || user.username,
      senderAvatar: user.avatar,
      chatRoom: chatRoom.trim(),
      text: text.trim().substring(0, 1000),
      timestamp: new Date(),
    });

    await message.save();
    res.json(message);
  } catch (err) {
    console.error('[POST MESSAGE] Error:', err.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GET /api/chat/group/:groupId - Get group chat messages
app.get('/api/chat/group/:groupId', isLoggedIn, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const limit = parseInt(req.query.limit) || 50;

    // Verify user is a member of the group
    const group = await GroupChat.findById(groupId);
    if (!group || !group.members.includes(req.session.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await Message.find({ chatRoom: groupId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    res.json(messages.reverse());
  } catch (err) {
    console.error('[GET GROUP CHAT] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/chat/group - Create a new group chat
app.post('/api/chat/group', isLoggedIn, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const groupChat = new GroupChat({
      name: name.trim().substring(0, 50),
      description: description ? description.trim().substring(0, 200) : '',
      owner: req.session.userId,
      members: [req.session.userId],
    });

    await groupChat.save();
    res.json(groupChat);
  } catch (err) {
    console.error('[CREATE GROUP] Error:', err.message);
    res.status(500).json({ error: 'Failed to create group chat' });
  }
});

// GET /api/chat/groups - Get all group chats for current user
app.get('/api/chat/groups', isLoggedIn, async (req, res) => {
  try {
    const groups = await GroupChat.find({
      members: req.session.userId,
      isActive: true
    })
      .populate('owner', '_id username displayName avatar')
      .populate('members', '_id username displayName avatar')
      .sort({ createdAt: -1 })
      .lean();

    res.json(groups);
  } catch (err) {
    console.error('[GET GROUPS] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch group chats' });
  }
});

// POST /api/chat/group/:groupId/member - Add member to group chat (owner only)
app.post('/api/chat/group/:groupId/member', isLoggedIn, async (req, res) => {
  try {
    const { userId } = req.body;
    const groupId = req.params.groupId;

    const group = await GroupChat.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    if (group.owner.toString() !== req.session.userId) {
      return res.status(403).json({ error: 'Only group owner can add members' });
    }

    if (!group.members.includes(userId)) {
      group.members.push(userId);
      await group.save();
    }

    const updatedGroup = await GroupChat.findById(groupId)
      .populate('members', '_id username displayName avatar')
      .populate('owner', '_id username displayName avatar');
    res.json(updatedGroup);
  } catch (err) {
    console.error('[ADD MEMBER] Error:', err.message);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// DELETE /api/chat/group/:groupId/member/:userId - Remove member from group (owner only)
app.delete('/api/chat/group/:groupId/member/:userId', isLoggedIn, async (req, res) => {
  try {
    const { groupId, userId } = req.params;

    const group = await GroupChat.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    if (group.owner.toString() !== req.session.userId) {
      return res.status(403).json({ error: 'Only group owner can remove members' });
    }

    group.members.pull(userId);
    await group.save();
    res.json({ message: 'Member removed' });
  } catch (err) {
    console.error('[REMOVE MEMBER] Error:', err.message);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// DELETE /api/chat/group/:groupId - Delete or leave group chat
app.delete('/api/chat/group/:groupId', isLoggedIn, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const group = await GroupChat.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // If owner, delete the entire group
    if (group.owner.toString() === req.session.userId) {
      await GroupChat.findByIdAndDelete(groupId);
      await Message.deleteMany({ chatRoom: groupId });
      return res.json({ message: 'Group deleted' });
    }

    // Otherwise, just remove the user from members (leave the group)
    group.members.pull(req.session.userId);
    await group.save();
    res.json({ message: 'Left group' });
  } catch (err) {
    console.error('[DELETE GROUP] Error:', err.message);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

// ─── COMMUNITY / POST ROUTES ───

// GET /api/posts - Get all community posts
app.get('/api/posts', async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('author', '_id username displayName avatar')
      .populate('comments.author', '_id username displayName avatar')
      .sort({ createdAt: -1 });
    const postsWithId = posts.map(post => {
      const obj = post.toObject();
      obj.id = obj._id;
      return obj;
    });
    res.json(postsWithId);
  } catch (err) {
    console.error('[GET POSTS] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// POST /api/posts - Create a new post
app.post('/api/posts', isLoggedIn, async (req, res) => {
  try {
    const { title, body, flair, game, photo } = req.body;
    console.log('[CREATE POST] Received:', { title, body, flair, game, hasPhoto: !!photo, author: req.session.userId });
    
    if (!title || title.length < 3) {
      return res.status(400).json({ error: 'Title is required and must be at least 3 characters' });
    }
    const newPost = new Post({
      author: req.session.userId,
      title,
      body,
      flair,
      game,
      photo: photo || undefined
    });
    const savedPost = await newPost.save();
    console.log('[CREATE POST] Saved successfully:', savedPost._id);
    
    const populated = await newPost.populate('author', 'username displayName avatar');
    const obj = populated.toObject();
    obj.id = obj._id;
    res.status(201).json(obj);
  } catch (err) {
    console.error('[CREATE POST] Error:', err.message);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// POST /api/posts/:id/vote - Upvote/Downvote a post
app.post('/api/posts/:id/vote', isLoggedIn, async (req, res) => {
  try {
    const { direction } = req.body; // 'up' or 'down'
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const userId = req.session.userId;
    // Remove existing votes from this user
    post.upvotes = post.upvotes.filter(id => id.toString() !== userId.toString());
    post.downvotes = post.downvotes.filter(id => id.toString() !== userId.toString());

    if (direction === 'up') {
      post.upvotes.push(userId);
    } else if (direction === 'down') {
      post.downvotes.push(userId);
    }

    await post.save();
    res.json({
      upvotes: post.upvotes.length,
      downvotes: post.downvotes.length,
      score: post.upvotes.length - post.downvotes.length
    });
  } catch (err) {
    console.error('[VOTE POST] Error:', err.message);
    res.status(500).json({ error: 'Voting failed' });
  }
});

// POST /api/posts/:id/comment - Add a comment to a post
app.post('/api/posts/:id/comment', isLoggedIn, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Comment text is required' });
    }
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const newComment = {
      author: req.session.userId,
      text,
      createdAt: new Date()
    };
    post.comments.push(newComment);
    await post.save();

    // Re-populate to get author info
    const updatedPost = await Post.findById(req.params.id)
      .populate('comments.author', 'username displayName avatar');

    res.json(updatedPost.comments[updatedPost.comments.length - 1]);
  } catch (err) {
    console.error('[COMMENT POST] Error:', err.message);
    res.status(500).json({ error: 'Commenting failed' });
  }
});

// PUT /api/posts/:id - Edit a post
app.put('/api/posts/:id', isLoggedIn, async (req, res) => {
  try {
    const { title, body, flair, game, photo } = req.body;
    const post = await Post.findById(req.params.id);
    
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.author.toString() !== req.session.userId) {
      return res.status(403).json({ error: 'Only the author can edit this post' });
    }
    
    if (title && title.length < 3) {
      return res.status(400).json({ error: 'Title must be at least 3 characters' });
    }

    if (title) post.title = title;
    if (body !== undefined) post.body = body;
    if (flair) post.flair = flair;
    if (game !== undefined) post.game = game;
    if (photo !== undefined) post.photo = photo;

    // Remove empty fields
    if (!post.game) post.game = undefined;
    if (!post.photo) post.photo = undefined;

    await post.save();
    const populated = await post.populate('author', 'username displayName avatar');
    res.json(populated);
  } catch (err) {
    console.error('[EDIT POST] Error:', err.message);
    res.status(500).json({ error: 'Failed to edit post' });
  }
});

// DELETE /api/posts/:id - Delete a post
app.delete('/api/posts/:id', isLoggedIn, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.author.toString() !== req.session.userId) {
      return res.status(403).json({ error: 'Only the author can delete this post' });
    }

    await Post.findByIdAndDelete(req.params.id);
    res.json({ message: 'Post deleted successfully' });
  } catch (err) {
    console.error('[DELETE POST] Error:', err.message);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// ─── STEAM INTEGRATION ───

// POST /api/steam/sync - Sync playtime from Steam (also imports new games)
app.post('/api/steam/sync', isLoggedIn, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user || !user.steamId) {
      return res.status(400).json({ error: 'No Steam ID linked. Add your Steam ID in Profile Edit.' });
    }

    const result = await importSteamGames(user);

    // Recalculate total hours
    const allEntries = await LibraryEntry.find({ userId: user._id, hidden: { $ne: true } });
    const totalHours = allEntries.reduce((sum, e) => sum + (e.playtime || 0), 0);

    res.json({
      message: `Synced! Imported ${result.imported} new game${result.imported !== 1 ? 's' : ''}, updated ${result.updated} playtime${result.updated !== 1 ? 's' : ''}.`,
      imported: result.imported,
      updated: result.updated,
      totalHours: Math.round(totalHours),
      steamGamesCount: result.total || 0
    });
  } catch (err) {
    console.error('[STEAM SYNC] Error:', err.message);
    res.status(500).json({ error: 'Steam sync failed. Please try again.' });
  }
});