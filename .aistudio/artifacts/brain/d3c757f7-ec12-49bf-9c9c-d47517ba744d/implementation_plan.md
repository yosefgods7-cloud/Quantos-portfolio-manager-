# Core Platform Mobile UI Optimization & Responsive Card Architecture

Extend the mobile ergonomics system established in the Trade Journal across all core platform views—specifically **Account Management**, **Capital Management / Prop Tracker**, **Dashboard**, and the **Finance Module**—transforming wide tables, crowded action buttons, and fixed multi-column metric strips into responsive, touch-first mobile cards and adaptive layouts.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following user preferences were confirmed during Phase 1 clarification:
> - **Target Scope**: Modernize all core sections with wide layout bottlenecks (Account Management, Prop Tracker / Capital Management, Dashboard, and Finance Module).
> - **Data Display on Phone Screens**: Convert wide desktop data tables into responsive cards with explicit status/phase badges, currency figures, embedded progress indicators, and touch-sized quick actions ($\ge 44\text{px}$).
> - **Multi-Button Section Headers**: Consolidate multi-button header rows into a prominent primary action CTA accompanied by a clean "Actions ▾" touch dropdown menu.

---

### 1. Overview & Core Concept

- **What It Delivers**: Eliminates awkward horizontal scrolling, squished micro-columns, and cluttered multi-button header wrapping across the application's central screens. Mobile users gain rapid one-handed access to accounts, capital risk allocations, drawdown monitors, and financial tracking without losing data fidelity or table power on desktop viewports.
- **Target Audience / Persona**: Active prop firm and retail traders checking account balances, equity drawdowns, risk levels, and daily budgets on smartphones.
- **Key Value**: Cohesive mobile UX across the entire application—every section follows the same high-standard responsive card architecture and touch-first ergonomics.

---

### 2. User Experience & Visual Design

#### Key User Flows on Mobile
1. **Account Management (`#accounts`) & Active Engines (`#dashboard`)**:
   - On screens $< 768\text{px}$, the 8-to-9 column tables are replaced with sleek `Account Cards`.
   - Each card displays:
     - Top row: Account Name, Asset Class pill, Firm name, and Type/Phase badge.
     - Metrics row: Current Balance and Equity in bold tabular numerals (`font-mono tabular-nums`), along with Risk % and Status.
     - Embedded Progress & Milestone bar: Visual drawdown and profit target tracking.
     - Action footer: Touch-sized action triggers (`Update Balance`, `Remove / Delete`) with $\ge 40\times 40\text{px}$ touch targets.
   - Desktop viewports ($\ge 768\text{px}$) retain the full multi-column tables.

2. **Capital Management System / Prop Tracker (`#prop-tracker`)**:
   - **Header Actions**: Prominent primary button (`+ Add Account`) paired with an `Actions ▾` dropdown providing one-tap access to *Scaling Roadmap* and *Record Payout*.
   - **Portfolio Summary KPIs**: 4-column inline metric strip converts into an adaptive 2-column grid (`Total Capital`, `Active Accounts`, `Risk Exposure`, `Accounts at Risk`) with large readable type.
   - **Drawdown Pressure & Account Registry**: In place of `#cms-accounts-table`, mobile displays rich Drawdown Cards highlighting current vs. starting balance, drawdown pressure zone (`Safe`, `Warning`, `Danger`, `Profit`), and one-tap delete.
   - **Capital Allocation Grid**: Converts the fixed 3-column `#cms-allocation-grid` into an adaptive responsive card stack with primary/secondary/protected badges.

3. **Dashboard View (`#dashboard`)**:
   - Top header features the primary `+ Add Account` button with an `Actions ▾` dropdown housing `Export Report`.
   - Active Engines card renders compact account cards on mobile viewports.
   - KPI cards (AUM, Equity, VaR, Cashflow) maintain their clean 2-column grid.

4. **Finance Module (`#finance`)**:
   - Header row with 4 buttons transforms into a primary `+ Log Expense` CTA and a dropdown menu for `Log Dividend`, `Add Stock`, and `Set Budget`.
   - 4-column Monthly Spend / Budget metrics stack into an adaptive 2-column grid.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dual Display Architecture (Desktop Tables vs. Mobile Cards)**
  - *Chosen Approach*: Maintain full data tables on desktop viewports ($\ge 768\text{px}$) while conditionally rendering responsive cards on mobile ($< 768\text{px}$) using `.desktop-only-table` and `.mobile-only-cards`.
  - *Why*: Large desktop screens benefit from scanning 8–10 columns in one view; phone viewports cannot display 9 columns without horizontal scrolling or tiny text. Cards prioritize the most critical data points (Balance, Equity, Phase, Drawdown).
- **Decision 2: Universal Header Dropdown Pattern**
  - *Chosen Approach*: Standardize all multi-button headers (`#accounts`, `#prop-tracker`, `#finance`, `#dashboard`) with a primary CTA and a `dropdown-menu` component that closes on outside clicks.
  - *Why*: Reduces header vertical height by ~60% on phone viewports, allowing trading and account data to remain visible above the fold.
- **Decision 3: Universal 2-Column KPI Adaptation**
  - *Chosen Approach*: Replace fixed `grid-template-columns: repeat(4, 1fr)` and `repeat(3, 1fr)` inline styles with responsive CSS classes (`cms-summary-grid`, `finance-stats-grid`) that collapse to 2 columns on screens $< 768\text{px}$.
  - *Why*: Keeps numbers and labels comfortably legible without horizontal overflow.

---

### 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    Mobile-Optimized Core Views              │
├─────────────────────────────────────────────────────────────┤
│  View Headers: [Primary CTA Button] + [Actions ▾ Dropdown]  │
├─────────────────────────────────────────────────────────────┤
│  KPI Metric Strips: Adaptive 2-Column Responsive Grids      │
├─────────────────────────────────────────────────────────────┤
│  Data Presentations:                                        │
│    ├─ Desktop (>=768px): .desktop-only-table (Full Tables)  │
│    └─ Mobile (<768px): .mobile-only-cards (Responsive Cards)│
│        • Account Cards (Balance, Equity, Firm, Phase, Bar)  │
│        • Drawdown Cards (DD %, Zone Badge, Balance/Start)   │
│        • Touch Action Hitboxes (>=40px)                     │
└─────────────────────────────────────────────────────────────┘
```

#### Component & State Mapping
- `renderTable("accounts-table-full", ...)`: Extends to populate `#accounts-mobile-cards` using data from `Store.accounts`.
- `renderTable("accounts-table-mini", ...)`: Extends to populate `#dashboard-accounts-mobile-cards` using `Store.accounts.slice(0, 5)`.
- Drawdown monitor in `renderAll()` / CMS logic: Extends to populate `#cms-accounts-mobile-cards` with calculated drawdown percentages, zones, and progress bars.
- Action handlers (`openUpdateBalanceModal`, `deleteAccount`, `exportToPDF`, modal triggers) are wired identically across cards and tables.
- All styles utilize existing CSS variables (`--surface`, `--bg`, `--border`, `--text`, `--primary`, `--success`, `--danger`, `--warning`).
