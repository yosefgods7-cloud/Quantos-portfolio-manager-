# Live Trading Session & Killzone Indicator

A high-precision, zero-cost live session time tracker on the main dashboard for institutional forex killzones (Asian Range, London Open, NY Open, and London/NY Overlap) with real-time countdowns, active state badges, and multi-timezone alignment.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following user preferences were confirmed in Phase 1 and govern the implementation:
> - **Placement**: Dedicated full-width session bar (`col-12`) positioned directly above the main equity and distribution charts on the dashboard.
> - **Target Sessions**: Forex institutional killzones: Asian Range, London Open, and New York Open (including the London/NY high-volatility overlap).
> - **Status & Timing Display**: Live active/closed status badges accompanied by live real-time countdown clocks (countdown to session open or countdown to session close).
> - **Implementation Model**: Built-in client-side time engine utilizing standardized UTC reference calculations and localized browser time. This runs continuously, requires zero external paid API subscriptions or rate limits, and remains 100% free and reliable.

---

## 1. Overview & Core Concept

- **What It Does**: Renders a dedicated institutional session tracking strip on the primary dashboard that highlights exactly which trading session is live, calculates live countdowns to upcoming open and close windows, and flags peak volatility overlap zones.
- **Target Audience**: Professional forex and prop firm traders who must align trade entries with institutional liquidity windows and avoid trading outside permitted volatility hours.
- **Key Value**: Eliminates manual timezone conversion errors, provides instant situational awareness of market liquidity phases, and integrates seamlessly with the existing fixed dashboard grid.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **At-a-Glance Assessment**: When opening the dashboard, traders immediately see the current UTC time, their local time, and 3 structured killzone cards:
   - **Asian Range** (00:00 – 08:00 UTC): Displays current status, countdown until open or close, and session liquidity profile.
   - **London Open Killzone** (07:00 – 16:00 UTC, core killzone 07:00 – 10:00 UTC): Real-time countdown and active status badge.
   - **New York Open Killzone** (12:00 – 21:00 UTC, core killzone 12:00 – 15:00 UTC): Real-time countdown and active status badge.
2. **High-Volatility Overlap Notification**: When London and New York are active simultaneously (12:00 – 16:00 UTC), a visual "Peak Liquidity Overlap" badge highlights the prime trading window.
3. **Session Switch & Responsive Layout**: Clean horizontal 3-column killzone strip on desktop viewports ($\ge 1024\text{px}$) that reflows into readable stacked cards on tablet and mobile screens without horizontal scroll.

### Visual Identity & Theme
- **Surface**: Consistent with QuantEdge luxury dark aesthetic (`rgba(255,255,255,0.03)` card background with `--border` hairline divider).
- **Active State Badges**:
  - `ACTIVE`: Vibrant emerald badge with subtle ambient glow (`rgba(16, 185, 129, 0.15)` background and `#10B981` text/border), displaying "Closes in: Xh Ym Zs".
  - `UPCOMING`: Muted slate/amber badge (`rgba(245, 158, 11, 0.1)` background and `#F59E0B` text/border), displaying "Opens in: Xh Ym Zs".
- **Typography**: Tabular monospace numbers (`font-mono tabular-nums`) for clock digits to prevent jitter during per-second updates.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Built-in Client Engine vs. External API**
  - *Chosen Approach*: Built-in deterministic JavaScript engine anchored to atomic UTC timestamps.
  - *Why*: Market session hours are mathematically predictable based on UTC offsets. Calling a third-party server or API every second wastes network bandwidth, risks rate-limiting (429), and creates points of failure. The built-in engine guarantees 100% uptime, zero latency, and zero ongoing cost.
  - *Alternatives Considered*: WorldTimeAPI / external forex calendars (rejected due to rate limits and potential network latency).

- **Decision 2: Layout & Grid Integration**
  - *Chosen Approach*: Insert as a solid fixed `col-12` card inside `#dashboard-grid` between the 4 top KPI metrics and the charts.
  - *Why*: Preserves the solid fixed layout established in the previous turn while giving the time indicator maximum visual prominence right before the charts.

---

## 4. Technical Architecture & Data Strategy

### System Component Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Home Page Dashboard View                  │
├──────────────────────────────────────────────────────────────┤
│ [AUM: $X]    [Equity: $X]    [Risk: X%]    [Cashflow: $X]    │
├──────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 🕒 Institutional Session Time Engine (col-12)             │ │
│ │  Current UTC: 13:45:12 UTC  ·  Local Time: 16:45:12       │ │
│ │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐ │ │
│ │  │ Asian Range  │  │ London Open  │  │  New York Open  │ │ │
│ │  │ [CLOSED]     │  │ [ACTIVE]     │  │  [ACTIVE]       │ │ │
│ │  │ Opens in: 8h │  │ Closes in: 2h│  │  Closes in: 7h  │ │ │
│ │  └──────────────┘  └──────────────┘  └─────────────────┘ │ │
│ │  🔥 PEAK LIQUIDITY OVERLAP ACTIVE (London + New York)     │ │
│ └──────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│ [Equity Curve Aggregate (col-8)]  [Distribution (col-4)]     │
├──────────────────────────────────────────────────────────────┤
│ [Active Engines Table / Cards]                               │
└──────────────────────────────────────────────────────────────┘
```

### State & Lifecycle Management
- **Ticker Loop**: Single `setInterval` (1000ms cadence) with timestamp recalculation on `visibilitychange` (resumes smoothly when returning to the tab).
- **Lifecycle Cleanup**: Clears interval on view teardown or page unload to prevent memory leaks.
- **Daylight Saving Time Handling**: Uses standard standard UTC hour references (Asian 00:00–08:00 UTC, London 07:00–16:00 UTC, NY 12:00–21:00 UTC) with clear UTC labels.
