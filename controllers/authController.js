const User = require('../models/User');
const Goal = require('../models/Goal');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { estimateEffectiveMacros } = require('../services/macroEstimator');
const { latestMetrics, metricChanges, sorted } = require('../services/bodyMetrics');
const { validDate } = require('../middleware/validation');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validPassword = password => typeof password === 'string' && password.length >= 6 && Buffer.byteLength(password) <= 72;
const issueToken = user => jwt.sign({ userId: user._id.toString(), tokenVersion: user.tokenVersion ?? 0 }, process.env.JWT_SECRET, { expiresIn: '7d', algorithm: 'HS256' });


exports.register = async (req, res) => {
    try {
        const {name, email, password} = req.body;
        if (typeof name !== 'string' || !name.trim() || name.length > 100 || typeof email !== 'string' || email.length > 254 || !emailPattern.test(email) || !validPassword(password)) return res.status(400).json({ message: 'Invalid registration data' });
        const existingUser = await User.findOne({email});
        if (existingUser) return res.status(400).json({message: 'User already exists'});

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({name: name.trim(), email, password: hashedPassword});

        const token = issueToken(user);
        user.isOnline = true;
        await user.save();

        res.status(201).json({token, user: {id: user._id, name: user.name, email: user.email}});
    } catch (err) {
        res.status((err.status === 400 || err.name === 'ValidationError') ? 400 : err.code === 11000 ? 409 : 500).json({message: (err.status === 400 || err.name === 'ValidationError') ? 'Invalid data' : err.code === 11000 ? 'Account already exists' : 'Internal server error'});
    }
};

exports.login = async (req, res) => {
    try {
        const {email, password} = req.body;
        if (typeof email !== 'string' || typeof password !== 'string' || Buffer.byteLength(password) > 72) return res.status(400).json({ message: 'Invalid credentials' });
        const user = await User.findOne({email}).select('+tokenVersion');
        if (!user) return res.status(400).json({message: 'Invalid credentials'});

        // If user registered via Google and has no password
        if (!user.password) {
            return res.status(400).json({message: 'Цей акаунт створено через Google. Використовуйте вхід через Google.'});
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({message: 'Invalid credentials'});

        const token = issueToken(user);
        user.isOnline = true;
        await user.save();

        res.json({token, user: {id: user._id, name: user.name, email: user.email}});
    } catch (err) {
        res.status((err.status === 400 || err.name === 'ValidationError') ? 400 : err.code === 11000 ? 409 : 500).json({message: (err.status === 400 || err.name === 'ValidationError') ? 'Invalid data' : err.code === 11000 ? 'Account already exists' : 'Internal server error'});
    }
};

exports.googleAuth = async (req, res) => {
    try {
        const { credential } = req.body;
        if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ message: 'Google authentication disabled' });
        if (typeof credential !== 'string' || !credential) {
            return res.status(400).json({ message: 'Google credential is required' });
        }

        // Verify the Google ID token
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture } = payload;

        if (!email || payload.email_verified !== true) {
            return res.status(400).json({ message: 'Google account has no email' });
        }

        // Find existing user by googleId or email
        let user = await User.findOne({ googleId }).select('+tokenVersion');
        if (!user && await User.findOne({ email })) return res.status(409).json({ message: 'Sign in to your existing account before linking Google' });

        if (user) {
            // Link Google to existing local account if not yet linked
            if (!user.googleId) {
                user.googleId = googleId;
                user.authProvider = user.authProvider === 'local' ? 'local' : 'google';
                if (picture && !user.avatar) user.avatar = picture;
            }
            user.isOnline = true;
            await user.save();
        } else {
            // Create a new user (no password needed for Google users)
            user = await User.create({
                name: name || email.split('@')[0],
                email,
                googleId,
                avatar: picture || '',
                authProvider: 'google',
                isOnline: true,
            });
        }

        const token = issueToken(user);

        res.json({
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
            },
        });
    } catch (err) {
        console.error('Google auth error:', err);
        res.status(401).json({ message: 'Google authentication failed' });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('-password');
        if (!user) return res.status(404).json({message: 'User not found'});

        const userObj = user.toObject();
        delete userObj.googleId;
        delete userObj.tokenVersion;
        userObj.latestBodyMetrics = latestMetrics(userObj.bodyMetrics);

        if (Array.isArray(userObj.bodyMetrics)) {
            userObj.bodyMetrics.sort((a, b) => new Date(b.date) - new Date(a.date));
            userObj.bodyMetrics = userObj.bodyMetrics.slice(0, 5);
        }

        res.json(userObj);
    } catch (err) {
        console.error(err);
        res.status((err.status === 400 || err.name === 'ValidationError') ? 400 : err.code === 11000 ? 409 : 500).json({message: (err.status === 400 || err.name === 'ValidationError') ? 'Invalid data' : err.code === 11000 ? 'Account already exists' : 'Internal server error'});
    }
};


exports.updateProfile = async (req, res) => {
    try {
        const {name, birthDate, height, gender, activityLevel, jobType, workoutsPerWeek, dailyActivity, bodyMetrics} = req.body;

        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({message: 'User not found'});

        if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 100)) return res.status(400).json({ message: 'Invalid name' });
        if (birthDate !== undefined && birthDate !== '' && !validDate(birthDate)) return res.status(400).json({ message: 'Invalid birth date' });
        if (height !== undefined && height !== null && (typeof height !== 'number' || !Number.isFinite(height) || height <= 0 || height > 300)) return res.status(400).json({ message: 'Invalid height' });
        if (workoutsPerWeek !== undefined && (!Number.isInteger(workoutsPerWeek) || workoutsPerWeek < 0 || workoutsPerWeek > 7)) return res.status(400).json({ message: 'Invalid workout frequency' });
        if (name !== undefined) user.name = name.trim();
        if (birthDate !== undefined) user.birthDate = birthDate;
        if (gender !== undefined) user.gender = gender;
        if (height !== undefined) user.height = height;
        if (activityLevel !== undefined) user.activityLevel = activityLevel;
        if (jobType !== undefined) user.jobType = jobType;
        if (workoutsPerWeek !== undefined) user.workoutsPerWeek = workoutsPerWeek;
        if (dailyActivity !== undefined) user.dailyActivity = dailyActivity;

        if (!Array.isArray(user.bodyMetrics)) {
            user.bodyMetrics = [];
        }

        if (bodyMetrics !== undefined) {
            const delta = metricChanges(user.bodyMetrics, bodyMetrics);
            if (Object.keys(delta).length) user.bodyMetrics.push({ date: new Date(), ...delta });
        }

        await user.save();
        const last10Metrics = sorted(user.bodyMetrics).slice(0, 10);

        // ── Live-recalculate macro targets after ANY change that affects TDEE ──
        // Triggers: body metrics, jobType, workoutsPerWeek, dailyActivity, height, gender, birthDate
        let macroRecalcResult = null;
        try {
            const goal = await Goal.findOne({ userId: req.userId });
            if (goal) {
                // Use the full saved user document (after .save()) — same data source as goalController
                const freshUser = await User.findById(req.userId)
                    .select('bodyMetrics height gender birthDate jobType workoutsPerWeek dailyActivity')
                    .lean();
                const macros = estimateEffectiveMacros(freshUser, goal);

                if (macros.calories && macros.protein) {
                    macroRecalcResult = {
                        method: macros.method,
                        goalDirection: macros.goalDirection,
                        targetCaloriesPerDay: macros.calories,
                        targetProteinPerDay:  macros.protein,
                        tdee: macros.tdee || null,
                        calorieAdjustment: macros.calorieAdjustment ?? null,
                    };
                }
            }
        } catch (macroErr) {
            console.error('Macro recalc after profile update failed:', macroErr);
        }

        res.json({
            id: req.userId,
            name: user.name,
            email: user.email,
            birthDate: user.birthDate,
            height: user.height,
            gender: user.gender,
            activityLevel: user.activityLevel,
            jobType: user.jobType,
            workoutsPerWeek: user.workoutsPerWeek,
            dailyActivity: user.dailyActivity,
            bodyMetrics: last10Metrics,
            latestBodyMetrics: latestMetrics(user.bodyMetrics),
            ...(macroRecalcResult ? { _macroRecalc: macroRecalcResult } : {}),
        });

    } catch (err) {
        console.error(err);
        res.status((err.status === 400 || err.name === 'ValidationError') ? 400 : err.code === 11000 ? 409 : 500).json({message: (err.status === 400 || err.name === 'ValidationError') ? 'Invalid data' : err.code === 11000 ? 'Account already exists' : 'Internal server error'});
    }
};

exports.allUsers = (req, res) => res.status(403).json({ message: 'User directory disabled' });

exports.logout = async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        await User.updateOne({ _id: req.userId }, { $inc: { tokenVersion: 1 }, $set: { isOnline: false } });

        res.json({ message: 'Logout successful' });
    } catch (err) {
        console.error('Logout error:', err);
        res.status(500).json({ message: 'Logout failed' });
    }
};

exports.getBodyMetricsHistory = async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('bodyMetrics');
        if (!user) return res.status(404).json({ message: 'User not found' });

        const metrics = (user.bodyMetrics || [])
            .slice()
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        res.json(metrics);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
