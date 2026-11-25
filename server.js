require('dotenv').config();
const mongoose = require('mongoose');
if (!process.env.MONGO_URI || !process.env.JWT_SECRET) throw new Error('Missing database or JWT configuration');
mongoose.set('bufferCommands', false);
const app = require('./app');
const PORT = process.env.PORT || 4000;

// Keep the HTTP server responsive when Atlas is unavailable. No API requests
// are accepted until the original database connection is ready.
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
async function connect() {
    try {
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
        console.log('MongoDB connected');
    } catch (err) {
        const code = typeof err.code === 'string' && /^[A-Z_]+$/.test(err.code) ? err.code : err.name;
        console.error('Database connection failed:', code, '— retry in 30s');
        setTimeout(connect, 30000);
    }
}
connect();
mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
