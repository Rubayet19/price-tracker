import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL(
    "../../components/dashboard/dashboard-competitors-content.tsx",
    import.meta.url
  ),
  "utf8"
);

test("competitors page scrolls to hash-targeted competitor cards after data loads", () => {
  assert.match(source, /window\.location\.hash/);
  assert.match(source, /window\.addEventListener\("hashchange"/);
  assert.match(source, /scrollIntoView\(\{[\s\S]*block:\s*"start"/);
});
