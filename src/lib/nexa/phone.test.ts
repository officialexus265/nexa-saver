import { test } from "node:test";
import assert from "node:assert/strict";
import { detectOperator, normalizeMwPhone } from "./phone";

test("normalises Malawi numbers", () => {
  assert.equal(normalizeMwPhone("0881 234 567"), "0881234567");
  assert.equal(normalizeMwPhone("+265 881 234 567"), "0881234567");
  assert.equal(normalizeMwPhone("265991234567"), "0991234567");
});

test("rejects invalid numbers", () => {
  assert.equal(normalizeMwPhone("12345"), null);
  assert.equal(normalizeMwPhone("0771234567"), null);
});

test("detects operator", () => {
  assert.equal(detectOperator("0991234567"), "airtel");
  assert.equal(detectOperator("0881234567"), "tnm");
});
