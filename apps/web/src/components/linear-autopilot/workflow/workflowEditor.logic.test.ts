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
  updateNode,
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
