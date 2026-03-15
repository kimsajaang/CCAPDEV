// seed-posts.js
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./model/db');
const User = require('./model/User');
const Post = require('./model/Post');

async function seed() {
  await connectDB();
  const user = await User.findOne({ username: 'gaminglead' });
  if (!user) {
    console.log('User gaminglead not found. Run seed.js first.');
    process.exit(1);
  }

  await Post.deleteMany({});
  
  await Post.create({
    title: 'Welcome to the Community!',
    body: 'This is the first persistent post in our new backend. Share your backlog progress here!',
    author: user._id,
    flair: 'Discussion',
    createdAt: new Date()
  });

  console.log('Post seeded!');
  process.exit(0);
}

seed();
