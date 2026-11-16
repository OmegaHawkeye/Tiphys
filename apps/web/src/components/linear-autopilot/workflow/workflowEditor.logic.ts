import {
  defaultLinearAutopilotWorkflow,
  type LinearAutopilotWorkflow,
  type LinearAutopilotWorkflowEdge,
  type LinearAutopilotWorkflowNode,
  type LinearAutopilotWorkflowNodeKind,
  type ModelSelection,
} from "@t3tools/contracts";
import {
  LINEAR_AUTOPILOT_NODE_OUTCOMES,
  linearAutopilotLoopEdges,
  linearAutopilotRouteTargetKind,
  type LinearAutopilotRoutableOutcome,
  type LinearAutopilotWorkflowIssue,
} from "@t3tools/shared/linearAutopilotWorkflow";

export const PHASE_LABEL: Record<LinearAutopilotWorkflowNodeKind, string> = {
  plan: "Plan",
  review: "Review",
  implement: "Implement",
  merge: "Merge",
};

export const routeKey = (edge: { readonly from: string; readonly on: string }) =>
  `${edge.from}:${edge.on}`;

export const isBuiltInWorkflow = (workflow: LinearAutopilotWorkflow) =>
  workflow.id === defaultLinearAutopilotWorkflow.id;

const nodeLimit = 8;

/** A project-owned copy of the built-in graph, keeping its distinct planner and reviewer models. */
export function customizeWorkflow(): LinearAutopilotWorkflow {
  return { ...defaultLinearAutopilotWorkflow, id: "custom", label: "Custom workflow" };
}

export function updateNode(
  workflow: LinearAutopilotWorkflow,
  nodeId: string,
  change: (node: LinearAutopilotWorkflowNode) => LinearAutopilotWorkflowNode,
): LinearAutopilotWorkflow {
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) => (node.id === nodeId ? change(node) : node)),
  };
}

/** Points one outcome at a node, keeping a budget only where the new route is still a loop. */
export function setRoute(
  workflow: LinearAutopilotWorkflow,
  from: string,
  on: LinearAutopilotRoutableOutcome,
  to: string,
): LinearAutopilotWorkflow {
  const existing = workflow.edges.find((edge) => edge.from === from && edge.on === on);
  const next: LinearAutopilotWorkflowEdge = existing ? { ...existing, to } : { from, on, to };
  const rewired = {
    ...workflow,
    edges: existing
      ? workflow.edges.map((edge) => (edge === existing ? next : edge))
      : [...workflow.edges, next],
  };
  const isLoop = [...linearAutopilotLoopEdges(rewired)].some(
    (edge) => edge.from === from && edge.on === on,
  );
  if (isLoop || next.budget === undefined) return rewired;
  const { budget: _dropped, ...withoutBudget } = next;
  return {
    ...rewired,
    edges: rewired.edges.map((edge) => (edge === next ? withoutBudget : edge)),
  };
}

export function setRouteBudget(
  workflow: LinearAutopilotWorkflow,
  from: string,
  on: LinearAutopilotRoutableOutcome,
  budget: number | undefined,
): LinearAutopilotWorkflow {
  return {
    ...workflow,
    edges: workflow.edges.map((edge) => {
      if (edge.from !== from || edge.on !== on) return edge;
      const { budget: _previous, ...rest } = edge;
      return budget === undefined ? rest : { ...rest, budget };
    }),
  };
}

export const canAddNode = (workflow: LinearAutopilotWorkflow) => workflow.nodes.length < nodeLimit;

export function addNode(
  workflow: LinearAutopilotWorkflow,
  kind: LinearAutopilotWorkflowNodeKind,
  modelSelection: ModelSelection | null,
): { readonly workflow: LinearAutopilotWorkflow; readonly nodeId: string } {
  let index = 2;
  while (workflow.nodes.some((node) => node.id === `${kind}-${index}`)) index += 1;
  const nodeId = `${kind}-${index}`;
  const node: LinearAutopilotWorkflowNode =
    kind === "merge" || modelSelection === null
      ? { id: nodeId, kind }
      : { id: nodeId, kind, persona: { modelSelection } };
  return { workflow: { ...workflow, nodes: [...workflow.nodes, node] }, nodeId };
}

/**
 * Removes a phase and its outgoing routes. Routes into it are left pointing at the missing
 * phase so validation names each one; nothing is silently rewired.
 */
export function removeNode(
  workflow: LinearAutopilotWorkflow,
  nodeId: string,
): LinearAutopilotWorkflow {
  const { [nodeId]: _position, ...layout } = workflow.layout ?? {};
  return {
    ...workflow,
    nodes: workflow.nodes.filter((node) => node.id !== nodeId),
    edges: workflow.edges.filter((edge) => edge.from !== nodeId),
    ...(workflow.layout === undefined ? {} : { layout }),
  };
}

export function moveNode(
  workflow: LinearAutopilotWorkflow,
  nodeId: string,
  position: Point,
): LinearAutopilotWorkflow {
  return { ...workflow, layout: { ...workflow.layout, [nodeId]: position } };
}

/** Nodes an outcome may be routed to, so pickers and drag targets only offer valid choices. */
export function routeTargets(
  workflow: LinearAutopilotWorkflow,
  kind: LinearAutopilotWorkflowNodeKind,
  outcome: LinearAutopilotRoutableOutcome,
): readonly string[] {
  const targetKind = linearAutopilotRouteTargetKind(kind, outcome);
  if (targetKind === null) return [];
  if (targetKind === "end") return ["end"];
  return workflow.nodes.filter((node) => node.kind === targetKind).map((node) => node.id);
}

export const outcomesOf = (kind: LinearAutopilotWorkflowNodeKind) =>
  LINEAR_AUTOPILOT_NODE_OUTCOMES[kind];

export const isLoopRoute = (workflow: LinearAutopilotWorkflow, from: string, on: string) =>
  [...linearAutopilotLoopEdges(workflow)].some((edge) => edge.from === from && edge.on === on);

export function issuesForNode(issues: readonly LinearAutopilotWorkflowIssue[], nodeId: string) {
  return issues.filter((issue) => issue.nodeId === nodeId || issue.edge?.from === nodeId);
}

export function issueForRoute(
  issues: readonly LinearAutopilotWorkflowIssue[],
  from: string,
  on: string,
) {
  return issues.find((issue) => issue.edge?.from === from && issue.edge.on === on);
}

/** Sentence case for messages written as rule fragments ("node x is unreachable."). */
export const issueText = (issue: LinearAutopilotWorkflowIssue) =>
  issue.message.charAt(0).toUpperCase() + issue.message.slice(1);

export interface Point {
  readonly x: number;
  readonly y: number;
}

const columnOrder: Record<LinearAutopilotWorkflowNodeKind, number> = {
  plan: 0,
  review: 1,
  implement: 2,
  merge: 3,
};

/** Phases in gate order left to right; several phases of one kind stack in their column. */
export function autoLayout(
  workflow: LinearAutopilotWorkflow,
  size: { readonly columnWidth: number; readonly rowHeight: number },
): Record<string, Point> {
  const rows: Record<number, number> = {};
  const layout: Record<string, Point> = {};
  for (const node of workflow.nodes) {
    const column = columnOrder[node.kind];
    const row = rows[column] ?? 0;
    rows[column] = row + 1;
    layout[node.id] = { x: column * size.columnWidth, y: row * size.rowHeight };
  }
  layout.end = { x: 4 * size.columnWidth, y: 0 };
  return layout;
}

/** Stable short fingerprint so a run's pinned persona names the exact instructions it used. */
export function instructionsRevision(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** The parts of a provider instance that decide whether a phase can run on it. */
export interface WorkflowProviderStatus {
  readonly instanceId: string;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly isAvailable: boolean;
}

export interface WorkflowModelWarning {
  readonly nodeId: string;
  readonly message: string;
}

/**
 * Phases whose model runs on a provider this environment cannot use. Saving stays allowed,
 * since a provider can be turned back on, but runs would stop at these phases.
 */
export function unusableModelWarnings(
  workflow: LinearAutopilotWorkflow,
  providers: ReadonlyArray<WorkflowProviderStatus>,
): WorkflowModelWarning[] {
  // No providers means they have not loaded yet, not that every phase is broken.
  if (providers.length === 0) return [];
  const warnings: WorkflowModelWarning[] = [];
  for (const node of workflow.nodes) {
    if (node.persona === undefined) continue;
    const { instanceId } = node.persona.modelSelection;
    const provider = providers.find((candidate) => candidate.instanceId === instanceId);
    const phase = PHASE_LABEL[node.kind];
    if (provider === undefined) {
      warnings.push({
        nodeId: node.id,
        message: `${phase} runs on provider "${instanceId}", which is not set up in this environment.`,
      });
    } else if (!provider.enabled) {
      warnings.push({
        nodeId: node.id,
        message: `${phase} runs on ${provider.displayName}, which is turned off in this environment.`,
      });
    } else if (!provider.isAvailable) {
      warnings.push({
        nodeId: node.id,
        message: `${phase} runs on ${provider.displayName}, which is not available right now.`,
      });
    }
  }
  return warnings;
}

/**
 * What to persist for a scope: null when the workflow is what the scope inherits anyway, so it
 * keeps following later changes to the default. Settings round-trip through JSON, so structural
 * equality is what "the same" means here.
 */
export function workflowToStore(
  workflow: LinearAutopilotWorkflow,
  inherited: LinearAutopilotWorkflow,
): LinearAutopilotWorkflow | null {
  return JSON.stringify(workflow) === JSON.stringify(inherited) ? null : workflow;
}
