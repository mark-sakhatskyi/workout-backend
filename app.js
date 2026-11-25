const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const workoutRoutes = require('./routes/workoutRoutes');
const commentRoutes = require('./routes/commentRoutes');
const userRoutes = require('./routes/userRoutes');
const newsRoutes = require('./routes/newsRoutes');
const mealRoutes = require('./routes/mealRoutes');
const goalRoutes = require('./routes/goalRoutes');
const cardioRoutes = require('./routes/cardioRoutes');

const app = express();

const origins = new Set((process.env.CORS_ORIGINS || 'https://workout-frontend-935r.onrender.com,http://localhost:5173').split(',').map(s => s.trim()));
app.use(cors({ origin: (origin, cb) => cb(null, !origin || origins.has(origin)) }));
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use(express.json({ limit: '128kb' }));

app.use('/api', (req, res, next) => {
    if (require('mongoose').connection.readyState !== 1) {
        res.set('Retry-After', '30');
        return res.status(503).json({ message: 'Database temporarily unavailable' });
    }
    next();
});
app.use('/api/auth', authRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/user', userRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/meals', mealRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/cardio', cardioRoutes);

app.get('/health', (req, res) => {
    const ready = require('mongoose').connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'unavailable' });
});
app.use((req, res) => res.status(404).json({ message: 'Not found' }));
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON' });
    if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Payload too large' });
    console.error(err.name || 'Error');
    res.status(500).json({ message: 'Internal server error' });
});
module.exports = app;

