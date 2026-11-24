const mongoose = require('mongoose');
const { validDate } = require('../middleware/validation');

const commentSchema = new mongoose.Schema({
    text: { type: String, required: true },
    date: { type: String, required: true, validate: validDate },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    _id: { type: String, required: true },
}, { timestamps: true });

commentSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model('Comment', commentSchema);
