# Crawler Extraction Overhaul

**Goal:** Improve pricing extraction trustworthiness without rewriting the crawler pipeline. Keep runner, diffing, and dashboard behavior stable while fixing noisy plan detection, brittle rendered extraction, and missing debug evidence.

**Scope:** Add a crawler regression harness, improve static pricing-section scoping, clean up Playwright readiness and cadence handling, and persist compact debug evidence inside snapshot payloads. Leave LLM enrichment and soft-field extraction for a later phase.

**Approach options considered:**

1. `LLM-first fallback`
   Faster to bolt on, but it increases ambiguity and can turn uncertain pages into confident garbage. This conflicts with the product rule to prefer trustworthy `unknown` over noisy output.
2. `Targeted extraction upgrade`
   Improve section scoping, rendered readiness, and evidence capture first. Add deterministic fixes where the current extractor is obviously weak. This is the recommended path.
3. `Full crawler rewrite`
   Not justified. The runner, snapshot lifecycle, diffing, and dashboard comparison flow are serviceable. The failure cluster is inside extraction.

**Selected design:**

- Add a lightweight test harness with fixture-based regression coverage so extraction changes are measurable.
- Score static pricing scopes before reading plan names and price mentions. Avoid page-wide heading scans when a credible pricing section exists.
- Make Playwright use web-first readiness instead of `networkidle` and fixed sleeps, and capture compact toggle/debug evidence.
- Persist compact extraction evidence in the pricing payload so snapshots can explain why a crawl was trusted or downgraded.

**Non-goals for this change:**

- No LLM extraction yet.
- No broad dashboard redesign.
- No crawler infrastructure migration.
