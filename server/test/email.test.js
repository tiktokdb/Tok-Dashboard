import test from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail } from "../src/email.js";

test("normalizes Gmail dots and plus tags", () => {
  assert.equal(normalizeEmail("First.Last+tok@gmail.com"), "firstlast@gmail.com");
  assert.equal(normalizeEmail("First.Last+tok@googlemail.com"), "firstlast@gmail.com");
});

test("normalizes plus tags for non-Gmail domains without removing dots", () => {
  assert.equal(normalizeEmail("First.Last+tok@example.com"), "first.last@example.com");
});
