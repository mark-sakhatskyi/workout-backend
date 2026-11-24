const express = require('express');
const router = express.Router();
const { register, login, googleAuth, getProfile, updateProfile, allUsers, logout, getBodyMetricsHistory } = require('../controllers/authController');
const auth = require('../middleware/authMiddleware');
const authLimit = require('../middleware/rateLimit')();

router.post('/register', authLimit, register);
router.post('/login', authLimit, login);
router.post('/google', authLimit, googleAuth);
router.post('/logout', auth, logout);
router.get('/profile', auth, getProfile);
router.put('/profile', auth, updateProfile);
router.get('/allUsers', auth, allUsers);
router.get('/body-metrics-history', auth, getBodyMetricsHistory);

module.exports = router;
