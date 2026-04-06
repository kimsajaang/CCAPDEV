// model/Game.js - Game metadata schema
const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema(
  {
    igdbId: {
      type: Number,
      unique: true,
      sparse: true,
    },
    name: {
      type: String,
      required: true,
    },
    coverUrl: {
      type: String,
      default: null,
    },
    rating: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    genres: {
      type: [String],
      default: [],
    },
    platforms: {
      type: [String],
      default: [],
    },
    releaseDate: {
      type: Date,
      default: null,
    },
    summary: {
      type: String,
      default: '',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Game', gameSchema);
