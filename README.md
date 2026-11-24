# Workout Tracker backend

The legacy MongoDB API remains available with `npm start` while preparing the migration. The PostgreSQL API uses the same REST paths (except the removed AI API and disabled user directories).

## Safe migration

1. Create a dedicated PostgreSQL instance. Do not use expiring free storage for the only copy of production data. Back up MongoDB and test restore.
2. Set `MONGO_URI` (source), `DATABASE_URL` (target), `JWT_SECRET` (keep existing secret during cutover), and `CORS_ORIGINS` via environment variables, never Git. Set `TRUST_PROXY=1` only after verifying Render's proxy behavior.
3. Run `npm ci`, `npm test` and `npm run db:migrate:mongo` to inspect source counts without writing.
4. Freeze all source writes, verify the backup, and run `CONFIRM_MONGO_READ_ONLY_WINDOW=1 npm run db:migrate:mongo -- --apply`. Import is transactional, refuses nonempty target, preserves Mongo and nanoid IDs, password hashes, records and body-metric history, checks counts. Invalid legacy dates or orphaned rows abort the transaction. Old AI results remain in the Mongo backup only.
5. Run `npm run start:postgres` on a staging service, verify login, profile, workout/cardio/meal/comment CRUD, goal calculations, calendar/statistics and record totals against the source.
6. Switch Render start command to `npm run start:postgres` only after successful staging, with `DATABASE_URL` configured. Keep Mongo backup and old deployment available. If rollback is needed after new writes, export/reconcile PostgreSQL changes first to avoid data loss.
7. For an intentional fresh development database only, run `npm run db:schema` then `ALLOW_EMPTY_POSTGRES=1 npm run start:postgres`.

The initial SQL layout uses relational ownership, date columns, foreign keys and indexes, with JSONB payloads preserving legacy field shapes. A later migration may normalize individual domain fields after reviewing actual records. The API does not need MongoDB for normal PostgreSQL operation. Mongoose remains solely for the legacy rollback server and import script.

Never share real credentials in issues or commits. Free Render PostgreSQL expires; configure a durable target before production migration.
