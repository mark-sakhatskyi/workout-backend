const mongoose = require('mongoose');

const customGoalSchema = new mongoose.Schema({
    label: { type: String, required: true },
    currentValue: { type: Number, default: null },
    targetValue: { type: Number, default: null },
    unit: { type: String, default: '' },
}, { _id: true });

const goalSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User', unique: true },
    goalDirection: { type: String, enum: ['cut', 'gain', 'maintain', null], default: null },
    manualCalories: { type: Number, min: 1, max: 20000, default: null },
    manualProtein: { type: Number, min: 1, max: 1000, default: null },
    targetWeight: { type: Number, min: 0, default: null },
    targetBodyFat: { type: Number, min: 0, max: 100, default: null },
    targetMuscleMass: { type: Number, default: null },
    targetBmi: { type: Number, default: null },
    targetCaloriesPerDay: { type: Number, default: null },
    targetProteinPerDay: { type: Number, default: null },
    targetWaterPerDay: { type: Number, default: null },
    targetWorkoutsPerWeek: { type: Number, min: 0, max: 7, default: null },
    targetDate: { type: Date, default: null },
    notes: { type: String, default: '' },
    customGoals: [customGoalSchema],
}, { timestamps: true });

module.exports = mongoose.model('Goal', goalSchema);
