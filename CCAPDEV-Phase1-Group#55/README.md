# Backlog Hero - Phase 2

A game collection tracker web application built with Node.js, Express, and MongoDB. Users can search for games, manage their personal game library, and track their gaming progress.

##  Project Structure

```
CCAPDEV-Phase2-Group#55/
├── public/                    # Frontend files (served by Express)
│   ├── *.html                 # All HTML pages (index, login, dashboard, etc.)
│   ├── assets/                # Images and logos
│   │   └── logos/
│   └── *.png, *.jpg           # Game images
├── model/                     # Backend models & database
│   ├── db.js                  # MongoDB connection setup
│   ├── User.js                # User schema & model
│   ├── Game.js                # Game schema & model
│   ├── Post.js                # Post & Comment schema & model
│   ├── LibraryEntry.js        # Library entry schema & model
│   ├── seed.js                # Sample data seeder (Users, Games)
│   └── seed-posts.js          # Sample data seeder (Posts, Comments)
├── server.js                  # Express server & API routes
├── package.json               # Dependencies
├── .env                       # Environment configuration
├── .gitignore                 # Git ignore file
└── README.md                  # This file
```

##  Quick Start

### Prerequisites

- **Node.js** (v14 or higher)
- **MongoDB** (local or cloud)
- **Twitch API credentials** (for IGDB game search - optional)

### Installation

1. **Clone/unzip the project**:
   ```bash
   cd CCAPDEV-Phase2-Group#55
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables** (`.env`):
   ```bash
   # MongoDB connection
   MONGODB_URI=mongodb://localhost:27017/backlog-hero
   
   # Or use MongoDB Atlas (cloud):
   # MONGODB_URI=mongodb+srv://username:password@cluster0.mongodb.net/backlog-hero
   
   # Twitch API (for IGDB search - optional)
   TWITCH_CLIENT_ID=your_client_id
   TWITCH_CLIENT_SECRET=your_client_secret
   
   # Server port
   PORT=3000
   ```

4. **Start MongoDB** (if using local):
   ```bash
   mongod
   ```

5. **Seed sample data** (optional but recommended):
   ```bash
   npm run seed
   ```

6. **Start the server**:
   ```bash
   npm start
   ```

7. **Open in browser**:
   ```
   http://localhost:3000
   ```

##  Sample Data

The database includes pre-loaded sample data:

- **5 Sample Users**: Different gaming preferences
- **8 Sample Games**: Popular titles from various genres
- **12 Sample Library Entries**: User game collections with different statuses

To populate the database, run: `npm run seed`

Users can log in with sample accounts:
- Username: `gaminglead` | Password: `password123`
- Username: `speedrunner99` | Password: `password123`
- Username: `casualplayer` | Password: `password123`
- Username: `indiegames` | Password: `password123`
- Username: `competitiveking` | Password: `password123`

##  API Endpoints

### User Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/users/register` | Register new user |
| POST | `/api/users/login` | User login |
| GET | `/api/users/:userId` | Get user profile |
| PUT | `/api/users/:userId` | Update user profile |

### Games

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/games` | Get all games from DB |
| GET | `/api/games/db/:gameId` | Get single game |
| POST | `/api/games` | Create new game |
| POST | `/api/games/search` | Search IGDB (requires Twitch API) |
| GET | `/api/games/popular` | Get popular games (IGDB) |
| GET | `/api/games/igdb/:id` | Get game details (IGDB) |

### Library Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/library/:userId` | Get user's library |
| GET | `/api/library/:userId/status/:status` | Get games by status (backlog, playing, completed) |
| POST | `/api/library` | Add game to library |
| PUT | `/api/library/:entryId` | Update library entry |
| DELETE | `/api/library/:entryId` | Remove game from library |

##  Authentication

Session-based authentication with two login methods:
- **Email/Password** — bcryptjs password hashing, express-session for session management
- **Steam OpenID** — passport-steam for Steam login, auto-imports game library on first sign-in

### Login Example

```bash
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"username":"gaminglead","password":"password123"}'
```

Response:
```json
{
  "message": "Login successful",
  "userId": "507f1f77bcf86cd799439011",
  "username": "gaminglead",
  "email": "joshua@backlog-hero.local",
  "displayName": "Kane Joshua"
}
```

## 📝 Database Schema

### User
```javascript
{
  username: String (unique, required),
  email: String (unique, required),
  password: String (hashed),
  displayName: String,
  bio: String,
  avatar: String (URL),
  favoriteGames: [String],
  createdAt: Date
}
```

### Game
```javascript
{
  igdbId: Number (from IGDB API),
  name: String (required),
  coverUrl: String,
  rating: Number (0-100),
  genres: [String],
  platforms: [String],
  releaseDate: Date,
  summary: String,
  createdAt: Date
}
```

### LibraryEntry
```javascript
{
  userId: ObjectId (ref: User),
  gameId: ObjectId (ref: Game),
  status: String (backlog | playing | completed),
  rating: Number (0-5),
  playtime: Number (hours),
  notes: String,
  addedAt: Date,
  completedAt: Date
}
```

## Features

### Core
- **User Authentication** — Registration and login with password hashing (bcryptjs)
- **Library Management** — Personal game library to track backlog, playing, and completed games
- **Ratings & Playtime** — Rate games (1–5 stars) and log custom playtime
- **Game Discovery** — Search for games via IGDB API with HD cover art, and view trending games and trailers on your dashboard
- **Profile Customization** — Customizable user profiles (avatar, bio, display name) including a dynamic top 5 favorite games showcase
- **Responsive & Dynamic UI** — Responsive dark-themed UI (Bootstrap 5 / Handlebars) featuring an animated interactive Plexus background

### Steam Integration
- **Steam Login** — Sign in with your Steam account via OpenID (passport-steam)
- **Auto-Import Library** — All owned Steam games are imported with playtime and cover art
- **Auto-Sync Playtime** — Every dashboard visit syncs latest playtime from Steam automatically
- **IGDB Cover Art** — Game covers are fetched from IGDB for high-quality images; falls back to Steam CDN

### Activity & Gamification
- **Activity Feed** — Dashboard shows recent library activity with game covers, status badges, ratings, and playtime
- **Community Quality Scores** — Average ratings from your library displayed on dashboard

### Community
- **Community Posts** — Create posts with title, body, flair tags, game tags, and photo uploads
- **Voting System** — Upvote/downvote posts with hot/new/top sorting
- **Comments** — Threaded comments on posts with user avatars
- **Post Search** — Filter community posts by keywords
- **Active Members Sidebar** — Dynamically shows users who contribute posts and comments

## Tech Stack

- **Frontend**: HTML5, Bootstrap 5, JavaScript, Handlebars
- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: bcryptjs (password hashing), express-session, passport-steam (Steam OpenID)
- **External APIs**: IGDB (via Twitch OAuth), Steam Web API

## Environment Setup

Create a `.env` file in the root directory:

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/backlog-hero

# Twitch/IGDB API (optional — needed for game search)
TWITCH_CLIENT_ID=your_id_here
TWITCH_CLIENT_SECRET=your_secret_here

# Steam API (optional — needed for Steam login & library sync)
STEAM_API_KEY=your_steam_api_key
SESSION_SECRET=your_session_secret

# Server
PORT=3000
```


### Register a new user
```bash
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "email": "user@example.com",
    "password": "password123",
    "displayName": "New User"
  }'
```

### Add game to library
```bash
curl -X POST http://localhost:3000/api/library \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "507f1f77bcf86cd799439011",
    "gameId": "507f1f77bcf86cd799439012",
    "status": "playing"
  }'
```

### Get user library
```bash
curl http://localhost:3000/api/library/507f1f77bcf86cd799439011
```


All pages are accessible from the main navbar:
- **Dashboard**: Activity feed and game recommendations
- **My Library**: Personal game collection with filtering
- **Search Games**: Browse and search the game catalog
- **Community**: Stats and community discussions
- **Profile**: User profile customization

## Team Members

- **Ibanez, Kane Joshua** - 1234654 - S13
- **David, Justin Ice** - 12411574 - S13
- **Fortea, Seanne Clarence** - 12410969 - S22

##  Notes

- Form validation is implemented on the frontend
- Session management with express-session and bcryptjs for password hashing
- Steam login via passport-steam with automatic game library import and playtime sync
- Database uses MongoDB with Mongoose for schema validation
- Community posts are stored in MongoDB (database-backed)
- All routes follow RESTful API conventions
- Comprehensive error handling with appropriate HTTP status codes

##  Troubleshooting

**MongoDB connection failed?**
- Ensure MongoDB is running: `mongod`
- Check MONGODB_URI in `.env`

**Seed data not loading?**
- Run `npm run seed` after database is connected
- Check console for error messages

**IGDB search not working?**
- Add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET to `.env`
- Get credentials from https://dev.twitch.tv/console/apps

**Port 3000 already in use?**
- Change PORT in `.env` to an available port
- Or kill the process: `lsof -ti:3000 | xargs kill -9` (Linux/Mac)

##  License

CCAPDEV Machine Project - Phase 2

---

**Last Updated**: February 2026
