import { test } from "node:test";
import assert from "node:assert/strict";

// Demo payments credit money without PayChangu, so they must be impossible to
// enable by accident. These tests load the module fresh for each env setup.
async function demoEnabled(env: Record<string, string | undefined>) {
  const keys = ["NODE_ENV", "NEXA_DEMO_PAYMENTS", "PAYCHANGU_SECRET_KEY"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    const mod = await import(`./paychangu.server?${Math.random()}`);
    return mod.demoPaymentsEnabled() as boolean;
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test("demo payments are off by default", async () => {
  assert.equal(await demoEnabled({ NODE_ENV: "development" }), false);
});

test("demo payments need the explicit flag in development", async () => {
  assert.equal(await demoEnabled({ NODE_ENV: "development", NEXA_DEMO_PAYMENTS: "true" }), true);
});

test("demo payments can never run in production", async () => {
  assert.equal(await demoEnabled({ NODE_ENV: "production", NEXA_DEMO_PAYMENTS: "true" }), false);
});

test("demo payments are off once PayChangu is configured", async () => {
  assert.equal(
    await demoEnabled({ NODE_ENV: "development", NEXA_DEMO_PAYMENTS: "true", PAYCHANGU_SECRET_KEY: "sk_test" }),
    false,
  );
});
