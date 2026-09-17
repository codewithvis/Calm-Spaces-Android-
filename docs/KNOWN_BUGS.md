# Known Bugs and Migration Risks

This list records code-level findings from the repository. Production crash logs, Play Store reviews, and the live Supabase schema are still required before declaring the release safe.

## P0: Data integrity and privacy

- Booking previously inserted directly into `book_request` and changed availability in a separate flow. Concurrent requests could create duplicate or stale bookings.
- Messages and mood entries still use direct client table access in existing screens. They do not yet have the canonical session membership, message deduplication, or mood idempotency boundary.
- Existing expert and peer workflows directly update booking status and availability. They remain outside the new student booking gateway until their state transitions are migrated.

## P1: Architecture gaps

- The repository does not contain a reproducible baseline schema for `book_request`, `expert_schedule`, `student_schedule`, `messages`, or `mood_entries`; these tables must be inventoried in staging before canonical backfill.
- The new booking gateway is a compatibility step over legacy tables. It requires the migration to run against an environment where those tables already exist.
- `send-push` authenticates the caller but does not authorize whether the caller may notify the requested users.

## Required evidence before production rollout

- Export current table definitions, RLS policies, and row counts from staging.
- Capture crash/ANR reports and Play Store review complaints, then replace inferred priorities with observed failures.
- Run concurrent booking, retry, RLS-negative, and realtime reconnect tests with real JWTs in staging.