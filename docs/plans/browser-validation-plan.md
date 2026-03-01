# Plan: Mandatory Browser-Based Validation for Frontend Projects

## Context

The pipeline validates frontend projects at the code/API level but never opens a browser. Three specific gaps:

1. **Smoke test** (`execute.md` Step 5d/5e) — Makes HTTP requests and does static CSS analysis. A page returning 200 with broken rendering passes.
2. **E2E tests** (`test.md` Step 4) — Optional. `test_commands.e2e` is commented out by default. No enforcement that tests use a real browser.
3. **Designer Critic** — Pure static code review. Checks code patterns, not rendered output.

**Result**: Everything passes in theory, breaks in the browser.

**Goal**: When `has_frontend: true`, the pipeline must launch a real browser, verify rendering, capture screenshots as evidence, and make E2E tests mandatory. Non-frontend projects are unaffected.

---

## Files to Modify (7 files, in implementation order)

### 1. `pipeline/templates/pipeline-config-template.yaml`
**What**: Add `browser_testing` config section (commented out, matching existing pattern for `smoke_test` and `test_stage`)

Add after the `smoke_test` section (~line 109), before `test_stage`:

```yaml
  # Browser-based validation (when has_frontend: true)
  # Used by execute.md Step 5d/5e for runtime browser verification and screenshot capture.
  # When omitted and has_frontend: true, defaults below are used automatically.
  # browser_testing:
  #   tool: playwright                 # browser automation tool (only playwright supported)
  #   headless: true                   # run headless (recommended for CI; xvfb not needed)
  #   screenshot_dir: ".pipeline/screenshots"  # directory for screenshot evidence
  #   viewports:
  #     - { name: "mobile", width: 375, height: 812 }
  #     - { name: "tablet", width: 768, height: 1024 }
  #     - { name: "desktop", width: 1280, height: 720 }
  #   smoke_test_routes: []            # routes to verify (auto-detected from framework if empty)
  #   max_routes: 10                   # cap for auto-detected routes
  #   max_console_errors: 0            # max allowed console.error calls (0 = zero tolerance)
  #   visual_regression: false         # reserved for future: screenshot comparison
  #   auto_install: false              # set true to auto-install Playwright browsers if missing
```

Also: Uncomment `e2e` in `test_commands` (currently commented out on line 72) and add a note:
```yaml
    e2e: "npx playwright test"          # Mandatory when has_frontend: true; optional otherwise
```

---

### 2. `commands/execute.md` — Step 5d and Step 5e
**What**: Replace HTTP-only user flow and static-only visual checks with browser-based Playwright verification when `has_frontend: true`

#### Step 5d (~lines 408-415): Add browser path before HTTP fallback

Replace current Step 5d with a two-path approach:

**Path A — Browser (when `has_frontend: true` AND Playwright available)**:
1. Check Playwright: `npx playwright --version` (exits 0 = available)
2. If `browser_testing.auto_install: true` and browsers missing, run `npx playwright install chromium`
3. Navigate to entry URL in headless Chromium
4. Verify page loads without JS errors (capture all `console.error` events, assert count <= `max_console_errors`)
5. Verify key DOM elements are visible (root element `#root`/`#__next`/`#app`/`main`, navigation, content area)
6. If `smoke_test.interaction_endpoint` is set, simulate user flow via Playwright actions (click, type, navigate) instead of HTTP
7. LLM testing logic unchanged (same API key detection and mock handling)

**Path B — HTTP fallback** (when `has_frontend: false` OR Playwright not available):
- Existing HTTP-only behavior (unchanged)
- If `has_frontend: true` but Playwright not available: emit **Warning** — "Browser-based verification skipped — Playwright not installed. Falling back to HTTP-only. Install: `npm install -D @playwright/test && npx playwright install chromium`"

#### Step 5e (~lines 417-427): Replace static analysis with browser rendering + screenshots

Replace current Step 5e with:

**Path A — Browser (when Playwright available)**:
1. **Route discovery**: Entry URL always included. Auto-detect routes from framework (Next.js App Router: `app/**/page.tsx`; Pages Router: `pages/**/*.tsx` excluding `_app`/`_document`/`api/`; SvelteKit: `src/routes/**/+page.svelte`; generic SPA: entry only). Cap at `max_routes` (default: 10). Config `smoke_test_routes` overrides.
2. **Multi-viewport screenshots**: For each route, capture at 3 viewports (mobile 375x812, tablet 768x1024, desktop 1280x720). Save to `screenshot_dir` (default `.pipeline/screenshots/`) as `{route-slug}_{viewport}.png`. Clean directory first (`rm -rf && mkdir -p`).
3. **Console error collection**: Aggregate all `console.error` from all page loads. Assert total <= `max_console_errors`.
4. **DOM verification**: Non-empty `<title>` or `<h1>`, main content visible (height > 0), no error overlay (`[data-nextjs-dialog]`, `.error-boundary`), images loaded.
5. **Responsive check**: At mobile viewport, no horizontal overflow (`scrollWidth <= clientWidth`), no text below 12px.
6. **Static analysis complement**: Also run existing CSS var, asset reference, and dark theme checks as supplementary validation.

**Path B — Static fallback** (when Playwright not available):
- Existing static analysis only (CSS vars, assets, dark theme)
- Warning: "Browser-based rendering skipped — running static analysis only"

**Update Step 6 report table** to add row:
```
| Browser screenshots | PASS / N/A | 2.3s | N routes x 3 viewports = M screenshots |
```

---

### 3. `pipeline/agents/designer-critic.md`
**What**: Add "Browser Verification Evidence" checklist section that auto-fails without screenshot proof

Add new section after "Runtime Rendering Integrity" (line 76), before "Animation & Transitions" (line 78):

```markdown
### Browser Verification Evidence (code review only, not PRD review)
- [ ] Screenshot evidence exists in `.pipeline/screenshots/` from browser render during smoke test
- [ ] Screenshots cover at minimum: entry page at 3 viewports (mobile, tablet, desktop)
- [ ] Zero console errors recorded during browser render
- [ ] No error overlay or error boundary visible in any screenshot
- [ ] If interactive flows exist, at least one interaction screenshot present
```

Add to Guidelines section (after line 176):
- When reviewing code (not PRD) and `has_frontend: true`: if no screenshots exist AND Playwright was available → **Critical** finding. If Playwright was not available → downgrade to **Warning**.

Add to Output Format checklist (after line 138):
```markdown
#### Browser Verification Evidence
- [x/✗/N/A] Screenshot evidence exists
- [x/✗/N/A] Entry page at 3 viewports
- [x/✗/N/A] Zero console errors
- [x/✗/N/A] No error overlay visible
- [x/✗/N/A] Interaction screenshots (if applicable)
```

---

### 4. `commands/test.md` — Step 2 and Step 4
**What**: Make E2E mandatory for frontend projects

#### Step 2, item 3 (~line 64): Change E2E from optional to mandatory for frontend

Replace:
```
- `e2e` -- only if `test_commands.e2e` is configured
```
With:
```
- `e2e` -- **mandatory** if `has_frontend: true` (flag missing config as Critical); otherwise only if configured
```

When `has_frontend: true` and `test_commands.e2e` is not configured → inventory table shows **Critical**: "E2E browser tests are mandatory for frontend projects. Configure `test_commands.e2e` in pipeline.config.yaml."

#### Step 4, test type table (~line 245): Update E2E condition

Change:
```
| E2E | `test_commands.e2e` | Only if configured |
```
To:
```
| E2E | `test_commands.e2e` | **Mandatory** if `has_frontend: true`; optional otherwise |
```

Add enforcement paragraph: When `has_frontend: true` and E2E not configured, report as FAIL (not SKIP). Fix subagent should scaffold a minimal Playwright E2E test and configure `test_commands.e2e`.

---

### 5. `commands/pipeline-init.md` — Playwright onboarding
**What**: Auto-detect Playwright when `has_frontend: true`, prompt to install if missing

Add to Step 3 (~after line 86), after existing package.json detection:

**When `has_frontend: true`:**
1. Check if `@playwright/test` is in `devDependencies`
2. If found → set `test_commands.e2e` to detected command or default `"npx playwright test"`
3. If NOT found → present options:
   - Install now: `npm install -D @playwright/test && npx playwright install chromium`
   - Skip for now (static fallback, Warnings in pipeline)
4. If user installs → set `test_commands.e2e: "npx playwright test"` and uncomment `browser_testing` section in generated config

---

### 6. `commands/fullpipeline.md` + `WORKFLOW.md`
**What**: Update completion report and workflow references

In `fullpipeline.md` completion section (~line 395), add Browser Screenshots row to Smoke Test table.

In `WORKFLOW.md`, update Stage 4 Step 5 description to mention browser validation when `has_frontend: true`.

---

### 7. `test/test-stage-structure.test.js`
**What**: Add structural validation tests

New test cases:
- `execute.md` contains "Playwright" and browser verification paths
- `execute.md` Step 5e references 3 viewport widths (375, 768, 1280)
- `execute.md` Step 5e has static analysis fallback
- `designer-critic.md` has "Browser Verification Evidence" section
- `designer-critic.md` references `.pipeline/screenshots/`
- `test.md` Step 2 flags missing E2E as Critical for frontend
- `test.md` Step 4 marks E2E as mandatory for frontend
- Config template has `browser_testing` section
- Config template has uncommented `e2e` in `test_commands`

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Playwright over Cypress/Puppeteer | Headless by default, built-in screenshot API, ships browsers, no display server needed |
| Fallback to static analysis | Projects without Playwright still work (with Warnings), no hard dependency |
| Screenshots as Designer Critic evidence | Closes the loop — critic can't pass without proof of browser render |
| E2E mandatory only for `has_frontend: true` | Non-frontend projects completely unaffected |
| Visual regression deferred | Needs baseline infrastructure; current value is "does it render at all?", not "does it match previous?" |
| Clean screenshots dir each run | Prevents disk bloat; current run is what matters |
| Max 10 auto-detected routes | Bounds smoke test duration; config override for more |
| Console errors = zero tolerance default | Configurable via `max_console_errors`, but strict by default |

---

## Verification

After implementation:
1. Read all modified files and verify cross-references are consistent
2. Run `npm test` to verify structural validation tests pass
3. Verify non-frontend path: grep for `has_frontend` guards on every browser-specific section
4. Verify fallback path: each Playwright-dependent section has a "Playwright not available" fallback with Warning
5. Run `/validate` against all changed files
