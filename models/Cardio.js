const mongoose = require('mongoose');
const { validDate } = require('../middleware/validation');

const cardioSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    date: {
        type: String, // YYYY-MM-DD format
        validate: validDate,
        required: true,
    },
    type: {
        type: String,
        required: true,
        enum: ['running', 'cycling', 'swimming', 'walking', 'rowing', 'elliptical', 'stair_climber', 'jump_rope', 'hiking', 'other'],
    },
    customType: {
        type: String, // For 'other' type
    },
    duration: {
        type: Number, // minutes
        min: 0.001,
        required: true,
    },
    distance: {
        type: Number, // km
        min: 0,
    },
    avgHeartRate: {
        type: Number, // bpm
        min: 0,
    },
    maxHeartRate: {
        type: Number, // bpm
        min: 0,
    },
    calories: {
        type: Number, // kcal burned
        min: 0,
    },
    avgPace: {
        type: Number, // min/km
        min: 0,
    },
    avgSpeed: {
        type: Number, // km/h
        min: 0,
    },
    elevation: {
        type: Number, // meters
    },
    notes: {
        type: String,
    },
}, {
    timestamps: true,
});

// Index for faster queries
cardioSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model('Cardio', cardioSchema);
