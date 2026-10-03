import { test } from "node:test";
import assert from "node:assert/strict";
import { hashSecret, newReference, normalizeAnswer, verifySecret } from "./crypto";

test("PIN hash verifies only the right PIN", async () => {
  const saved = process.env.NEXA_PIN_PEPPER;
  delete process.env.NEXA_PIN_PEPPER;
  try {
    const h = await hashSecret("4821");
    assert.equal(await verifySecret(h, "4821"), true);
    assert.equal(await verifySecret(h, "4822"), false);
    assert.notEqual(h, await hashSecret("4821"), "salted — same PIN hashes differently");
    assert.match(h, /^s2:/);
  } finally {
    if (saved === undefined) delete process.env.NEXA_PIN_PEPPER;
    else process.env.NEXA_PIN_PEPPER = saved;
  }
});

test("peppered PIN hashes use s2p prefix and need the pepper", async () => {
  const saved = process.env.NEXA_PIN_PEPPER;
  process.env.NEXA_PIN_PEPPER = "test-pepper-value-not-for-prod";
  try {
    // Dynamic import would be cleaner; hashSecret reads env at call time.
    const h = await hashSecret("4821");
    assert.match(h, /^s2p:/);
    assert.equal(await verifySecret(h, "4821"), true);
    assert.equal(await verifySecret(h, "0000"), false);
    // Without pepper, peppered hash must not verify.
    delete process.env.NEXA_PIN_PEPPER;
    assert.equal(await verifySecret(h, "4821"), false);
  } finally {
    if (saved === undefined) delete process.env.NEXA_PIN_PEPPER;
    else process.env.NEXA_PIN_PEPPER = saved;
  }
});

test("security answers are normalised", () => {
  assert.equal(normalizeAnswer("  Lilongwe  City "), "lilongwe city");
});

test("references are unique and prefixed", () => {
  const a = newReference("DEP");
  assert.match(a, /^DEP_/);
  assert.notEqual(a, newReference("DEP"));
});
