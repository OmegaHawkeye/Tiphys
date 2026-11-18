import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type LinearAutopilotRunSummary, ThreadId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import * as Effect from "effect/Effect";
import { useEffect, useState } from "react";

import { PrimaryEnvironmentHttpClient } from "../../environments/primary/httpClient";
import { runPrimaryHttp } from "../../lib/runtime";
import { cn } from "../../lib/utils";
import { buildThreadRouteParams } from "../../threadRoutes";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { ActiveAutopilotEntry } from "./activeAutopilots.logic";

const POLL_INTERVAL_MS = 15_000;

const loadActiveRuns = () =>
  runPrimaryHttp(
    PrimaryEnvironmentHttpClient.pipe(
      Effect.flatMap((client) => client.linearAutopilot.listActiveRuns({ headers: {} })),
    ),
  );

/**
 * Active autopilot runs across all projects, polled while the sidebar is mounted. Returns an
 * empty list when the server has none or can't be reached, so the shelf simply hides.
 */
export function useActiveAutopilotRuns(): ReadonlyArray<LinearAutopilotRunSummary> {
  const [runs, setRuns] = useState<ReadonlyArray<LinearAutopilotRunSummary>>([]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- polls the server's active autopilot runs.
  useEffect(() => {
    let active = true;
    const refresh = () =>
      void loadActiveRuns().then(
        (result) => {
          if (active) setRuns(result);
        },
        () => {
          if (active) setRuns([]);
        },
      );
    refresh();
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  return runs;
}

export function ActiveAutopilotRow(props: {
  entry: ActiveAutopilotEntry;
  environmentId: Parameters<typeof scopeThreadRef>[0] | null;
}) {
  const { run, status } = props.entry;
  const content = (
    <>
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full", status.needsYou ? "bg-warning" : "bg-info")}
      />
      <span className="shrink-0 text-muted-foreground tabular-nums">
        {run.identifier ?? "Ticket"}
      </span>
      <span className="min-w-0 flex-1 truncate">{run.title ?? "Untitled ticket"}</span>
      <span
        className={cn(
          "shrink-0 text-xs",
          status.needsYou ? "text-warning-foreground" : "text-muted-foreground",
        )}
      >
        {status.label}
      </span>
    </>
  );
  const className =
    "mx-0.5 flex h-7 items-center gap-2 rounded-md px-2 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
  const target =
    run.threadId !== null && props.environmentId !== null ? (
      <Link
        className={className}
        to="/$environmentId/$threadId"
        params={buildThreadRouteParams(
          scopeThreadRef(props.environmentId, ThreadId.make(run.threadId)),
        )}
      />
    ) : (
      <div className={className} />
    );
  return (
    <li className="list-none" data-testid="sidebar-active-autopilot-row">
      <Tooltip>
        <TooltipTrigger render={target}>{content}</TooltipTrigger>
        <TooltipPopup side="right" className="max-w-80">
          {status.detail}
        </TooltipPopup>
      </Tooltip>
    </li>
  );
}
