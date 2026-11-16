import * as Schema from "effect/Schema";
import { ModelSelection } from "./modelSelection.ts";
import { ProviderInstanceId } from "./providerInstance.ts";

const WorkflowPersonaInstructions = Schema.Struct({
  personaName: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(80)),
  revision: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(128)),
  text: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(8_000)),
});

export const LinearAutopilotWorkflowNodeKind = Schema.Literals([
  "plan",
  "review",
  "implement",
  "merge",
]);
export type LinearAutopilotWorkflowNodeKind = typeof LinearAutopilotWorkflowNodeKind.Type;

export const LinearAutopilotWorkflowOutcome = Schema.Literals([
  "done",
  "verify-fail",
  "approve",
  "revise",
  "ci-pass",
  "ci-fail",
  "blocked",
]);
export type LinearAutopilotWorkflowOutcome = typeof LinearAutopilotWorkflowOutcome.Type;

export const LinearAutopilotWorkflowNode = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(80)),
  kind: LinearAutopilotWorkflowNodeKind,
  /** Inline resolved runtime profile; named reusable personas are layered on this by OME-232. */
  persona: Schema.optional(
    Schema.Struct({
      modelSelection: ModelSelection,
      instructions: Schema.optional(WorkflowPersonaInstructions),
    }),
  ),
});
export type LinearAutopilotWorkflowNode = typeof LinearAutopilotWorkflowNode.Type;

export const LinearAutopilotWorkflowEdge = Schema.Struct({
  from: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(80)),
  on: LinearAutopilotWorkflowOutcome,
  to: Schema.Union([
    Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(80)),
    Schema.Literal("end"),
  ]),
  budget: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 }))),
});
export type LinearAutopilotWorkflowEdge = typeof LinearAutopilotWorkflowEdge.Type;

export const LinearAutopilotWorkflow = Schema.Struct({
  version: Schema.Literal(1),
  id: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(80)),
  label: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(120)),
  entry: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(80)),
  nodes: Schema.Array(LinearAutopilotWorkflowNode)
    .check(Schema.isMinLength(1))
    .check(Schema.isMaxLength(8)),
  edges: Schema.Array(LinearAutopilotWorkflowEdge).check(Schema.isMaxLength(32)),
  /** Editor positions keyed by node id or "end". Execution never reads them. */
  layout: Schema.optional(
    Schema.Record(
      Schema.String.check(Schema.isMaxLength(80)),
      Schema.Struct({ x: Schema.Finite, y: Schema.Finite }),
    ),
  ),
});
export type LinearAutopilotWorkflow = typeof LinearAutopilotWorkflow.Type;

export const LinearAutopilotWorkflowExecution = Schema.Struct({
  version: Schema.Literal(1),
  definition: LinearAutopilotWorkflow,
  nodeId: Schema.String,
  traversals: Schema.Record(
    Schema.String,
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  ),
});
export type LinearAutopilotWorkflowExecution = typeof LinearAutopilotWorkflowExecution.Type;

// The reviewer must differ from the planner (no-self-review), so the default pairs two providers.
const defaultCodexPersona: ModelSelection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "gpt-6-luna",
  options: [{ id: "reasoningEffort", value: "medium" }],
};
const defaultClaudeReviewer: ModelSelection = {
  instanceId: ProviderInstanceId.make("claudeAgent"),
  model: "claude-opus-5-5",
  options: [{ id: "effort", value: "medium" }],
};

/** The graph equivalent of the native autopilot's plan → review → implement → delivery flow. */
export const defaultLinearAutopilotWorkflow: LinearAutopilotWorkflow = {
  version: 1,
  id: "t3-default-v1",
  label: "Default workflow",
  entry: "plan",
  nodes: [
    { id: "plan", kind: "plan", persona: { modelSelection: defaultCodexPersona } },
    { id: "review", kind: "review", persona: { modelSelection: defaultClaudeReviewer } },
    { id: "implement", kind: "implement", persona: { modelSelection: defaultCodexPersona } },
    { id: "merge", kind: "merge" },
  ],
  edges: [
    { from: "plan", on: "done", to: "review" },
    { from: "review", on: "approve", to: "implement" },
    { from: "review", on: "revise", to: "plan", budget: 2 },
    { from: "implement", on: "done", to: "merge" },
    { from: "implement", on: "verify-fail", to: "implement", budget: 2 },
    { from: "merge", on: "ci-pass", to: "end" },
    { from: "merge", on: "ci-fail", to: "implement", budget: 1 },
  ],
};
