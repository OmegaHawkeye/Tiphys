import { defaultLinearAutopilotWorkflow, ProviderInstanceId } from "@t3tools/contracts";
import { linearAutopilotWorkflowIssues } from "@t3tools/shared/linearAutopilotWorkflow";
import { createModelSelection } from "@t3tools/shared/model";
import { describe, expect, it } from "vite-plus/test";

import {
  addNode,
  customizeWorkflow,
  moveNode,
  removeNode,
  routeTargets,
  setRoute,
  unusableModelWarnings,
  updateNode,
  workflowToStore,
} from "./workflowEditor.logic";

const planner = createModelSelection(ProviderInstanceId.make("claude"), "claude-opus-5-5");
const reviewer = createModelSelection(ProviderInstanceId.make("codex"), "gpt-5.5");

describe("customizeWorkflow", () => {
  it("starts runnable with the built-in workflow's distinct planner and reviewer", () => {
    const copy = customizeWorkflow();
    expect(copy.id).not.toBe(defaultLinearAutopilotWorkflow.id);
    expect(copy.nodes).toEqual(defaultLinearAutopilotWorkflow.nodes);
    expect(linearAutopilotWorkflowIssues(copy)).toEqual([]);
  });
});

describe("setRoute", () => {
  it("drops a retry budget once the route no longer loops", () => {
    const base = updateNode(customizeWorkflow(), "review", (node) => ({
      ...node,
      persona: { modelSelection: reviewer },
    }));
    const { workflow } = addNode(base, "implement", planner);
    // merge ci-fail normally loops back to implement with a budget.
    const rerouted = setRoute(
      setRoute(workflow, "implement-2", "done", "merge"),
      "merge",
      "ci-fail",
      "implement-2",
    );
    const ciFail = rerouted.edges.find((edge) => edge.from === "merge" && edge.on === "ci-fail");
    expect(ciFail).toEqual({ from: "merge", on: "ci-fail", to: "implement-2" });
  });
});

describe("routeTargets", () => {
  it("offers only the phase kind each outcome may reach", () => {
    const { workflow } = addNode(defaultLinearAutopilotWorkflow, "implement", null);
    expect(routeTargets(workflow, "review", "approve")).toEqual(["implement", "implement-2"]);
    expect(routeTargets(workflow, "merge", "ci-pass")).toEqual(["end"]);
  });
});

describe("removeNode", () => {
  it("leaves incoming routes dangling so validation names them", () => {
    const issues = linearAutopilotWorkflowIssues(
      removeNode(defaultLinearAutopilotWorkflow, "merge"),
    );
    expect(issues).toContainEqual({
      edge: { from: "implement", on: "done" },
      message: 'edge target "merge" is missing.',
    });
  });

  it("forgets the removed phase's saved position", () => {
    const moved = moveNode(
      moveNode(defaultLinearAutopilotWorkflow, "merge", { x: 10, y: 20 }),
      "end",
      { x: 300, y: 20 },
    );
    expect(removeNode(moved, "merge").layout).toEqual({ end: { x: 300, y: 20 } });
  });
});

describe("unusableModelWarnings", () => {
  const codex = { instanceId: "codex", displayName: "Codex", enabled: true, isAvailable: true };
  const claude = {
    instanceId: "claudeAgent",
    displayName: "Claude",
    enabled: true,
    isAvailable: true,
  };

  it("accepts the built-in workflow when both of its providers are usable", () => {
    expect(unusableModelWarnings(defaultLinearAutopilotWorkflow, [codex, claude])).toEqual([]);
  });

  it("names the review phase when its provider is turned off or missing", () => {
    expect(
      unusableModelWarnings(defaultLinearAutopilotWorkflow, [codex, { ...claude, enabled: false }]),
    ).toEqual([
      {
        nodeId: "review",
        message: "Review runs on Claude, which is turned off in this environment.",
      },
    ]);
    expect(unusableModelWarnings(defaultLinearAutopilotWorkflow, [codex])).toEqual([
      {
        nodeId: "review",
        message: 'Review runs on provider "claudeAgent", which is not set up in this environment.',
      },
    ]);
  });

  it("stays quiet until the environment's providers have loaded", () => {
    expect(unusableModelWarnings(defaultLinearAutopilotWorkflow, [])).toEqual([]);
  });

  it("flags every phase on a provider that is not available right now", () => {
    const warnings = unusableModelWarnings(defaultLinearAutopilotWorkflow, [
      { ...codex, isAvailable: false },
      claude,
    ]);
    expect(warnings.map((warning) => warning.nodeId)).toEqual(["plan", "implement"]);
  });
});

describe("workflowToStore", () => {
  it("stores nothing when a scope keeps the workflow it inherits", () => {
    const inherited = customizeWorkflow();
    expect(workflowToStore(structuredClone(inherited), inherited)).toBeNull();
  });

  it("stores the built-in explicitly when the inherited default is custom", () => {
    expect(workflowToStore(defaultLinearAutopilotWorkflow, customizeWorkflow())).toBe(
      defaultLinearAutopilotWorkflow,
    );
  });
});
