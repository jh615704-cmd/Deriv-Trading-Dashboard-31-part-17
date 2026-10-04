import assert from "node:assert/strict";
import { test } from "node:test";
import { getDerivCredentialWarningKind } from "./deriv-credential-warning.ts";

test("recognizes a rejected saved Deriv PAT", () => {
  assert.equal(
    getDerivCredentialWarningKind({
      status: 401,
      data: { error: "The saved Deriv token was rejected. Enter your PAT again to reconnect." },
    }),
    "rejected",
  );
});

test("recognizes a Deriv permission denial without treating it as an invalid PAT", () => {
  assert.equal(
    getDerivCredentialWarningKind({
      status: 403,
      data: { error: "Deriv denied this request. The PAT may be missing a required permission." },
    }),
    "permission",
  );
});

test("ignores unrelated authorization errors", () => {
  assert.equal(
    getDerivCredentialWarningKind({ status: 401, data: { error: "Unauthorized" } }),
    null,
  );
  assert.equal(
    getDerivCredentialWarningKind({
      status: 403,
      data: { error: "Live trading is disabled." },
    }),
    null,
  );
});