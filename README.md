# Workout Tracker backend

Node.js / Express / Mongoose / MongoDB. PostgreSQL migration cancelled; existing MongoDB is retained. AI endpoints are removed; historical AI documents are not deleted.

## Development
Set MONGO_URI and JWT_SECRET in .env; optionally CORS_ORIGINS, GOOGLE_CLIENT_ID and PORT. Never commit credentials. Set TRUST_PROXY=1 only after verifying the proxy topology.
Run npm ci, npm test, npm run dev. Production: npm start.

The schema changes are additive (manual goal fields, tokenVersion, indexes and sparse new metric records). Existing IDs and collections are retained. Back up MongoDB before deployment; no destructive migration is needed. Old metric records remain unchanged. Logout invalidates all previous tokens for that user.

Integration tests run only with TEST_MONGO_URI set to a disposable MongoDB instance. CI uses its own MongoDB service, never production.
