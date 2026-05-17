import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertProjectTenantScope,
  assertTenantScope,
  TenantScopeError,
} from "../tenant-scope.ts";

describe("tenant scope helpers", () => {
  it("requires organization scope for tenant-owned queries", () => {
    assert.doesNotThrow(() =>
      assertTenantScope({ organizationId: "org_1" }),
    );

    assert.throws(
      () => assertTenantScope({ organizationId: "" }),
      errorWithCode("organization_scope_required"),
    );
  });

  it("requires both organization and project scope for project-owned queries", () => {
    assert.doesNotThrow(() =>
      assertProjectTenantScope({
        organizationId: "org_1",
        projectId: "project_1",
      }),
    );

    assert.throws(
      () =>
        assertProjectTenantScope({
          organizationId: "org_1",
          projectId: "",
        }),
      errorWithCode("project_scope_required"),
    );
  });
});

function errorWithCode(code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof TenantScopeError);
    assert.equal(error.code, code);
    return true;
  };
}
