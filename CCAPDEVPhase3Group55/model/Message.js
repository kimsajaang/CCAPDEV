// model/Message.js - Chat message schema
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderName: {
      type: String,
      required: true,
    },
    senderAvatar: {
      type: String,
      default: 'https://ui-avatars.com/api/?name=User&background=5383E8&color=fff',
    },
    chatRoom: {
      type: String, // 'general' for global chat, or groupChatId for group chats
      required: true,
      index: true,
    },
    text: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    edited: {
      type: Boolean,
      default: false,
    },
    editedAt: Date,
  },
  { timestamps: true }
);

// Index for efficient queries
messageSchema.index({ chatRoom: 1, timestamp: -1 });

module.exports = mongoose.model('Message', messageSchema);
