const express = require('express');
const router = express.Router();
const { getAllUsers } = require('../controllers/userController');

router.get('/', require('../middleware/authMiddleware'), getAllUsers);

module.exports = router;
