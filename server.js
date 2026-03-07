// ============================================================
// NOTE: This file is for TESTING ONLY.
// ============================================================
//
// server.js — Express server for Backlog Hero
// Serves static HTML files and proxies IGDB API requests.
// The proxy is needed because IGDB blocks direct browser requests (CORS).
// Run with: npm start   (opens on http://localhost:3000)

require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Twitch OAuth token management ---
// IGDB is owned by Twitch so we need a Twitch access token
let accessToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  // reuse token if it hasn't expired yet
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  console.log('Fetching new Twitch access token...');
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
  // expire 5 minutes early to be safe
  tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
  console.log('Got access token, expires in', Math.round(data.expires_in / 3600), 'hours');
  return accessToken;
}

// --- Middleware ---
app.use(express.json());
app.use(express.static(__dirname)); // serve all HTML, CSS, images from project root

// --- IGDB API proxy routes ---

// Search games by name
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
    console.error('IGDB search error:', err.message);
    res.status(500).json({ error: 'Failed to search games' });
  }
});

// Get popular/trending games (for recommendations)
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
    console.error('IGDB popular error:', err.message);
    res.status(500).json({ error: 'Failed to get popular games' });
  }
});

// Get single game details by ID
app.get('/api/games/:id', async (req, res) => {
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
    console.error('IGDB game detail error:', err.message);
    res.status(500).json({ error: 'Failed to get game details' });
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`\n  Backlog Hero server running at http://localhost:${PORT}`);
  console.log(`  Open that URL in your browser to use the site.\n`);

  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
    console.log('  ⚠ WARNING: TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET not set in .env');
    console.log('  The IGDB search will not work until you add your credentials.\n');
  }
});
