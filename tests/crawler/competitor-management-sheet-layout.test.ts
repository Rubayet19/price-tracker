import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL(
    "../../components/dashboard/competitor-management-sheet.tsx",
    import.meta.url
  ),
  "utf8"
);

test("competitor management sheet keeps actions visible with a scrollable body", () => {
  assert.match(source, /SheetContent[\s\S]*overflow-hidden[\s\S]*p-0/);
  assert.match(source, /className="min-h-0 flex-1 overflow-y-auto/);
  assert.match(source, /SheetFooter[\s\S]*className="shrink-0 border-t/);
});
