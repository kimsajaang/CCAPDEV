// model/seed.js - Seed database with sample data
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./db');
const User = require('./User');
const Game = require('./Game');
const LibraryEntry = require('./LibraryEntry');

const seedDatabase = async () => {
  try {
    await connectDB();

    // Clear existing data
    await User.deleteMany({});
    await Game.deleteMany({});
    await LibraryEntry.deleteMany({});
    console.log('✓ Cleared existing data');

    // ===== SAMPLE USERS =====
    const users = await User.create([
      {
        username: 'gaminglead',
        email: 'joshua@backlogo-hero.local',
        password: 'password123',
        displayName: 'Kane Joshua',
        bio: 'Hardcore RPG enthusiast. Always chasing 100% completion.',
        avatar: 'https://ui-avatars.com/api/?name=Kane+Joshua&background=5383E8&color=fff',
        favoriteGames: ['Elden Ring', 'Baldurs Gate 3', 'Dark Souls 3'],
      },
      {
        username: 'speedrunner99',
        email: 'justin@backlog-hero.local',
        password: 'password123',
        displayName: 'Justin Ice',
        bio: 'Speedrunning for fun. Racing against time daily.',
        avatar: 'https://ui-avatars.com/api/?name=Justin+Ice&background=50D6B4&color=fff',
        favoriteGames: ['Portal 2', 'Half-Life 2'],
      },
      {
        username: 'casualplayer',
        email: 'seanne@backlog-hero.local',
        password: 'password123',
        displayName: 'Seanne Fortea',
        bio: 'Casual gamer who loves story-driven games.',
        avatar: 'https://ui-avatars.com/api/?name=Seanne+Fortea&background=E85383&color=fff',
        favoriteGames: ['The Last of Us', 'Life is Strange'],
      },
      {
        username: 'indiegames',
        email: 'alex@backlog-hero.local',
        password: 'password123',
        displayName: 'Alex Chen',
        bio: 'Indie game lover. Supporting small devs.',
        avatar: 'https://ui-avatars.com/api/?name=Alex+Chen&background=FEBC2E&color=fff',
        favoriteGames: ['Hollow Knight', 'Celeste', 'Stardew Valley'],
      },
      {
        username: 'competitiveking',
        email: 'mike@backlog-hero.local',
        password: 'password123',
        displayName: 'Mike Rodriguez',
        bio: 'Competitive gamer. Always grinding ranked.',
        avatar: 'https://ui-avatars.com/api/?name=Mike+Rodriguez&background=28C840&color=fff',
        favoriteGames: ['League of Legends', 'Valorant', 'Counter-Strike 2'],
      },
    ]);
    console.log(`✓ Created ${users.length} sample users`);

    // ===== SAMPLE GAMES =====
    const games = await Game.create([
      {
        name: 'Elden Ring',
        coverUrl: 'https://via.placeholder.com/300x400?text=Elden+Ring',
        rating: 96,
        genres: ['Action RPG', 'Fantasy'],
        platforms: ['PlayStation 5', 'Xbox Series X', 'PC'],
        releaseDate: new Date('2022-02-25'),
        summary: 'A collaboration between FromSoftware and George R.R. Martin. Rise as the Elden Lord.',
      },
      {
        name: 'Baldurs Gate 3',
        coverUrl: 'https://via.placeholder.com/300x400?text=BG3',
        rating: 96,
        genres: ['RPG', 'Fantasy'],
        platforms: ['PlayStation 5', 'PC'],
        releaseDate: new Date('2023-08-03'),
        summary: 'A story of fellowship and betrayal, love and loss, victory and ruin.',
      },
      {
        name: 'The Legend of Zelda: Breath of the Wild',
        coverUrl: 'https://via.placeholder.com/300x400?text=BOTW',
        rating: 97,
        genres: ['Action Adventure', 'Open World'],
        platforms: ['Nintendo Switch', 'Wii U'],
        releaseDate: new Date('2017-03-03'),
        summary: 'Embark on a new adventure and discover what awaits in the vast lands of Hyrule.',
      },
      {
        name: 'Dark Souls 3',
        coverUrl: 'https://via.placeholder.com/300x400?text=DS3',
        rating: 89,
        genres: ['Action RPG', 'Fantasy'],
        platforms: ['PlayStation 4', 'Xbox One', 'PC'],
        releaseDate: new Date('2016-04-12'),
        summary: 'Return to the world of dark fantasy. Cursed to immortality. Destined to die.',
      },
      {
        name: 'Hollow Knight',
        coverUrl: 'https://via.placeholder.com/300x400?text=Hollow+Knight',
        rating: 88,
        genres: ['Metroidvania', 'Indie'],
        platforms: ['Nintendo Switch', 'PC', 'PlayStation 4', 'Xbox One'],
        releaseDate: new Date('2017-02-24'),
        summary: 'A 2D souls-like platformer in a beautiful insect world.',
      },
      {
        name: 'Celeste',
        coverUrl: 'https://via.placeholder.com/300x400?text=Celeste',
        rating: 87,
        genres: ['Platformer', 'Indie'],
        platforms: ['Nintendo Switch', 'PC', 'PlayStation 4', 'Xbox One'],
        releaseDate: new Date('2018-01-25'),
        summary: 'Help Madeline survive her journey up the mountain Celeste, in this challenging platformer.',
      },
      {
        name: 'Portal 2',
        coverUrl: 'https://via.placeholder.com/300x400?text=Portal2',
        rating: 95,
        genres: ['Puzzle', 'First-Person'],
        platforms: ['PC', 'PlayStation 3', 'Xbox 360'],
        releaseDate: new Date('2011-04-19'),
        summary: 'Wake up in Aperture Science and reunite with GLaDOS. Escape with portals.',
      },
      {
        name: 'Stardew Valley',
        coverUrl: 'https://via.placeholder.com/300x400?text=Stardew+Valley',
        rating: 92,
        genres: ['Simulation', 'Indie', 'RPG'],
        platforms: ['PC', 'Nintendo Switch', 'PlayStation 4', 'Xbox One', 'Mobile'],
        releaseDate: new Date('2016-02-28'),
        summary: 'You\'ve inherited your grandfather\'s old farm plot in Stardew Valley.',
      },
    ]);
    console.log(`✓ Created ${games.length} sample games`);

    // ===== SAMPLE LIBRARY ENTRIES =====
    const libraryEntries = await LibraryEntry.create([
      // gaminglead's library
      {
        userId: users[0]._id,
        gameId: games[0]._id, // Elden Ring
        status: 'completed',
        rating: 5,
        playtime: 180,
      },
      {
        userId: users[0]._id,
        gameId: games[1]._id, // BG3
        status: 'playing',
        rating: 5,
        playtime: 120,
      },
      {
        userId: users[0]._id,
        gameId: games[3]._id, // DS3
        status: 'completed',
        rating: 5,
        playtime: 140,
      },
      // speedrunner99's library
      {
        userId: users[1]._id,
        gameId: games[6]._id, // Portal 2
        status: 'completed',
        rating: 5,
        playtime: 45,
      },
      {
        userId: users[1]._id,
        gameId: games[0]._id, // Elden Ring
        status: 'backlog',
        rating: null,
        playtime: 0,
      },
      // casualplayer's library
      {
        userId: users[2]._id,
        gameId: games[2]._id, // BOTW
        status: 'completed',
        rating: 5,
        playtime: 160,
      },
      {
        userId: users[2]._id,
        gameId: games[1]._id, // BG3
        status: 'playing',
        rating: 4,
        playtime: 85,
      },
      // indiegames's library
      {
        userId: users[3]._id,
        gameId: games[4]._id, // Hollow Knight
        status: 'playing',
        rating: 4,
        playtime: 95,
      },
      {
        userId: users[3]._id,
        gameId: games[5]._id, // Celeste
        status: 'completed',
        rating: 5,
        playtime: 42,
      },
      {
        userId: users[3]._id,
        gameId: games[7]._id, // Stardew Valley
        status: 'playing',
        rating: 5,
        playtime: 200,
      },
      // competitiveking's library
      {
        userId: users[4]._id,
        gameId: games[0]._id, // Elden Ring
        status: 'backlog',
        rating: null,
        playtime: 0,
      },
      {
        userId: users[4]._id,
        gameId: games[2]._id, // BOTW
        status: 'completed',
        rating: 5,
        playtime: 150,
      },
    ]);
    console.log(`✓ Created ${libraryEntries.length} sample library entries`);

    console.log('\n✓ Database seeded successfully!');
    process.exit(0);
  } catch (err) {
    console.error('✗ Seed error:', err);
    process.exit(1);
  }
};

seedDatabase();
