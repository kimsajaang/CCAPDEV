// model/LibraryEntry.js - User's game library entries
const mongoose = require('mongoose');

const libraryEntrySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Game',
      required: true,
    },
    status: {
      type: String,
      enum: ['backlog', 'playing', 'completed'],
      default: 'backlog',
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: null,
    },
    playtime: {
      type: Number, // in hours
      default: 0,
    },
    notes: {
      type: String,
      default: '',
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    hidden: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Ensure a user can only add a game once
libraryEntrySchema.index({ userId: 1, gameId: 1 }, { unique: true });

module.exports = mongoose.model('LibraryEntry', libraryEntrySchema);
