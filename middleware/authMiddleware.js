const jwt = require('jsonwebtoken');
const User = require('../models/User');
module.exports = async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '');
    if (!match) return res.status(401).json({ message: 'Unauthorized' });
    let decoded;
    try {
        decoded = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
        if (typeof decoded.userId !== 'string' || !/^[a-f\d]{24}$/i.test(decoded.userId)) throw new Error('Invalid subject');
    } catch { return res.status(401).json({ message: 'Invalid token' }); }
    try {
        const user = await User.findById(decoded.userId).select('+tokenVersion');
        if (!user || (decoded.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) return res.status(401).json({ message: 'Invalid token' });
        req.userId = decoded.userId;
        next();
    } catch (err) { next(err); }
};
