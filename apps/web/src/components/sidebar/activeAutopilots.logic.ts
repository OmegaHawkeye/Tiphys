import type { LinearAutopilotRunState, LinearAutopilotRunSummary } from "@t3tools/contracts";

import type { SidebarThreadStatus } from "../Sidebar.logic";

export interface ActiveAutopilotStatus {
  readonly label: string;
  /** One sentence for the row's tooltip; why it needs you, when it does. */
  readonly detail: string;
  readonly needsYou: boolean;
}

const PHASE_LABELS: Record<LinearAutopilotRunState, string> = {
  queued: "Queued",
  planning: "Planning",
  reviewing: "Reviewing",
  needs_approval: "Needs you",
  approved: "Approved",
  implementing: "Implementing",
  verifying: "Verifying",
  delivering: "Opening PR",
  paused: "Needs you",
  delivered: "Delivered",
  failed: "Failed",
  cancelled: "Cancelled",
};

const needsYou = (detail: string): ActiveAutopilotStatus => ({
  label: "Needs you",
  detail,
  needsYou: true,
});

/**
 * What an active run is doing, from its state and the live status of its current agent
 * thread. A paused run, a plan awaiting approval, or an agent waiting on a question or
 * permission all need a human.
 */
export function activeAutopilotStatus(
  run: LinearAutopilotRunSummary,
  threadStatus: SidebarThreadStatus | null,
): ActiveAutopilotStatus {
  if (run.state === "paused") return needsYou(run.stopReason ?? "The run paused.");
  if (run.state === "needs_approval") return needsYou("Approve the reviewed plan.");
  const phase = PHASE_LABELS[run.state].toLowerCase();
  if (threadStatus === "input") return needsYou(`The ${phase} agent asked you a question.`);
  if (threadStatus === "approval") return needsYou(`The ${phase} agent needs your permission.`);
  if (threadStatus === "limited") return needsYou(`The ${phase} agent hit its usage limit.`);
  return {
    label: PHASE_LABELS[run.state],
    detail: `${run.identifier ?? "Ticket"}: ${PHASE_LABELS[run.state]}`,
    needsYou: false,
  };
}

export interface ActiveAutopilotEntry {
  readonly run: LinearAutopilotRunSummary;
  readonly status: ActiveAutopilotStatus;
}

/** Runs that need you first, then the most recently updated. */
export function sortActiveAutopilots(
  runs: ReadonlyArray<LinearAutopilotRunSummary>,
  threadStatusOf: (run: LinearAutopilotRunSummary) => SidebarThreadStatus | null,
): ReadonlyArray<ActiveAutopilotEntry> {
  return runs
    .map((run) => ({ run, status: activeAutopilotStatus(run, threadStatusOf(run)) }))
    .toSorted(
      (left, right) =>
        Number(right.status.needsYou) - Number(left.status.needsYou) ||
        right.run.updatedAt.localeCompare(left.run.updatedAt),
    );
}
