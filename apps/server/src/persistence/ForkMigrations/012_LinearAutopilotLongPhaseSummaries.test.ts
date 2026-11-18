import { assert, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

import { runForkMigrations } from "../ForkMigrations.ts";
import { runMigrations } from "../Migrations.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layer({ filename: ":memory:" })));

layer("012_LinearAutopilotLongPhaseSummaries", (it) => {
  it.effect("keeps existing attempts and accepts summaries past 4,000 characters", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations();
      yield* runForkMigrations(11);
      yield* sql`INSERT INTO linear_autopilot_issues (
        workspace_id, issue_id, identifier, title, url, description, t3_project_id,
        source_updated_at, snapshot_hash, created_at
      ) VALUES ('team', 'issue', 'OME-1', 'Old', 'https://linear.app/OME-1', '', 'project',
        '2026-10-20T12:00:00.000Z', 'hash', '2026-10-20T12:00:00.000Z')`;
      yield* sql`INSERT INTO linear_autopilot_runs (
        run_id, workspace_id, issue_id, project_id, generation, state,
        source_updated_at, snapshot_hash, created_at, updated_at
      ) VALUES ('run', 'team', 'issue', 'project', 1, 'planning',
        '2026-10-20T12:00:00.000Z', 'hash', '2026-10-20T12:00:00.000Z', '2026-10-20T12:00:00.000Z')`;
      yield* sql`INSERT INTO linear_autopilot_phase_attempts (
        attempt_id, run_id, phase, attempt_number, command_id, status, started_at, summary
      ) VALUES ('old', 'run', 'planning', 1, 'command-old', 'succeeded',
        '2026-10-20T12:00:00.000Z', 'Short plan')`;
      const tooLongBefore = yield* sql`INSERT INTO linear_autopilot_phase_attempts (
        attempt_id, run_id, phase, attempt_number, command_id, status, started_at, summary
      ) VALUES ('long', 'run', 'review', 1, 'command-long', 'succeeded',
        '2026-10-20T12:00:00.000Z', ${"x".repeat(5000)})`.pipe(Effect.result);
      assert.equal(tooLongBefore._tag, "Failure");

      yield* runForkMigrations(12);

      yield* sql`INSERT INTO linear_autopilot_phase_attempts (
        attempt_id, run_id, phase, attempt_number, command_id, status, started_at, summary
      ) VALUES ('long', 'run', 'review', 1, 'command-long', 'succeeded',
        '2026-10-20T12:00:00.000Z', ${"x".repeat(5000)})`;
      const rows = yield* sql<{ readonly attempt_id: string; readonly size: number }>`
        SELECT attempt_id, length(summary) AS size
        FROM linear_autopilot_phase_attempts ORDER BY attempt_id
      `;
      assert.deepEqual(rows, [
        { attempt_id: "long", size: 5000 },
        { attempt_id: "old", size: 10 },
      ]);
      const indexes = yield* sql<{ readonly name: string }>`
        SELECT name FROM sqlite_master
        WHERE type = 'index' AND name = 'idx_linear_autopilot_phase_attempts_recovery'
      `;
      assert.equal(indexes.length, 1);
    }),
  );
});
