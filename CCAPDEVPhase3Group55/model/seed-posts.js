// model/seed-posts.js
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./db'); // Fixed path since it's now in the same folder
const User = require('./User');
const Post = require('./Post');

async function seed() {
  await connectDB();
  const users = await User.find();
  if (users.length < 5) {
    console.log('Not enough users found. Run seed.js first.');
    process.exit(1);
  }

  const u0 = users[0]._id; // gaminglead
  const u1 = users[1]._id; // speedrunner99
  const u2 = users[2]._id; // casualplayer
  const u3 = users[3]._id; // indiegames
  const u4 = users[4]._id; // competitiveking

  await Post.deleteMany({});
  
  const posts = await Post.create([
    {
      title: 'Welcome to the Community!',
      body: 'This is the first persistent post in our new backend. Share your backlog progress here!',
      author: u0,
      flair: 'Discussion',
      comments: [
        { author: u1, text: 'Glad to be here! Ready to clear some games.' },
        { author: u2, text: 'The UI looks amazing. Great job team!' }
      ],
      createdAt: new Date(Date.now() - 86400000 * 2)
    },
    {
      title: 'Elden Ring is a Masterpiece',
      body: 'Just finished my first playthrough. 180 hours in and I still feel like I missed half the secrets. Thoughts?',
      author: u0,
      flair: 'Recommendation',
      game: 'Elden Ring',
      comments: [
        { author: u4, text: 'Wait until you try the DLC. It gets even better.' },
        { author: u3, text: 'I still haven\'t beaten the first boss lol.' }
      ],
      createdAt: new Date(Date.now() - 86400000 * 1)
    },
    {
      title: 'Speedrun Tips for Portal 2?',
      body: 'Looking for some advanced movement tips. Any advice for the final chapters?',
      author: u1,
      flair: 'Help',
      game: 'Portal 2',
      comments: [
        { author: u0, text: 'Check out the bunny hopping tutorials on YouTube. Precision is key.' }
      ],
      createdAt: new Date(Date.now() - 3600000 * 12)
    },
    {
      title: 'Indie Hidden Gems 2023',
      body: 'Everyone knows Hollow Knight, but check out Sea of Stars if you haven\'t yet!',
      author: u3,
      flair: 'Recommendation',
      comments: [
        { author: u2, text: 'Sea of Stars is so cozy. Definitely worth the playtime.' }
      ],
      createdAt: new Date(Date.now() - 3600000 * 5)
    },
    {
      title: 'Backlog Progress: 5 games down!',
      body: 'Finally finished Celeste and Stardew. Moving on to Baldurs Gate 3 next.',
      author: u2,
      flair: 'Progress',
      game: 'Celeste',
      comments: [
        { author: u1, text: 'Great pace! BG3 will take you a while though.' },
        { author: u4, text: 'Good luck with the Honor Mode!' }
      ],
      createdAt: new Date()
    }
  ]);

  console.log(`✓ Seeded ${posts.length} posts with ${posts.reduce((s, p) => s + p.comments.length, 0)} comments!`);
  process.exit(0);
}

seed();
