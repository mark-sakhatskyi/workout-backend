const Workout = require('../models/Workout');
const { dateFilter, validDate, fail } = require('../middleware/validation');

exports.getWorkouts = async (req, res) => {
    try {
        const workouts = await Workout.find({ userId: req.userId, ...dateFilter(req.query) }).sort({ date: -1, _id: 1 });
        res.json(workouts);
    } catch (err) {
        fail(res, err);
    }
};

exports.addWorkout = async (req, res) => {
    try {
        const { date, name, weight, sets, reps, _id, difficulty } = req.body;
        const workout = await Workout.create({ userId: req.userId, date, name, weight, sets, reps, _id, difficulty });
        res.status(201).json(workout);
    } catch (err) {
        fail(res, err);
    }
};

exports.updateWorkout = async (req, res) => {
    try {
        const { date, name, weight, sets, reps, difficulty } = req.body;
        const workout = await Workout.findById(req.params.id);

        if (!workout) {
            return res.status(404).json({ message: 'Workout not found' });
        }

        if (workout.userId.toString() !== req.userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        if (name !== undefined) workout.name = name;
        if (weight !== undefined) workout.weight = weight;
        if (sets !== undefined) workout.sets = sets;
        if (reps !== undefined) workout.reps = reps;
        if (date !== undefined) workout.date = date;
        if (difficulty !== undefined) workout.difficulty = difficulty;

        await workout.save();

        res.json(workout);

    } catch (err) {
        fail(res, err);
    }
}

exports.deleteWorkout = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await Workout.deleteOne({ _id: id, userId: req.userId });
        if (!result.deletedCount) return res.status(404).json({ message: 'Record not found' });
        res.json({ message: 'Workout deleted' });
    } catch (err) {
        fail(res, err);
    }
};
