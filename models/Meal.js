const mongoose = require('mongoose');
const { validDate } = require('../middleware/validation');

const mealSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    name: { type: String, required: true },
    calories: { type: Number, required: true, min: 0 },
    protein: { type: Number, required: true, min: 0 },
    fats: { type: Number, required: true, min: 0 },
    carbs: { type: Number, required: true, min: 0 },
    grams: { type: Number, default: 100, min: 0 },
    date: { type: String, required: true, validate: validDate },
    _id: { type: String, required: true },
}, { timestamps: true });

mealSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model('Meal', mealSchema);
