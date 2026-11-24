// Disabled pending explicit user consent for any public directory.
exports.getAllUsers = (req, res) => res.status(403).json({ message: 'User directory disabled' });
