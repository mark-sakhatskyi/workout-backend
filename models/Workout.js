const mongoose = require('mongoose');
const { validDate } = require('../middleware/validation');

const workoutSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    name: { type: String, required: true },
    weight: { type: Number, required: true, min: 0 },
    reps: { type: Number, required: true, min: 1, validate: Number.isInteger },
    sets: { type: Number, required: true, min: 1, validate: Number.isInteger },
    date: { type: String, required: true, validate: validDate },
    _id: { type: String, required: true },
    difficulty: {
        type: String,
        enum: ['easy', 'hard', ''],
        default: ''
    }
}, { timestamps: true });

workoutSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model('Workout', workoutSchema);
