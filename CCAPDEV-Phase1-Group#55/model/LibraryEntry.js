// model/LibraryEntry.js - User's game library entries
const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  userName: String,
  text: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

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
    comments: [commentSchema],
  },
  { timestamps: true }
);

// Ensure a user can only add a game once
libraryEntrySchema.index({ userId: 1, gameId: 1 }, { unique: true });

// Optimize queries by userId - VERY common filter
libraryEntrySchema.index({ userId: 1, hidden: 1, status: 1 });

// Optimize rating/community score queries
libraryEntrySchema.index({ rating: 1, hidden: 1 });

// Optimize activity feed queries
libraryEntrySchema.index({ userId: 1, addedAt: -1 });

module.exports = mongoose.model('LibraryEntry', libraryEntrySchema);
