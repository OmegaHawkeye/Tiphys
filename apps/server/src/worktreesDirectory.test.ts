import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";

import { discoverPreviousWorktreesRoots } from "./worktreesDirectory.ts";

describe("discoverPreviousWorktreesRoots", () => {
  it.effect("recovers a moved home's worktrees root from migrated thread paths", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const discovered = discoverPreviousWorktreesRoots({
        worktreePaths: [
          "/Users/me/.old/worktrees/repo-a/t3-1066726f",
          "/Users/me/.old/worktrees/repo-b/t3-abcdef01",
          "/Users/me/.new/worktrees/repo-a/t3-00000001",
        ],
        managedRoots: ["/Users/me/.new/worktrees"],
        path,
      });
      expect(discovered).toEqual(["/Users/me/.old/worktrees"]);
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("ignores the currently managed root, scratch paths, and attached folders", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const discovered = discoverPreviousWorktreesRoots({
        worktreePaths: [
          "/Users/me/.new/worktrees/repo-a/t3-00000001",
          "/Users/me/.old/scratch/2026-11-05-some-thread",
          "/Users/me/projects/attached-checkout",
          "relative/worktrees/repo/name",
        ],
        managedRoots: ["/Users/me/.new/worktrees"],
        path,
      });
      expect(discovered).toEqual([]);
    }).pipe(Effect.provide(Path.layer)),
  );
});
