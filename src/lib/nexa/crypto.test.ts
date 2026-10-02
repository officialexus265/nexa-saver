import { test } from "node:test";
import assert from "node:assert/strict";
import { hashSecret, newReference, normalizeAnswer, verifySecret } from "./crypto";

test("PIN hash verifies only the right PIN", async () => {
  const h = await hashSecret("4821");
  assert.equal(await verifySecret(h, "4821"), true);
  assert.equal(await verifySecret(h, "4822"), false);
  assert.notEqual(h, await hashSecret("4821"), "salted — same PIN hashes differently");
});

test("security answers are normalised", () => {
  assert.equal(normalizeAnswer("  Lilongwe  City "), "lilongwe city");
});

test("references are unique and prefixed", () => {
  const a = newReference("DEP");
  assert.match(a, /^DEP_/);
  assert.notEqual(a, newReference("DEP"));
});
