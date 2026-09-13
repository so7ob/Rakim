import { ForbiddenException } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types.js";
import {
  assertWorkflowPolicy,
  WORKFLOW_POLICIES,
  type WorkflowPolicyCode,
} from "./workflow-policies.js";

function harness(
  code: WorkflowPolicyCode,
  enabled: boolean,
  violatesPolicy: boolean,
) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM platform_settings"))
      return [{ valueJson: JSON.stringify(enabled) }];
    throw new Error(`Unexpected query: ${sql}`);
  });
  return {
    query,
    run: (policyCapabilities: string[] = []) =>
      assertWorkflowPolicy(
        { query } as unknown as EntityManager,
        code,
        {
          id: "actor-1",
          username: "actor",
          displayName: "المستخدم",
          roles: ["LEGAL_REVIEWER", "CONTENT_MANAGER"],
          permissions: [],
          policyCapabilities,
        } satisfies AuthUser,
        violatesPolicy,
      ),
  };
}

describe("central workflow policies", () => {
  it("registers every human separation-of-duties constraint", () => {
    expect(WORKFLOW_POLICIES.map((policy) => policy.code)).toEqual([
      "SOURCE_IMPORT_SELF_REVIEW",
      "LEGISLATION_SELF_APPROVAL",
      "LEGISLATION_SELF_PUBLICATION",
      "AMENDMENT_SELF_REVIEW",
      "AMENDMENT_SELF_PUBLICATION",
    ]);
  });

  it.each(WORKFLOW_POLICIES)(
    "rejects a violation while $code is enabled",
    async (policy) => {
      await expect(
        harness(policy.code, true, true).run(),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it.each(WORKFLOW_POLICIES)(
    "allows $code when the policy is globally disabled",
    async (policy) => {
      await expect(harness(policy.code, false, true).run()).resolves.toBe(
        "POLICY_DISABLED",
      );
    },
  );

  it.each(WORKFLOW_POLICIES)(
    "allows $code only with its explicit user override",
    async (policy) => {
      await expect(
        harness(policy.code, true, true).run([policy.permissionCode]),
      ).resolves.toBe("USER_PERMISSION_OVERRIDE");
    },
  );

  it("keeps an enabled policy enforced when there is no conflict", async () => {
    await expect(
      harness("LEGISLATION_SELF_APPROVAL", true, false).run(),
    ).resolves.toBe("POLICY_ENFORCED");
  });
});
