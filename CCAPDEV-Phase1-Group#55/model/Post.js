// model/Post.js - Community post schema and model
const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: true,
    maxlength: 1000
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const postSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    minlength: 3,
    maxlength: 200,
    trim: true
  },
  body: {
    type: String,
    maxlength: 5000,
    trim: true
  },
  flair: {
    type: String,
    enum: ['Discussion', 'Recommendation', 'Help', 'Progress'],
    default: 'Discussion'
  },
  game: {
    type: String,
    trim: true,
    maxlength: 100
  },
  photo: {
    type: String, // Base64 or URL
    default: null
  },
  upvotes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  downvotes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  comments: [commentSchema],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Virtual to get total score
postSchema.virtual('score').get(function() {
  return (this.upvotes?.length || 0) - (this.downvotes?.length || 0);
});

// Ensure virtuals are included in JSON
postSchema.set('toJSON', { virtuals: true });
postSchema.set('toObject', { virtuals: true });

// Add indexes for performance
postSchema.index({ author: 1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ flair: 1, createdAt: -1 });

module.exports = mongoose.model('Post', postSchema);
