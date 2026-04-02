// model/User.js - User schema and model
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      default: null,
    },
    emailVerificationTokenExpiry: {
      type: Date,
      default: null,
    },
    googleId: {
      type: String,
      default: '',
    },
    password: {
      type: String,
      required: true,
    },
    displayName: {
      type: String,
      default: function () {
        return this.username;
      },
    },
    bio: {
      type: String,
      default: 'No bio yet',
    },
    avatar: {
      type: String,
      default: 'https://ui-avatars.com/api/?name=User&background=5383E8&color=fff',
    },
    wallpaper: {
      type: String,
      default: '',
    },
    wallpaperPosition: {
      type: Number,
      default: 50,
    },
    favoriteGames: {
      type: [mongoose.Schema.Types.Mixed], // array of game objects { id, name, cover }
      default: [],
    },
    steamId: {
      type: String,
      default: '',
    },
    xboxGamertag: {
      type: String,
      default: '',
    },
    psnId: {
      type: String,
      default: '',
    },
    friends: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    friendRequests: [{
      from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
      createdAt: { type: Date, default: Date.now },
    }],
    settings: {
      privacy: { type: String, enum: ['public', 'private'], default: 'public' },
      defaultSort: { type: String, enum: ['date_added', 'playtime', 'rating'], default: 'date_added' },
      emailNotifs: {
        friendRequests: { type: Boolean, default: true },
        chatMessages: { type: Boolean, default: true },
        marketing: { type: Boolean, default: false }
      }
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
