import type { LinearAutopilotRunSummary } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { ChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { PrimaryEnvironmentHttpClient } from "../../environments/primary/httpClient";
import { runPrimaryHttp } from "../../lib/runtime";
import { cn } from "../../lib/utils";
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
  threadCount: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { run, status } = props.entry;
  const foldable = props.threadCount > 0;
  const className = cn(
    "mx-0.5 flex h-7 w-[calc(100%-0.25rem)] items-center gap-2 rounded-md px-2 text-left text-xs outline-none",
    foldable &&
      "hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
  );
  const target = foldable ? (
    <button
      type="button"
      className={className}
      aria-expanded={props.expanded}
      onClick={props.onToggle}
    />
  ) : (
    <div className={className} />
  );
  return (
    <li className="list-none pt-1" data-testid="sidebar-active-autopilot-row">
      <Tooltip>
        <TooltipTrigger render={target}>
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              status.needsYou ? "bg-warning" : "bg-info",
            )}
          />
          <span className="shrink-0 text-muted-foreground tabular-nums">
            {run.identifier ?? "Ticket"}
          </span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {run.title ?? "Untitled ticket"}
          </span>
          <span
            className={cn(
              "shrink-0",
              status.needsYou ? "text-warning-foreground" : "text-muted-foreground",
            )}
          >
            {status.label}
          </span>
          {foldable ? (
            <span className="flex shrink-0 items-center gap-0.5 text-muted-foreground tabular-nums">
              +{props.threadCount}
              <ChevronRightIcon
                aria-hidden
                className={cn("size-3 transition-transform", props.expanded && "rotate-90")}
              />
            </span>
          ) : null}
        </TooltipTrigger>
        <TooltipPopup side="right" className="max-w-80">
          {status.detail}
          {foldable
            ? ` · ${props.threadCount} ${props.threadCount === 1 ? "thread" : "threads"}`
            : ""}
        </TooltipPopup>
      </Tooltip>
    </li>
  );
}
