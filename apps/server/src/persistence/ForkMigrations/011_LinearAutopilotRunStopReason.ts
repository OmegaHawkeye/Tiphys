import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

// Why a run paused, failed, or was cancelled, so operators see it without reading logs.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE linear_autopilot_runs ADD COLUMN stop_reason TEXT`;
});
