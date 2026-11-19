import { isShownUnderParent } from "@t3tools/client-runtime/state/threads";
import { EnvironmentId, ThreadId, type LinearAutopilotRunSummary } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  activeAutopilotStatus,
  sortActiveAutopilots,
  withAutopilotThreadKeys,
} from "./activeAutopilots.logic.ts";

const run = (overrides: Partial<LinearAutopilotRunSummary>): LinearAutopilotRunSummary => ({
  runId: "run",
  revision: 1,
  source: "linear",
  state: "planning",
  projectId: null,
  identifier: "OME-1",
  title: "Ticket",
  url: null,
  workflow: null,
  threadId: "thread",
  threadIds: ["thread"],
  stopReason: null,
  updatedAt: "2026-11-18T08:00:00.000Z",
  ...overrides,
});

describe("activeAutopilotStatus", () => {
  it("names the phase while the agent works", () => {
    expect(activeAutopilotStatus(run({ state: "planning" }), "working").label).toBe("Planning");
    expect(activeAutopilotStatus(run({ state: "reviewing" }), "working").label).toBe("Reviewing");
    expect(activeAutopilotStatus(run({ state: "delivering" }), null).label).toBe("Opening PR");
    expect(activeAutopilotStatus(run({ state: "planning" }), "working").needsYou).toBe(false);
  });

  it("asks for you when the run paused, waits on approval, or its agent asks a question", () => {
    const paused = activeAutopilotStatus(
      run({ state: "paused", stopReason: "The review agent hit the provider's usage limit." }),
      null,
    );
    expect(paused).toMatchObject({ label: "Needs you", needsYou: true });
    expect(paused.detail).toContain("usage limit");

    expect(activeAutopilotStatus(run({ state: "needs_approval" }), null)).toMatchObject({
      label: "Needs you",
      detail: "Approve the reviewed plan.",
    });
    expect(activeAutopilotStatus(run({ state: "planning" }), "input")).toMatchObject({
      label: "Needs you",
      detail: "The planning agent asked you a question.",
    });
    expect(activeAutopilotStatus(run({ state: "implementing" }), "approval")).toMatchObject({
      label: "Needs you",
      detail: "The implementing agent needs your permission.",
    });
  });
});

describe("sortActiveAutopilots", () => {
  it("puts runs that need you first, then the most recently updated", () => {
    const sorted = sortActiveAutopilots(
      [
        run({ runId: "old", updatedAt: "2026-11-18T07:00:00.000Z" }),
        run({ runId: "new", updatedAt: "2026-11-18T09:00:00.000Z" }),
        run({ runId: "paused", state: "paused", updatedAt: "2026-11-17T09:00:00.000Z" }),
      ],
      () => "working",
    );
    expect(sorted.map((entry) => entry.run.runId)).toEqual(["paused", "new", "old"]);
  });
});

describe("withAutopilotThreadKeys", () => {
  it("lists every phase thread of an active run under the run, not in the thread lists", () => {
    const environmentId = EnvironmentId.make("env");
    const keys = withAutopilotThreadKeys(
      [run({ threadIds: ["plan", "review"] })],
      environmentId,
      new Set(),
    );
    const lineage = (id: string) => ({
      parentThreadId: null,
      relationshipToParent: null,
      rootThreadId: ThreadId.make(id),
    });
    const shown = (id: string) =>
      isShownUnderParent({ environmentId, threadId: ThreadId.make(id) }, lineage(id), keys);
    expect([shown("plan"), shown("review"), shown("other")]).toEqual([true, true, false]);
  });
});
