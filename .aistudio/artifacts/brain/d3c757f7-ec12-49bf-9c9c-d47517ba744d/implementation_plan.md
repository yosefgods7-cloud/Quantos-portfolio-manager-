# Mobile-Optimized Trade Journal & Responsive Ergonomics

Modernize the Trade Journal section to deliver a seamless mobile experience on phones (375px–430px) and tablets while maintaining full multi-column dashboard power on desktop viewports.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following user preferences were confirmed during Phase 1 clarification:
> - **Recent Trades Display**: Responsive trade cards with expandable details, clean metric badges, and quick touch action buttons (View, Edit, Duplicate, Delete) on mobile, preserving the comprehensive data table on desktop viewports.
> - **Journal Header Actions**: Prominent primary "Log Trade" button paired with a sleek "More Actions" dropdown / sheet for secondary tools (Journal Settings, Log Backtest, Weekly Review, Session Debrief, Pre-Trade Plan).
> - **Performance Metrics & Risk Engine**: 2-column adaptive metric cards with readable typography, replacing the squished 6-column layout on mobile devices.

---

### 1. Overview & Core Concept
- **What It Delivers**: Transforms the Trade Journal from a desktop-locked, horizontally overflowing layout into a fluid, touch-ergonomic mobile interface. Trades are presented in scannable, high-contrast cards showing instrument, date/time, direction badge, P&L, R-multiple, and expandable entry/exit breakdown.
- **Target Audience / Persona**: Traders reviewing setups, logging executions, or running pre-trade checklists on smartphones on the go or during live market hours.
- **Key Value**: Instant clarity without horizontal scrolling or tiny illegible text; effortless thumb-reach actions with $\ge 44\text{px}$ touch targets.

---

### 2. User Experience & Visual Design

#### Key User Flows on Mobile
1. **Header & Fast Logging**:
   - The user opens the Trade Journal view. The top bar features the title and a high-visibility, thumb-friendly `+ Log Trade` button alongside a compact `More (···)` menu button.
   - Tapping `More` opens a clean dropdown/action sheet giving access to *Weekly Review*, *Session Debrief*, *Pre-Trade Plan*, *Log Backtest*, and *Journal Settings*.
2. **Metrics & Risk Engine Overview**:
   - The Psychological Risk Engine and Rule Violation tracker adapt to a clean 2-column card layout with large tabular numbers (`font-mono tabular-nums`) and clear semantic states (Win/Loss/Breakeven).
   - The 6 performance stats (Win Rate, Average R, Total Return, Best Setup, Most Common Mistake, Total R) collapse gracefully into a 2-column mobile grid with generous tap targets and legible labels.
3. **Recent Trades Feed & Expansion**:
   - Below filters (Asset & Session pickers), trades render as touch-friendly cards on mobile viewports (< 768px).
   - Each card displays:
     - Top row: Date & time, Asset pair (e.g. `EURUSD`), Trade type badge (`BUY`/`SELL`).
     - Center row: Outcome tag (`Win` / `Loss` / `BE`), Setup type, and prominent bold R-Multiple (`+2.40R` or `-1.00R`) and P&L (`+$480.00`).
     - Bottom row: Quick action buttons (`View`, `Edit`, `Duplicate`, `Delete`) with touch-friendly $44\text{px}$ hitboxes + an expandable chevron toggle for deeper details (Execution quality, session, grade, partials, emotion tags).
   - On desktop screens ($\ge 768\text{px}$), the full 15-column data table remains intact for wide-screen power users.

#### Visual Hierarchy & Styling Tokens
- **Surface Elevation**: Consistent with existing dark/light theme tokens (`var(--surface)`, `var(--bg)`, `var(--border)`, `var(--primary)`).
- **Typography**: Header `1.15rem` SemiBold, Tabular metrics `1.25rem font-mono font-bold`, Micro-metadata `0.75rem var(--muted)`.
- **Touch Ergonomics**: All interactive buttons, filter dropdowns, and card disclosure toggles maintain minimum $44 \times 44\text{px}$ hitboxes to eliminate mis-taps.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dual Display Architecture (Mobile Card Feed vs. Desktop Data Table)**
  - *Chosen Approach*: On viewports $< 768\text{px}$, dynamically render trades as individual cards with tap-to-expand details; on viewports $\ge 768\text{px}$, display the comprehensive table.
  - *Why*: Horizontal scrolling on a 15-column table on a phone screen provides poor usability. Cards allow immediate scanning of key financial figures (Asset, R, P&L, Outcome) while keeping full details accessible via tap.
  - *Alternatives Considered*: Pure horizontal table scroll with sticky headers (rejected: still requires clumsy two-axis scrolling).
- **Decision 2: Header Action Consolidation**
  - *Chosen Approach*: Keep the primary action `+ Log Trade` prominent and group secondary modal triggers under a mobile-friendly action menu.
  - *Why*: 6 full-size buttons in a row wrap onto 3–4 chaotic lines on phone screens, pushing actual trading data below the fold.
- **Decision 3: Adaptive 2-Column Stat Grid**
  - *Chosen Approach*: Change the fixed 6-column `.col-2` and 3-column inline styles to an auto-fit/2-column responsive CSS grid on screens $< 768\text{px}$.
  - *Why*: Prevents stats from squishing down to 45px wide unusable slivers.

---

### 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                 Trade Journal View Container                │
├─────────────────────────────────────────────────────────────┤
│  Mobile Header Bar: Title + [+ Log Trade] + [More Actions ▾]│
├─────────────────────────────────────────────────────────────┤
│  Alert Banners (Weekly Review / Daily Loss) - Full Width    │
├─────────────────────────────────────────────────────────────┤
│  Psychological Risk & Discipline Trackers (2-Col Adaptive)  │
├─────────────────────────────────────────────────────────────┤
│  Key Performance KPI Grid (2-Col Adaptive Cards)            │
├─────────────────────────────────────────────────────────────┤
│  Analytics & Charts (Single Col on Mobile, 2-Col on Desktop)│
├─────────────────────────────────────────────────────────────┤
│  Trade Log Section:                                         │
│    - Asset & Session Filters (Full-width flex wraps)        │
│    - Mobile (<768px): Card List with Expansion & Actions    │
│    - Desktop (>=768px): Full 15-Column Data Table           │
└─────────────────────────────────────────────────────────────┘
```

#### Component & State Mapping
- `window.renderTradeTable`: Extended to populate both `#trades-table-body` (for desktop) and a mobile cards container `#trades-mobile-cards` (or seamlessly toggle based on CSS media queries).
- All action triggers (`viewTrade`, `editTrade`, `duplicateTrade`, `deleteTrade`) are bound identically in both desktop table rows and mobile card action strips to guarantee zero loss of functionality.
- CSS additions in `<style>` / theme sheets will enforce clean mobile rules for `.tj-mobile-card`, `.tj-header-actions`, `.tj-stats-grid`, and touch target sizing.
