# /tdd-mock-analysis — Mock App Analysis and UI Contract Extraction

You are executing the **tdd-mock-analysis** pipeline stage. This is Stage 3 of the `/tdd-fullpipeline`. You crawl a working mock app with Playwright, extract DOM structure, interactive elements, accessibility information, and keyboard navigation paths, then produce a structured UI contract document that serves as the source of truth for test selectors and component hierarchies.

**Input:** Mock app URL via `$ARGUMENTS` (provided by the user at Gate 2)
**Output:** `docs/tdd/<slug>/ui-contract.md` and screenshots to `.pipeline/tdd/<slug>/mock-screenshots/`

---

## Step 1: Validate Input

Validate the mock app URL provided via `$ARGUMENTS`.

### 1a. URL Scheme Validation

The URL must use `http://` or `https://` scheme only. Reject the following with a clear error message:
- `file://` URLs
- `data:` URLs
- `javascript:` URLs
- Any other non-HTTP(S) scheme

If the URL does not start with `http://` or `https://`, halt with:
```
CRITICAL: Invalid URL scheme. Only http:// and https:// are accepted.
Provided URL: <url>
Rejected schemes: file://, data:, javascript:
```

### 1b. Network Range Validation (RFC 1918)

Parse the hostname from the URL and validate against private network ranges.

**Accepted loopback addresses (allowed):**
- `localhost`
- `127.0.0.0/8` (any address from `127.0.0.1` through `127.255.255.255`)
- `::1` (IPv6 loopback)
- `0.0.0.0`

**Rejected RFC 1918 private ranges:**
- `10.0.0.0/8` (addresses `10.0.0.0` through `10.255.255.255`)
- `172.16.0.0/12` (addresses `172.16.0.0` through `172.31.255.255`)
- `192.168.0.0/16` (addresses `192.168.0.0` through `192.168.255.255`)

If the hostname resolves to a rejected RFC 1918 range, halt with:
```
CRITICAL: Private network address detected. RFC 1918 ranges are not allowed
(except loopback). Provided URL: <url>
Allowed loopback addresses: localhost, 127.0.0.0/8, ::1, 0.0.0.0
Rejected ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
```

### 1c. Port and Timeout Policy

- **No port restriction** is applied. The mock app may run on any port (e.g., `:3000`, `:5173`, `:8080`). Non-HTTP ports are handled by the per-route navigation timeout.
- **Per-route navigation timeout:** 15 seconds. If a single route does not load within 15 seconds, it is marked as failed for that viewport.
- **Total budget:** 300 seconds across all routes and viewports. If the total budget is exhausted, Mock Analysis completes with the routes gathered so far and logs a Warning with the count of routes skipped.

---

## Step 2: Playwright Version Check

Verify that Playwright is installed and meets the minimum version requirement.

1. Run `npx playwright --version` and capture the output.
2. Parse the version string and verify it is **>= 1.40**.
3. If Playwright is not installed or the version is below 1.40, halt with:
   ```
   CRITICAL: Playwright version >= 1.40 is required for Mock Analysis.
   Installed version: <version or "not found">
   Required minimum: 1.40
   Install or update: npm install -D @playwright/test@latest && npx playwright install
   ```

4. Read `pipeline.config.yaml` and extract `tdd.max_mock_routes` (default: **20** if not set or config file does not exist).

Store the config values for use in subsequent steps:
```
max_mock_routes: <value from config or 20>
per_route_timeout: 15s
total_budget: 300s
```

---

## Step 3: Route Discovery

Navigate to the mock app entry page and discover all navigable routes.

### 3a. Entry Page Navigation

1. Launch Playwright browser (Chromium, headless).
2. Navigate to the provided URL (the entry page).
3. Wait for the page to reach `networkidle` state or the 15-second per-route timeout, whichever comes first.

**If the entry page fails to load:**
```
CRITICAL: Entry page failed to load. Mock Analysis cannot proceed.
URL: <url>
Error: <error message>
Recommendation: Verify the mock app is running and accessible at the provided URL.
```
This is a Critical halt -- do not continue to other routes.

### 3b. Link Traversal

1. On the entry page, collect all `<a>` elements with `href` attributes.
2. Filter to same-origin links only (same protocol + hostname + port as the entry URL).
3. Deduplicate by normalized path (strip trailing slashes, normalize query params).
4. Add the entry page itself as the first route.
5. For each discovered link, navigate to it and repeat link collection (breadth-first traversal) up to a maximum depth to discover nested routes.
6. Cap the total route count at `max_mock_routes`.

**If an individual route fails to load:**
```
WARNING: Route failed to load — continuing to next route.
Route: <route path>
Error: <error message>
```
Log the Warning and continue with the remaining routes. Do not halt.

### 3c. Route Manifest

After discovery, produce a route manifest:
```
Routes discovered: N (cap: <max_mock_routes>)
1. / (entry page)
2. /dashboard
3. /settings
...
```

If the route count hits the `max_mock_routes` cap, log:
```
WARNING: Route discovery capped at <max_mock_routes>. Additional links were found
but not traversed. Increase tdd.max_mock_routes in pipeline.config.yaml if needed.
```

---

## Step 4: Per-Route Extraction

For each discovered route, capture screenshots and extract structural information across 3 viewports.

### 4a. Viewport Definitions

| Viewport | Width | Height | Label |
|----------|-------|--------|-------|
| Mobile   | 375   | 812    | `mobile` |
| Tablet   | 768   | 1024   | `tablet` |
| Desktop  | 1280  | 720    | `desktop` |

### 4b. Screenshots

For each route at each viewport:
1. Set the viewport dimensions.
2. Navigate to the route (or resize if already on the route).
3. Wait for `networkidle` or 15-second per-route timeout.
4. Capture a full-page screenshot.
5. Save to `.pipeline/tdd/<slug>/mock-screenshots/` using the naming convention:
   ```
   <route-slug>-<viewport-label>.png
   ```
   Example: `dashboard-mobile.png`, `settings-desktop.png`, `home-tablet.png`

The entry page uses the slug `home`. Route slugs are derived from the path by replacing `/` with `-` and removing leading/trailing dashes.

### 4c. DOM Structure Extraction

For each route (at the desktop viewport as the primary extraction viewport), extract:

1. **Component tree:** The hierarchical structure of semantic HTML elements and component-like containers (`header`, `nav`, `main`, `section`, `article`, `aside`, `footer`, `form`, `dialog`, `[role]` elements). Record nesting depth for each.

2. **Interactive elements:** All elements that a user can interact with:
   - Buttons (`<button>`, `[role="button"]`, `input[type="submit"]`, `input[type="button"]`)
   - Links (`<a>` with `href`)
   - Inputs (`<input>`, `<textarea>`, `<select>`)
   - Custom interactive elements (`[role="tab"]`, `[role="menuitem"]`, `[role="checkbox"]`, `[role="radio"]`, `[role="switch"]`, `[role="slider"]`, `[role="combobox"]`)
   - Elements with click handlers (`[onclick]`, elements with tabindex >= 0)

3. **Form fields:** For each `<form>` or form-like container:
   - Field name (from `name`, `id`, or `aria-label` attribute)
   - Field type (`text`, `email`, `password`, `number`, `select`, `textarea`, `checkbox`, `radio`, etc.)
   - Required status (`required` attribute, `aria-required="true"`)
   - Validation attributes (`pattern`, `min`, `max`, `minlength`, `maxlength`, `type`-based validation)
   - Associated label text

4. **ARIA roles and labels:**
   - All explicit `role` attributes
   - All `aria-label`, `aria-labelledby`, `aria-describedby` values
   - Landmark roles (`banner`, `navigation`, `main`, `complementary`, `contentinfo`, `form`, `search`, `region`)
   - Live regions (`aria-live`, `role="alert"`, `role="status"`)

5. **Tab order:** The sequence of elements reachable via Tab key, derived from DOM order and `tabindex` values. Elements with `tabindex="-1"` are noted as programmatically focusable only.

6. **Data-testid candidates:** For each interactive element, generate a `data-testid` candidate:
   - **Primary convention:** Kebab-case of the accessible name or component purpose.
     - Example: a button with text "Submit Order" gets `submit-order-button`
     - Example: an input with `aria-label="Supplier Name"` gets `supplier-name-input`
     - Example: a nav element with `aria-label="Main Navigation"` gets `main-navigation-menu`
   - **Duplicate disambiguation:** If a candidate is duplicated within the same route, append the parent component context (e.g., `submit-button` in a login form becomes `login-form-submit-button`).
   - **Fallback convention:** Elements with no accessible name and no component name use `{element-type}-{sequential-index}` (e.g., `div-3`, `button-7`). These fallback candidates are logged as Warnings in the UI contract:
     ```
     WARNING: Fallback data-testid generated for element without accessible name.
     Element: <button> at route /dashboard, index 7
     Generated testid: button-7
     Recommendation: Add an aria-label or accessible name to this element in the mock app.
     ```

---

## Step 5: Keyboard Navigation Testing

For each route, test keyboard navigation to verify accessibility.

### 5a. Tab Traversal

1. Focus the document body (or first focusable element).
2. Press Tab repeatedly, recording each element that receives focus.
3. Verify that the focus order matches the expected tab order from Step 4c.
4. Record any elements that are visually interactive but unreachable via Tab.

### 5b. Focus Visibility

For each focused element, verify that:
- The element has a visible focus indicator (outline, border, shadow, or other visual change).
- If no visible focus indicator is detected, log a Warning:
  ```
  WARNING: No visible focus indicator detected.
  Element: <element description> at route <route>
  Recommendation: Ensure focus styles are applied for keyboard accessibility (WCAG 2.4.7).
  ```

### 5c. Activation Testing

For each focused interactive element:
- Press **Enter** and verify the element activates (buttons trigger click, links navigate, etc.).
- Press **Space** and verify activation where applicable (checkboxes toggle, buttons activate).
- Record activation results (success, no response, error).

### 5d. Budget Management

Keyboard navigation testing shares the per-route budget (15 seconds per route). If the budget is exceeded mid-testing:
- Complete the current element's test.
- Log partial results with a Warning:
  ```
  WARNING: Keyboard navigation testing budget exceeded for route <route>.
  Tested: <N> of <M> interactive elements.
  Remaining elements were not tested.
  ```
- Continue to the next route.

If the total 300-second budget is exhausted during keyboard testing:
- Complete with the routes gathered so far.
- Log a Warning with the count of routes where keyboard testing was skipped.

---

## Step 6: Generate UI Contract

Produce the structured UI contract document from all extracted data.

### 6a. Document Structure

The UI contract document (`docs/tdd/<slug>/ui-contract.md`) contains the following sections in order:

#### Section 1: Route Map

A table of all discovered routes with their status:

```markdown
## Route Map

| # | Path | Status | Viewports Captured | Interactive Elements | Forms |
|---|------|--------|--------------------|---------------------|-------|
| 1 | / | OK | 3/3 | 12 | 1 |
| 2 | /dashboard | OK | 3/3 | 8 | 0 |
| 3 | /settings | WARNING: partial | 2/3 | 5 | 2 |
```

#### Section 2: Component Inventory

For each route, a hierarchical listing of semantic components:

```markdown
## Component Inventory

### Route: / (Home)
- header (landmark: banner)
  - nav (landmark: navigation, aria-label: "Main Navigation")
    - a[href="/dashboard"] "Dashboard"
    - a[href="/settings"] "Settings"
- main (landmark: main)
  - section (aria-label: "Hero")
    - h1 "Welcome"
    - button "Get Started"
  - section (aria-label: "Features")
    - article "Feature 1"
    - article "Feature 2"
- footer (landmark: contentinfo)
```

#### Section 3: Interactive Elements

For each route, a table of all interactive elements:

```markdown
## Interactive Elements

### Route: / (Home)

| # | Element | Type | Text/Label | data-testid Candidate | ARIA Role | Tab Order |
|---|---------|------|------------|----------------------|-----------|-----------|
| 1 | a | link | "Dashboard" | dashboard-link | link | 1 |
| 2 | a | link | "Settings" | settings-link | link | 2 |
| 3 | button | button | "Get Started" | get-started-button | button | 3 |
```

#### Section 4: Form Contracts

For each form discovered:

```markdown
## Form Contracts

### Route: /settings — Settings Form

| Field | Type | Required | Validation | Label | data-testid Candidate |
|-------|------|----------|------------|-------|----------------------|
| name | text | yes | maxlength: 100 | "Display Name" | display-name-input |
| email | email | yes | type: email | "Email Address" | email-address-input |
| role | select | yes | — | "Role" | role-select |

**Submit:** button "Save Changes" → `save-changes-button`
**Reset:** button "Cancel" → `cancel-button`
```

#### Section 5: Accessibility Map

For each route:

```markdown
## Accessibility Map

### Route: / (Home)

**Landmarks:**
- banner: header
- navigation: nav (aria-label: "Main Navigation")
- main: main
- contentinfo: footer

**ARIA Labels:**
- nav: "Main Navigation"
- section: "Hero"
- section: "Features"

**Live Regions:** None

**Keyboard Navigation:**
- Tab order: 8 elements reachable
- Focus visibility: 8/8 elements have visible focus indicators
- Enter/Space activation: 8/8 elements respond correctly
- Issues: None
```

#### Section 6: Data-Testid Registry

A consolidated, deduplicated registry of all generated `data-testid` candidates across all routes:

```markdown
## Data-Testid Registry

| data-testid | Element | Route | Source |
|-------------|---------|-------|--------|
| dashboard-link | a | / | accessible name |
| settings-link | a | / | accessible name |
| get-started-button | button | / | accessible name |
| display-name-input | input[name="name"] | /settings | aria-label |
| email-address-input | input[name="email"] | /settings | aria-label |
| role-select | select[name="role"] | /settings | aria-label |
| save-changes-button | button | /settings | accessible name |
| cancel-button | button | /settings | accessible name |
| button-7 | button | /dashboard | **fallback** |
```

Entries marked **fallback** are elements without accessible names. These should be flagged for improvement.

#### Section 7: Screenshots

Paths to all captured screenshots:

```markdown
## Screenshots

All screenshots are saved to `.pipeline/tdd/<slug>/mock-screenshots/`.

| Route | Mobile (375x812) | Tablet (768x1024) | Desktop (1280x720) |
|-------|-----------------|-------------------|-------------------|
| / | home-mobile.png | home-tablet.png | home-desktop.png |
| /dashboard | dashboard-mobile.png | dashboard-tablet.png | dashboard-desktop.png |
| /settings | settings-mobile.png | settings-tablet.png | settings-desktop.png |
```

### 6b. Character Limit Enforcement

The UI contract document must not exceed **50,000 characters**.

After generating the full document, measure its character count. If it exceeds 50,000 characters:

1. Calculate the overage.
2. Remove routes from the end of the route list (lowest-priority routes first — routes discovered later in the traversal are considered lower priority).
3. For each removed route, strip its entries from all sections (Component Inventory, Interactive Elements, Form Contracts, Accessibility Map, Data-Testid Registry, Screenshots).
4. Re-measure until the document is within the 50,000-character limit.
5. Add a Warning at the top of the document:
   ```
   WARNING: UI contract truncated to 50,000 character limit.
   Routes dropped: <N> (of <total discovered>)
   Dropped routes: <list of dropped route paths>
   Increase tdd.max_mock_routes or simplify the mock app to include all routes.
   ```

### 6c. Write Output

1. Create the directory `docs/tdd/<slug>/` if it does not exist.
2. Write the UI contract to `docs/tdd/<slug>/ui-contract.md`.
3. Verify the screenshots directory `.pipeline/tdd/<slug>/mock-screenshots/` exists and contains the expected files.

---

## Step 7: Critic Review (10-Critic Ralph Loop)

Run a 10-critic Ralph Loop on the generated UI contract document.

### 7a. Critic Invocation

Spawn all applicable critic subagents in parallel using the Task tool. Read `pipeline.config.yaml` for the `tdd_stages.mock_analysis.critics` list. Default: `[product, dev, devops, qa, security, performance, data-integrity]` + `observability` if `has_backend_service: true` + `api-contract` if `has_api: true` + `designer` if `has_frontend: true`.

**Subagent prompt (per critic):**
```
<paste ${CLAUDE_PLUGIN_ROOT}/pipeline/agents/[role]-critic.md>

## What to review
You are reviewing a UI contract extracted from a mock app by Playwright.
The UI contract is the source of truth for test selectors, component hierarchies,
and accessibility requirements in the TDD pipeline.

File: docs/tdd/<slug>/ui-contract.md

## Review Focus
1. Are all routes documented with complete extraction data?
2. Are data-testid candidates well-formed and unambiguous?
3. Are form contracts complete (all fields, validation, labels)?
4. Is the Accessibility Map thorough (landmarks, ARIA, keyboard nav)?
5. Are there any gaps between what a test author would need and what is provided?
6. Are any fallback data-testid entries present that should have accessible names?

## Output
Produce your review with verdict (PASS/FAIL), score (1-10), and findings
(Critical, Warning, Info).
```

### 7b. Scoring Loop

- **Per-critic minimum score:** 8.5
- **Overall minimum:** 9.0
- **Max iterations:** 5
- **Pass condition:** 0 Critical findings + 0 Warnings across all critics

**Loop logic:**
1. Collect scores from all critics.
2. If ALL per-critic scores > 8.5 AND overall average > 9.0 AND 0 Critical + 0 Warnings --> exit loop, proceed to Step 8.
3. If thresholds not met and iteration < 5:
   a. Identify critics with scores <= 8.5 or Critical/Warning findings.
   b. Collect their specific feedback.
   c. Revise the UI contract to address findings from lowest-scoring critics first.
   d. Re-run ALL critics (revisions can affect other scores).
4. If max iterations reached without passing --> log the final scores and proceed with a Warning to the user that critic thresholds were not fully met.

---

## Step 8: Human Gate

Present the extracted UI contract summary to the user for review and approval.

### 8a. Contract Summary

Display a summary of the extraction results:

```
## Mock Analysis Complete — Gate 3

### Extraction Summary
- Routes discovered: <N>
- Screenshots captured: <N> (across 3 viewports)
- Interactive elements: <total count>
- Forms: <total count>
- Data-testid candidates: <total count> (<fallback count> fallback)
- Keyboard navigation: <tested count>/<total routes> routes tested
- Accessibility issues: <count>

### Critic Review
Ralph Loop iterations: <N>
Final scores: <per-critic scores>
Overall: <average>
Unresolved findings: <count or "None">

### UI Contract
File: docs/tdd/<slug>/ui-contract.md
Screenshots: .pipeline/tdd/<slug>/mock-screenshots/
```

### 8b. Cross-Reference Against Design Brief

Read the Design Brief from `docs/tdd/<slug>/design-brief.md` and cross-reference:

1. **Route manifest comparison:** For each route listed in the Design Brief's route manifest, check if a corresponding route exists in the extracted UI contract Route Map.
   - Routes present in the Design Brief but missing from the UI contract are flagged:
     ```
     WARNING: Route in Design Brief not found in mock app.
     Design Brief route: /reports
     Action: Add this route to the mock app and re-run Mock Analysis, or confirm it is intentionally excluded.
     ```

2. **Component inventory comparison:** For each interactive element specified in the Design Brief's component inventory, check if a corresponding element exists in the UI contract's Interactive Elements or Form Contracts.
   - Interactive elements specified in the Design Brief but not found in the DOM are flagged:
     ```
     WARNING: Interactive element in Design Brief not found in mock app DOM.
     Design Brief element: "Export Report" button on /reports
     Action: Add this element to the mock app and re-run Mock Analysis, or confirm it is intentionally excluded.
     ```

3. **Present the cross-reference results:**
   ```
   ### Cross-Reference: Design Brief vs. UI Contract

   Routes matched: <N>/<M>
   Routes missing from mock: <list or "None">

   Interactive elements matched: <N>/<M>
   Elements missing from mock: <list or "None">
   ```

### 8c. User Decision

Prompt the user:

```
Review the UI contract and cross-reference results above.
You may:
1. APPROVE — proceed to Stage 4 (Test Plan) with this UI contract
2. CORRECT — note any misidentified elements or missing routes to fix
3. RE-RUN — update the mock app and re-run Mock Analysis
4. ABORT — stop the pipeline

Choice:
```

If the user chooses CORRECT, apply their corrections to the UI contract and re-save. If the user chooses RE-RUN, return to Step 1 with the same or updated URL. If the user chooses ABORT, log residual artifacts and halt.

Wait for user approval before proceeding.
