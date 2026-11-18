import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

// Plans and reviews often run past 4,000 characters. SQLite cannot change a
// CHECK constraint in place, so rebuild the table with a 20,000 limit.
// Nothing references this table, so the rebuild is safe with foreign keys on.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE linear_autopilot_phase_attempts_next (
      attempt_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      phase TEXT NOT NULL CHECK (phase IN (
        'planning', 'review', 'implementation', 'verification', 'repair', 'delivery'
      )),
      attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
      command_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN (
        'pending', 'running', 'succeeded', 'failed', 'unknown'
      )),
      thread_id TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      summary TEXT CHECK (summary IS NULL OR length(summary) <= 20000),
      UNIQUE (run_id, phase, attempt_number),
      FOREIGN KEY (run_id) REFERENCES linear_autopilot_runs(run_id) ON DELETE CASCADE
    )
  `;
  yield* sql`
    INSERT INTO linear_autopilot_phase_attempts_next (
      attempt_id, run_id, phase, attempt_number, command_id, status,
      thread_id, started_at, finished_at, summary
    )
    SELECT
      attempt_id, run_id, phase, attempt_number, command_id, status,
      thread_id, started_at, finished_at, summary
    FROM linear_autopilot_phase_attempts
  `;
  yield* sql`DROP TABLE linear_autopilot_phase_attempts`;
  yield* sql`ALTER TABLE linear_autopilot_phase_attempts_next RENAME TO linear_autopilot_phase_attempts`;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_linear_autopilot_phase_attempts_recovery
    ON linear_autopilot_phase_attempts(status, started_at, attempt_id)
    WHERE status IN ('pending', 'running', 'unknown')
  `;
});
