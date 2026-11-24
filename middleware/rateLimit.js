// Process-local limiter. For multiple instances, use a shared store.
module.exports = ({ windowMs = 900000, limit = 30 } = {}) => {
    const entries = new Map();
    return (req, res, next) => {
        const now = Date.now();
        if (entries.size >= 10000) {
            for (const [key, entry] of entries) if (entry.until <= now) entries.delete(key);
            if (entries.size >= 10000 && !entries.has(req.ip)) return res.status(503).json({ message: 'Try again later' });
        }
        let entry = entries.get(req.ip);
        if (!entry || entry.until <= now) { entry = { count: 0, until: now + windowMs }; entries.set(req.ip, entry); }
        if (++entry.count > limit) {
            res.set('Retry-After', String(Math.ceil((entry.until - now) / 1000)));
            return res.status(429).json({ message: 'Too many requests' });
        }
        next();
    };
};
