require('dotenv').config();
const mongoose = require('mongoose');
if (!process.env.MONGO_URI || !process.env.JWT_SECRET) throw new Error('Missing database or JWT configuration');
const app = require('./app');


const PORT = process.env.PORT || 4000;

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('MongoDB connected');
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch(err => { console.error('Database connection failed:', err.name); process.exit(1); });
