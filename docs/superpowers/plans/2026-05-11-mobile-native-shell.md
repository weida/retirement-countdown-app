# Mobile Native Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the in-APK UX from "embedded webpage" to native-feel shell — Android back-gesture interception, safe-area padding, vertically distributed content, bottom-sheet settings, custom picker, mood-aware status bar, targeted haptics.

**Architecture:** Vanilla JS + Capacitor 8 PWA. Add `@capacitor/status-bar` and `@capacitor/haptics` (App plugin already installed). All native paths use dynamic `import()` inside `Capacitor.isNativePlatform()` guards + try/catch so web build is untouched. Settings dialog stays semantically a `<dialog>` but becomes a bottom-sheet on ≤640px via CSS. Native `<select>` elements replaced with `<button> + hidden <input>` pair plus a dedicated picker `<dialog>` — hidden input keeps existing form/listener wiring intact.

**Tech Stack:** Capacitor 8.x (App / StatusBar / Haptics plugins), CSS env() safe-area, HTML `<dialog>`, Web Animations API, Vite 7, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-05-11-mobile-native-shell-design.md`

---

## Notes on testing

The project has **no UI test framework** — only `vitest` units for `src/retirement.js`. Every task ends with `npm test` (must stay 11/11 green because retirement.js is untouched) and `npm run build` (must be clean). UI behavior is verified manually via the APK; the spec contains the manual checklist.

The plan is structured around small commits because they are the rollback unit. Don't squash mid-implementation.

---

### Task 1: Add Capacitor StatusBar and Haptics plugins

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (npm install output)
- Modify: `capacitor.config.json`

- [ ] **Step 1: Install plugins**

```bash
cd /home/garlic/github/retirement-countdown-app
npm install @capacitor/status-bar@^8 @capacitor/haptics@^8
```

Expected: two new deps added to `package.json` under `dependencies`. `package-lock.json` updated.

- [ ] **Step 2: Add StatusBar default config**

Edit `capacitor.config.json` to:

```json
{
  "appId": "com.codex.retirementcountdown",
  "appName": "退休倒计时",
  "webDir": "dist",
  "plugins": {
    "LocalNotifications": {
      "iconColor": "#126c62"
    },
    "StatusBar": {
      "overlaysWebView": false,
      "style": "DEFAULT",
      "backgroundColor": "#f7f4ed"
    }
  }
}
```

`DEFAULT` style starts with day-mood-appropriate icons; runtime code in Task 6 will switch it on mood change.

- [ ] **Step 3: Verify tests + build**

```bash
npm test
npm run build
```

Expected: 11/11 tests pass; build clean.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json capacitor.config.json
git commit -m "feat: add @capacitor/status-bar and @capacitor/haptics plugins"
```

---

### Task 2: Card vertical distribution + safe-area

**Files:**
- Modify: `index.html` (wrap sections in cluster divs)
- Modify: `styles.css` (space-between, safe-area, drop mobile center override)

- [ ] **Step 1: Wrap card sections in clusters**

In `index.html`, replace the inside of `<article class="countdown-card" aria-label="退休倒计时">` so the top group (card-top + month-band) and bottom group (stamps + card-foot) each live in a `.cluster` wrapper. The middle `.hero` stays a direct child so it occupies the centre via `space-between`.

Final structure (only the wrappers are new — content inside each section stays exactly as is):

```html
<article class="countdown-card" aria-label="退休倒计时">
  <div class="cluster cluster--top">
    <header class="card-top">
      <!-- existing: eyebrow + card-actions (mood + settings buttons) unchanged -->
    </header>
    <section class="month-band" aria-label="退休年月份带">
      <!-- existing: band-meta + month-dots unchanged -->
    </section>
  </div>

  <section class="hero">
    <span class="hero-number" id="heroCount">--</span>
    <span class="hero-unit">天</span>
  </section>

  <div class="cluster cluster--bottom">
    <section class="stamps" aria-label="详细倒计时">
      <!-- existing: 3 stamp articles unchanged -->
    </section>
    <footer class="card-foot">
      <!-- existing: todayLabel + targetLabel + retirementStatus unchanged -->
    </footer>
  </div>

  <dialog class="settings-dialog" id="settingsDialog" aria-labelledby="settingsTitle">
    <!-- unchanged -->
  </dialog>
</article>
```

- [ ] **Step 2: Update `.countdown-card` flex rule to space-between**

In `styles.css`, replace the `.countdown-card` rule (around line 110):

```css
.countdown-card {
  width: min(640px, 100%);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 92%, transparent), var(--card)),
    var(--card);
  border: 1px solid var(--line-soft);
  border-radius: 28px;
  padding: clamp(28px, 4vw, 44px);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 24px;
  position: relative;
  overflow: hidden;
  transition: background 0.6s ease, border-color 0.6s ease, box-shadow 0.6s ease;
  animation: card-enter 0.6s ease both;
}
```

The only change vs current is the added `justify-content: space-between` and the gap reduced from 28 to 24.

- [ ] **Step 3: Add `.cluster` rule**

In `styles.css`, immediately after the new `.countdown-card` rule, add:

```css
.cluster {
  display: flex;
  flex-direction: column;
  gap: 20px;
  z-index: 1;
}
```

- [ ] **Step 4: Update `body` padding to use safe-area-inset**

In `styles.css`, replace the entire `body { ... }` rule (around line 77–93). Only the `padding` line changes; everything else stays identical:

```css
body {
  margin: 0;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    "PingFang SC", "Microsoft YaHei", sans-serif;
  background:
    radial-gradient(1200px 600px at 80% -10%, var(--accent-soft), transparent 60%),
    radial-gradient(900px 500px at -10% 110%, var(--accent-soft), transparent 60%),
    var(--bg);
  color: var(--text);
  transition: background-color 0.6s ease, color 0.6s ease;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding:
    max(24px, env(safe-area-inset-top))
    max(24px, env(safe-area-inset-right))
    max(24px, env(safe-area-inset-bottom))
    max(24px, env(safe-area-inset-left));
}
```

- [ ] **Step 5: Update mobile `body` padding + drop card-center override**

In `styles.css`, inside the `@media (max-width: 520px) { ... }` block, replace the `body` rule and `.countdown-card` rule:

```css
@media (max-width: 520px) {
  body {
    padding:
      max(14px, env(safe-area-inset-top))
      max(14px, env(safe-area-inset-right))
      max(14px, env(safe-area-inset-bottom))
      max(14px, env(safe-area-inset-left));
    align-items: stretch;
  }

  .app-shell {
    align-items: stretch;
  }

  .countdown-card {
    border-radius: 22px;
    gap: 20px;
    padding: 24px;
  }

  /* rest of @media block (.month-dots, .stamps, .stamp, .band-caption, .settings-dialog form) unchanged */
}
```

Note: `justify-content: center` was removed from the mobile `.countdown-card` override — the main rule's `space-between` now applies on mobile.

- [ ] **Step 6: Visual verify (manual)**

```bash
npm run dev
```

Open http://127.0.0.1:4173 in Chrome DevTools with mobile emulation set to ~400×800. Expect:
- Header (eyebrow + buttons) sits near the top
- Month-band right below header
- Hero number sits centred vertically
- Stamps + footer pinned near the bottom
- No large empty whitespace bands above or below the content

Stop the dev server (Ctrl+C).

- [ ] **Step 7: Tests + build**

```bash
npm test
npm run build
```

Expected: 11/11 pass; build clean.

- [ ] **Step 8: Commit**

```bash
git add index.html styles.css
git commit -m "feat(ui): distribute card content with space-between and safe-area"
```

---

### Task 3: Settings dialog → bottom sheet visuals

**Files:**
- Modify: `index.html` (add drawer handle inside settings form)
- Modify: `styles.css` (sheet styles + @media (max-width: 640px) override)

- [ ] **Step 1: Add drawer handle inside settings form**

In `index.html`, inside `<form id="settingsForm" method="dialog">` — immediately after the opening `<form>` tag and before the existing `<header class="dialog-head">` — insert:

```html
<button type="button" class="sheet-handle" id="settingsHandle" aria-label="拖拽下拉关闭设置">
  <span class="sheet-handle-bar" aria-hidden="true"></span>
</button>
```

- [ ] **Step 2: Add base sheet-handle styles**

Append to `styles.css` (before the final `@media` blocks):

```css
.sheet-handle {
  display: none;
  width: 100%;
  background: transparent;
  border: 0;
  padding: 8px 0 4px;
  cursor: grab;
  touch-action: none;
}

.sheet-handle-bar {
  display: block;
  width: 36px;
  height: 4px;
  margin: 0 auto;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 60%, transparent);
}

.sheet-handle:active {
  cursor: grabbing;
}
```

- [ ] **Step 3: Add bottom-sheet @media block**

Append to `styles.css` after the existing `@media (max-width: 520px)` block:

```css
@media (max-width: 640px) {
  .settings-dialog {
    margin: 0;
    width: 100vw;
    max-width: 100vw;
    inset: auto 0 0 0;
    max-height: 92dvh;
    border-radius: 22px 22px 0 0;
    animation: sheet-slide-up 0.32s cubic-bezier(.2, .7, .2, 1);
  }

  .settings-dialog form {
    border-radius: 22px 22px 0 0;
    padding: 0 20px max(20px, env(safe-area-inset-bottom)) 20px;
    max-height: 92dvh;
  }

  .sheet-handle {
    display: block;
  }
}

@keyframes sheet-slide-up {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
```

- [ ] **Step 4: Visual verify (manual)**

```bash
npm run dev
```

Mobile viewport (≤640px). Click the gear icon → settings panel slides up from the bottom, sits flush with the bottom edge, has a small grey handle bar at the top, and rounded top corners (square bottom).

Stop dev server.

- [ ] **Step 5: Tests + build**

```bash
npm test
npm run build
```

Expected: 11/11 pass; build clean.

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css
git commit -m "feat(ui): bottom-sheet settings on mobile"
```

---

### Task 4: Sheet drag-to-close handler

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Register `els.settingsHandle`**

In `src/main.js`, in the `const els = { ... }` block, add this line (preserving alphabetical-ish grouping, near `settingsDialog`):

```javascript
  settingsHandle: document.querySelector("#settingsHandle"),
```

- [ ] **Step 2: Add `setupSheetDragToClose()` function**

In `src/main.js`, immediately after `closeSettingsDialog()` (around line 210), add:

```javascript
function setupSheetDragToClose() {
  if (!els.settingsHandle) return;
  const DRAG_THRESHOLD_PX = 80;
  const VELOCITY_THRESHOLD = 0.5; // px per ms

  const dialog = els.settingsDialog;
  let startY = 0;
  let startTime = 0;
  let dragging = false;
  let translate = 0;

  function reset() {
    dragging = false;
    dialog.style.transition = "transform 0.25s cubic-bezier(.2,.7,.2,1)";
    dialog.style.transform = "";
    requestAnimationFrame(() => {
      dialog.style.transition = "";
    });
  }

  els.settingsHandle.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) return;
    startY = event.touches[0].clientY;
    startTime = Date.now();
    translate = 0;
    dragging = true;
    dialog.style.transition = "none";
  }, { passive: true });

  els.settingsHandle.addEventListener("touchmove", (event) => {
    if (!dragging || event.touches.length !== 1) return;
    const dy = event.touches[0].clientY - startY;
    translate = Math.max(0, dy);
    dialog.style.transform = `translateY(${translate}px)`;
  }, { passive: true });

  els.settingsHandle.addEventListener("touchend", () => {
    if (!dragging) return;
    const duration = Math.max(Date.now() - startTime, 1);
    const velocity = translate / duration;
    if (translate > DRAG_THRESHOLD_PX || velocity > VELOCITY_THRESHOLD) {
      closeSettingsDialog();
    }
    reset();
  });

  els.settingsHandle.addEventListener("touchcancel", reset);
}
```

- [ ] **Step 3: Call `setupSheetDragToClose()` from `init()`**

In `src/main.js`, in `init()`, find the block:

```javascript
  els.openSettings.addEventListener("click", openSettingsDialog);
  els.closeSettings.addEventListener("click", closeSettingsDialog);

  window.setInterval(updateCountdown, 60 * 1000);
```

Insert a call between the two existing lines:

```javascript
  els.openSettings.addEventListener("click", openSettingsDialog);
  els.closeSettings.addEventListener("click", closeSettingsDialog);

  setupSheetDragToClose();

  window.setInterval(updateCountdown, 60 * 1000);
```

- [ ] **Step 4: Tests + build**

```bash
npm test
npm run build
```

Expected: 11/11 pass; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/main.js
git commit -m "feat(ui): drag-to-close handle for settings sheet"
```

---

### Task 5: Picker component for setting selects

**Files:**
- Modify: `index.html` (3 selects → button + hidden input; add picker-sheet dialog)
- Modify: `styles.css` (picker-trigger / picker-sheet styles)
- Modify: `src/main.js` (PICKER_OPTIONS registry, picker controller, setHiddenAndLabel helper)

- [ ] **Step 1: Convert `calculationMode` select**

In `index.html`, locate the existing block:

```html
<label class="stack">
  <span>方式</span>
  <select id="calculationMode">
    <option value="policy">按中国法定退休政策自动计算</option>
    <option value="manual">手动设置退休日期</option>
  </select>
</label>
```

Replace with:

```html
<label class="stack picker-stack">
  <span>方式</span>
  <button type="button" class="picker-trigger" data-picker="calculationMode" aria-haspopup="listbox">
    <span class="picker-value" id="calculationModeLabel">按中国法定退休政策自动计算</span>
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6"></path>
    </svg>
  </button>
  <input type="hidden" id="calculationMode" value="policy" />
</label>
```

- [ ] **Step 2: Convert `workerType` select**

Locate:

```html
<label class="stack">
  <span>人员类型</span>
  <select id="workerType">
    <option value="male">男职工:原 60 岁退休</option>
    <option value="female55">女职工:原 55 岁退休</option>
    <option value="female50">女职工:原 50 岁退休</option>
  </select>
</label>
```

Replace with:

```html
<label class="stack picker-stack">
  <span>人员类型</span>
  <button type="button" class="picker-trigger" data-picker="workerType" aria-haspopup="listbox">
    <span class="picker-value" id="workerTypeLabel">男职工:原 60 岁退休</span>
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6"></path>
    </svg>
  </button>
  <input type="hidden" id="workerType" value="male" />
</label>
```

- [ ] **Step 3: Convert `flexMode` select**

Locate:

```html
<label class="stack">
  <span>弹性退休</span>
  <select id="flexMode">
    <option value="statutory">按改革后法定退休年龄</option>
    <option value="early">弹性提前退休,提前 3 年内</option>
    <option value="late">弹性延迟退休,延迟 3 年内</option>
  </select>
</label>
```

Replace with:

```html
<label class="stack picker-stack">
  <span>弹性退休</span>
  <button type="button" class="picker-trigger" data-picker="flexMode" aria-haspopup="listbox">
    <span class="picker-value" id="flexModeLabel">按改革后法定退休年龄</span>
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6"></path>
    </svg>
  </button>
  <input type="hidden" id="flexMode" value="statutory" />
</label>
```

- [ ] **Step 4: Add picker-sheet dialog**

In `index.html`, immediately after the closing `</dialog>` of `#settingsDialog` (still inside `<main class="app-shell">`), add:

```html
<dialog class="picker-sheet" id="pickerSheet" aria-labelledby="pickerTitle">
  <button type="button" class="sheet-handle" id="pickerHandle" aria-label="拖拽下拉关闭">
    <span class="sheet-handle-bar" aria-hidden="true"></span>
  </button>
  <header class="picker-head">
    <h3 id="pickerTitle">选择</h3>
    <button type="button" class="icon-btn" id="pickerClose" aria-label="关闭">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>
      </svg>
    </button>
  </header>
  <ul class="picker-options" id="pickerOptions" role="listbox"></ul>
</dialog>
```

- [ ] **Step 5: Add picker CSS**

Append to `styles.css` (before the final `@media (prefers-reduced-motion: reduce)` block):

```css
.picker-trigger {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: color-mix(in srgb, var(--card) 80%, transparent);
  color: var(--text);
  cursor: pointer;
  text-align: left;
  font: inherit;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.picker-trigger:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.picker-value {
  flex: 1;
  line-height: 1.4;
  white-space: normal;
  word-break: break-word;
}

.picker-trigger svg {
  flex-shrink: 0;
  color: var(--muted);
}

.picker-sheet {
  border: none;
  padding: 0;
  background: var(--card);
  color: var(--text);
  width: min(560px, calc(100% - 24px));
  max-height: 70dvh;
  border-radius: 22px;
  box-shadow: var(--shadow);
}

.picker-sheet::backdrop {
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  backdrop-filter: blur(6px);
}

.picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px 0 20px;
}

.picker-head h3 {
  margin: 0;
  font-family: var(--serif);
  font-weight: 700;
  font-size: 1.15rem;
}

.picker-options {
  list-style: none;
  margin: 0;
  padding: 8px 8px max(16px, env(safe-area-inset-bottom)) 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  max-height: calc(70dvh - 56px);
}

.picker-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s ease;
  line-height: 1.4;
}

.picker-option:hover,
.picker-option:focus-visible {
  background: var(--accent-soft);
  outline: none;
}

.picker-option[aria-selected="true"] {
  color: var(--accent-strong);
  font-weight: 600;
}

.picker-option .check {
  flex-shrink: 0;
  color: var(--accent);
  opacity: 0;
}

.picker-option[aria-selected="true"] .check {
  opacity: 1;
}

@media (max-width: 640px) {
  .picker-sheet {
    margin: 0;
    width: 100vw;
    max-width: 100vw;
    inset: auto 0 0 0;
    border-radius: 22px 22px 0 0;
    animation: sheet-slide-up 0.32s cubic-bezier(.2, .7, .2, 1);
  }

  .picker-sheet .sheet-handle {
    display: block;
  }
}
```

- [ ] **Step 6: Add `PICKER_OPTIONS` registry in `main.js`**

In `src/main.js`, immediately after the `defaults` const (around line 27), add:

```javascript
const PICKER_OPTIONS = {
  calculationMode: [
    { value: "policy", label: "按中国法定退休政策自动计算" },
    { value: "manual", label: "手动设置退休日期" },
  ],
  workerType: [
    { value: "male", label: "男职工:原 60 岁退休" },
    { value: "female55", label: "女职工:原 55 岁退休" },
    { value: "female50", label: "女职工:原 50 岁退休" },
  ],
  flexMode: [
    { value: "statutory", label: "按改革后法定退休年龄" },
    { value: "early", label: "弹性提前退休,提前 3 年内" },
    { value: "late", label: "弹性延迟退休,延迟 3 年内" },
  ],
};
```

- [ ] **Step 7: Extend `els` registry**

In `src/main.js`, add these entries to the `els` object:

```javascript
  calculationModeLabel: document.querySelector("#calculationModeLabel"),
  workerTypeLabel: document.querySelector("#workerTypeLabel"),
  flexModeLabel: document.querySelector("#flexModeLabel"),
  pickerSheet: document.querySelector("#pickerSheet"),
  pickerTitle: document.querySelector("#pickerTitle"),
  pickerOptions: document.querySelector("#pickerOptions"),
  pickerClose: document.querySelector("#pickerClose"),
  pickerHandle: document.querySelector("#pickerHandle"),
```

- [ ] **Step 8: Add picker controller**

In `src/main.js`, immediately after `closeSettingsDialog()` and before `setupSheetDragToClose()` (or wherever sequentially makes sense — order of function declarations doesn't matter, but keep related code together), add:

```javascript
function setupPickers() {
  document.querySelectorAll(".picker-trigger").forEach((trigger) => {
    trigger.addEventListener("click", () => openPicker(trigger.dataset.picker));
  });
  els.pickerClose.addEventListener("click", closePicker);
  els.pickerSheet.addEventListener("click", (event) => {
    if (event.target === els.pickerSheet) closePicker();
  });
}

function openPicker(field) {
  const options = PICKER_OPTIONS[field];
  if (!options) {
    console.warn(`Unknown picker field: ${field}`);
    return;
  }
  const input = document.getElementById(field);
  const currentValue = input?.value ?? "";

  els.pickerTitle.textContent = pickerTitleFor(field);
  els.pickerOptions.replaceChildren();

  options.forEach((opt) => {
    const li = document.createElement("li");
    li.className = "picker-option";
    li.setAttribute("role", "option");
    li.dataset.value = opt.value;
    li.setAttribute("aria-selected", String(opt.value === currentValue));
    const text = document.createElement("span");
    text.textContent = opt.label;
    li.appendChild(text);
    const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    check.setAttribute("class", "check");
    check.setAttribute("viewBox", "0 0 24 24");
    check.setAttribute("width", "18");
    check.setAttribute("height", "18");
    check.setAttribute("fill", "none");
    check.setAttribute("stroke", "currentColor");
    check.setAttribute("stroke-width", "2.4");
    check.setAttribute("stroke-linecap", "round");
    check.setAttribute("stroke-linejoin", "round");
    check.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M5 12l4 4L19 7");
    check.appendChild(path);
    li.appendChild(check);
    li.addEventListener("click", () => {
      setPickerValue(field, opt.value, opt.label);
      closePicker();
    });
    els.pickerOptions.appendChild(li);
  });

  if (typeof els.pickerSheet.showModal === "function") {
    els.pickerSheet.showModal();
  } else {
    els.pickerSheet.setAttribute("open", "");
  }
}

function closePicker() {
  if (typeof els.pickerSheet.close === "function") {
    els.pickerSheet.close();
  } else {
    els.pickerSheet.removeAttribute("open");
  }
}

function setPickerValue(field, value, label) {
  const input = document.getElementById(field);
  const labelEl = document.getElementById(`${field}Label`);
  if (!input) return;
  input.value = value;
  if (labelEl) labelEl.textContent = label;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function pickerTitleFor(field) {
  switch (field) {
    case "calculationMode": return "计算方式";
    case "workerType": return "人员类型";
    case "flexMode": return "弹性退休";
    default: return "选择";
  }
}
```

(Note: building the `<svg>` programmatically avoids the `<svg>` namespace pitfall that bites `innerHTML` parsing — child elements parsed via innerHTML on a non-namespaced parent become HTML elements, not SVG, and render invisibly.)

- [ ] **Step 9: Replace `applySettingsToForm()` to drive picker labels**

In `src/main.js`, replace the existing `applySettingsToForm()` function (around line 170) with:

```javascript
function applySettingsToForm() {
  setHiddenAndLabel("calculationMode", settings.calculationMode);
  els.birthDate.value = settings.birthDate;
  setHiddenAndLabel("workerType", settings.workerType);
  setHiddenAndLabel("flexMode", settings.flexMode);
  els.flexMonths.value = settings.flexMonths;
  updateFlexSliderDisplay(settings.flexMonths);
  els.retireDate.value = settings.retireDate;
  els.reminderTime.value = settings.reminderTime;
  els.reminderText.value = settings.reminderText;
}

function setHiddenAndLabel(field, value) {
  const input = document.getElementById(field);
  const labelEl = document.getElementById(`${field}Label`);
  if (!input) return;
  input.value = value;
  const option = (PICKER_OPTIONS[field] || []).find((opt) => opt.value === value);
  if (labelEl && option) labelEl.textContent = option.label;
}
```

- [ ] **Step 10: Wire `setupPickers()` into `init()`**

In `src/main.js`, in `init()`, just before the new `setupSheetDragToClose()` call added in Task 4, insert:

```javascript
  setupPickers();
```

Final block becomes:

```javascript
  els.openSettings.addEventListener("click", openSettingsDialog);
  els.closeSettings.addEventListener("click", closeSettingsDialog);

  setupPickers();
  setupSheetDragToClose();

  window.setInterval(updateCountdown, 60 * 1000);
```

- [ ] **Step 11: Visual verify (manual)**

```bash
npm run dev
```

Mobile viewport. Open settings → click "人员类型" → picker sheet opens, all 3 options shown in full (no truncation), the currently selected one has a ✓ on the right and accent color on text. Click another option → sheet closes, the trigger button text in settings updates. If you set a `birthDate` first, changing `workerType` triggers a fresh `policyResult` recalculation (because hidden input dispatches `input`/`change` events).

Stop dev server.

- [ ] **Step 12: Tests + build**

```bash
npm test
npm run build
```

Expected: 11/11 pass; build clean.

- [ ] **Step 13: Commit**

```bash
git add index.html styles.css src/main.js
git commit -m "feat(ui): custom picker for setting selects (full-text options)"
```

---

### Task 6: Status bar follows mood

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add `applyStatusBar()` helper**

In `src/main.js`, immediately after `applyMood()` (around line 194), add:

```javascript
async function applyStatusBar(mood) {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: mood === "dusk" ? Style.Dark : Style.Light });
    if (Capacitor.getPlatform() === "android") {
      await StatusBar.setBackgroundColor({ color: mood === "dusk" ? "#1a1411" : "#f7f4ed" });
    }
  } catch {
    // plugin unavailable or unsupported on this device; ignore
  }
}
```

Mapping rationale: `Style.Light` = light status-bar background → dark icons (correct for day). `Style.Dark` = dark background → light icons (correct for dusk). iOS uses `setStyle` only; Android also needs `setBackgroundColor`.

- [ ] **Step 2: Call `applyStatusBar()` from `applyMood()`**

In `src/main.js`, append `applyStatusBar(mood);` at the end of `applyMood()`. Final function:

```javascript
function applyMood() {
  const mood = settings.mood === "dusk" ? "dusk" : "day";
  document.body.dataset.mood = mood;
  els.moodToggle.title = mood === "dusk" ? "切换到白昼" : "切换到傍晚";
  const themeColor = mood === "dusk" ? "#1a1411" : "#f7f4ed";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);
  applyStatusBar(mood);
}
```

Fire-and-forget is intentional — applyMood stays synchronous, native bar updates lag a few ms but visual mood transitions already take 0.6s.

- [ ] **Step 3: Tests + build**

```bash
npm test
npm run build
```

Expected: 11/11 pass; build clean.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat: status bar tint follows day/dusk mood"
```

---

### Task 7: Targeted haptics on key interactions

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add `triggerHaptic()` helper**

In `src/main.js`, immediately after `applyStatusBar()`, add:

```javascript
async function triggerHaptic(style = "Light") {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    const impact = style === "Medium" ? ImpactStyle.Medium : ImpactStyle.Light;
    await Haptics.impact({ style: impact });
  } catch {
    // plugin or hardware unavailable; ignore
  }
}
```

- [ ] **Step 2: Haptic on mood toggle**

In `src/main.js`, in `init()`, replace the existing mood-toggle handler:

```javascript
  els.moodToggle.addEventListener("click", () => {
    settings.mood = settings.mood === "dusk" ? "day" : "dusk";
    saveSettings();
    applyMood();
    triggerHaptic();
  });
```

- [ ] **Step 3: Haptic on settings open/close**

In `src/main.js`, replace `openSettingsDialog()` and `closeSettingsDialog()`:

```javascript
function openSettingsDialog() {
  if (typeof els.settingsDialog.showModal === "function") {
    els.settingsDialog.showModal();
  } else {
    els.settingsDialog.setAttribute("open", "");
  }
  triggerHaptic();
}

function closeSettingsDialog() {
  if (typeof els.settingsDialog.close === "function") {
    els.settingsDialog.close();
  } else {
    els.settingsDialog.removeAttribute("open");
  }
  triggerHaptic();
}
```

- [ ] **Step 4: Haptic on save**

In `src/main.js`, find the form submit handler (around line 94). After the line `saveSettings();` add `triggerHaptic("Medium");`. Result:

```javascript
    saveSettings();
    triggerHaptic("Medium");
    updateCountdown();
    await scheduleReminder();
    closeSettingsDialog();
```

- [ ] **Step 5: Haptic on picker selection**

In `src/main.js`, in `setPickerValue()` (added Task 5 step 8), append `triggerHaptic();` at the end:

```javascript
function setPickerValue(field, value, label) {
  const input = document.getElementById(field);
  const labelEl = document.getElementById(`${field}Label`);
  if (!input) return;
  input.value = value;
  if (labelEl) labelEl.textContent = label;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  triggerHaptic();
}
```

- [ ] **Step 6: Haptic on slider boundary**

In `src/main.js`, in `init()`, replace the existing flexMonths slider listener:

```javascript
  els.flexMonths.addEventListener("input", () => updateFlexSliderDisplay(els.flexMonths.value));
```

with:

```javascript
  let lastSliderValue = -1;
  els.flexMonths.addEventListener("input", () => {
    const value = normalizeFlexMonths(els.flexMonths.value);
    updateFlexSliderDisplay(value);
    if ((value === 0 || value === FLEX_LIMIT_MONTHS) && lastSliderValue !== value) {
      triggerHaptic();
    }
    lastSliderValue = value;
  });
```

This fires haptic each time the slider passes into 0 or 36 (not while held there).

- [ ] **Step 7: Tests + build**

```bash
npm test
npm run build
```

Expected: 11/11 pass; build clean.

- [ ] **Step 8: Commit**

```bash
git add src/main.js
git commit -m "feat: targeted haptic feedback on key interactions"
```

---

### Task 8: Back-button interception

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add `setupBackButton()` function**

In `src/main.js`, after `setupPickers()` (added Task 5 step 8), add:

```javascript
async function setupBackButton() {
  if (!isNative()) return;
  try {
    const { App } = await import("@capacitor/app");
    App.addListener("backButton", () => {
      if (els.pickerSheet.open) {
        closePicker();
        return;
      }
      if (els.settingsDialog.open) {
        closeSettingsDialog();
        return;
      }
      App.minimizeApp();
    });
  } catch {
    // App plugin unavailable; let default behavior take over
  }
}
```

Priority chain: picker on top of settings → close picker first → close settings → minimize.

- [ ] **Step 2: Call `setupBackButton()` from `init()`**

In `src/main.js`, in `init()`, just after the existing `setupSheetDragToClose();` call, insert:

```javascript
  setupBackButton();
```

Final block becomes:

```javascript
  setupPickers();
  setupSheetDragToClose();
  setupBackButton();

  window.setInterval(updateCountdown, 60 * 1000);
```

- [ ] **Step 3: Tests + build**

```bash
npm test
npm run build
```

Expected: 11/11 pass; build clean.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat: intercept Android back gesture to close sheets before exit"
```

---

### Task 9: Final verification + PR

- [ ] **Step 1: Sanity-check full suite**

```bash
cd /home/garlic/github/retirement-countdown-app
npm test
npm run build
ls -la dist/fonts/newsreader-latin.woff2
```

Expected: 11/11 pass; build clean; font asset present (~132 KB).

- [ ] **Step 2: Push branch**

```bash
git push -u origin feat/mobile-native-shell
```

- [ ] **Step 3: Open PR against main**

```bash
gh pr create --base main --title "feat: mobile native shell (back gesture, sheet, picker, status bar, haptics)" --body "$(cat <<'EOF'
## Summary
- 拦截 Android 返回手势: picker sheet → 设置 sheet → 否则 App.minimizeApp() 后台化(不退出应用)
- safe-area-inset 处理刘海/底部导航条
- 卡片纵向 space-between,顶部簇 / 中部 hero / 底部簇均匀分布,手机上消除上下大块留白
- 设置弹窗在 ≤640px 转换为底部 sheet(顶部拖把手 + 滑入动画 + 下拉关闭)
- 三个 select 替换为自定义 picker(button + 选项 sheet),选项全文不截断
- StatusBar 跟随 day/dusk mood
- 重点交互加 Haptics:mood toggle / sheet 开关 / 保存 / picker 选中 / slider 抵 0 or 36

Spec: docs/superpowers/specs/2026-05-11-mobile-native-shell-design.md
Plan: docs/superpowers/plans/2026-05-11-mobile-native-shell.md

## Test plan
- [x] npm test 11/11
- [x] npm run build clean
- [ ] APK 手机验证:
  - 边缘左滑/右滑:有 picker → 关 picker;有 settings → 关 settings;否则后台化不退出
  - 卡片头部紧贴 safe-area 顶部,底部紧贴 safe-area 底部,中间 hero 居中
  - 设置面板从底部滑入,顶部把手可下拉关闭
  - 三个 picker 选项全文显示,选中后 ✓ 标记
  - 状态栏:day 浅底深字 / dusk 深底浅字
  - 5 个 haptic 触发点都有轻振动

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Confirm CI triggered**

```bash
sleep 20 && gh run list --workflow="Build Android APK" --branch=feat/mobile-native-shell --limit=1
```

Expected: one run with status `queued` or `in_progress`.

- [ ] **Step 5: Report PR URL**

Print the PR URL from the previous `gh pr create` output and tell the user the APK build is running.

---

## Self-Review

**Spec coverage:**

| Spec section | Implementing task |
|---|---|
| @capacitor/app / status-bar / haptics deps | Task 1 |
| CSS env(safe-area-inset-*) padding | Task 2 step 4–5 |
| Card space-between distribution + cluster wrappers | Task 2 step 1–3 |
| Settings dialog → bottom-sheet visuals | Task 3 |
| Drag-to-close handle | Task 4 |
| Picker component (3 selects → buttons + sheet) | Task 5 |
| StatusBar follows mood | Task 6 |
| Haptics on 5 interactions | Task 7 |
| Back-button interception | Task 8 |
| Web/native dynamic import + isNative guard | Task 6/7/8 |
| `npm test 11/11` invariant | every task |

**Placeholders / vague steps:** None — every step has the actual code to paste.

**Type consistency:**
- `setupPickers` / `openPicker` / `closePicker` / `setPickerValue` / `pickerTitleFor` all referenced consistently.
- `applyStatusBar` / `triggerHaptic` / `setupBackButton` defined once and called from the matching `init()` site in the same task.
- `els.settingsHandle`, `els.pickerSheet`, `els.pickerOptions`, `els.pickerClose`, `els.pickerHandle`, `els.calculationModeLabel`, `els.workerTypeLabel`, `els.flexModeLabel` — names match their `#id` lookup and how they're referenced.
- `PICKER_OPTIONS` keys (`calculationMode`, `workerType`, `flexMode`) match the `data-picker` attribute values in HTML and the `#id` of hidden inputs.

**Open caveats logged for the engineer:**
- The plan does not introduce UI test framework. UI changes verified manually via APK (the spec contains the checklist).
- `pickerHandle` element exists in HTML but the plan doesn't wire drag-to-close on it. This is intentional — close button + tap-outside + Android back gesture all handle dismissal; the handle is purely a visual affordance.
