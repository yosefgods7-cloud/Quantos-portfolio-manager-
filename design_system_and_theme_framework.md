# QuantEdge OS UI/UX Design System and Theme Framework

## 1. Design Principles

To achieve a professional, futuristic, and minimalist aesthetic, the QuantEdge OS UI/UX will adhere to the following core design principles:

*   **Clarity & Readability:** Information must be presented clearly and concisely, with optimal typography, contrast, and spacing to ensure effortless readability, especially for critical trading data.
*   **Minimalism & Focus:** Eliminate visual clutter, prioritize essential elements, and use subtle animations and transitions to guide user attention. Every element should serve a purpose.
*   **Futuristic & Modern:** Incorporate sleek lines, subtle gradients, frosted glass effects (where appropriate), and a sophisticated color palette. Leverage modern UI patterns and interactions.
*   **Consistency:** Maintain a uniform visual language across all components, screens, and themes. Consistent sizing, spacing, and interaction patterns will enhance usability and reduce cognitive load.
*   **Responsiveness:** The interface must adapt seamlessly to various screen sizes and devices, ensuring a consistent experience whether on a desktop or a mobile device.
*   **Customizability (Theming):** Provide users with the ability to personalize their experience through multiple professional themes, allowing them to choose a visual style that suits their preferences and working environment.

## 2. Core Design Tokens (CSS Variables)

The UI will be built upon a robust system of CSS variables, allowing for easy theming and consistent application of styles. These variables will define:

*   **Colors:** Backgrounds, text, borders, primary accents, success, danger, warning states, and muted elements.
*   **Typography:** Font families (sans-serif for UI, monospace for data), font sizes, and line heights.
*   **Spacing:** Consistent padding and margin values for components and layouts.
*   **Borders & Shadows:** Standardized border radii, widths, and shadow effects for cards and interactive elements.
*   **Transitions:** Define durations and easing functions for UI animations.

### Example Core Color Variables:

```css
:root {
  /* Base Colors */
  --color-bg-primary: #09090b; /* Dark background */
  --color-bg-secondary: #18181b; /* Card background */
  --color-border: #27272a;
  --color-text-primary: #fafafa;
  --color-text-muted: #71717a;

  /* Accent Colors */
  --color-accent-primary: #3b82f6; /* Blue */
  --color-accent-success: #10b981; /* Green */
  --color-accent-danger: #f43f5e; /* Red */
  --color-accent-warning: #f59e0b; /* Orange */

  /* Typography */
  --font-family-sans: "Inter", system-ui, -apple-system, sans-serif;
  --font-family-mono: "JetBrains Mono", monospace;
  --font-size-base: clamp(14px, 1.2vw + 10px, 18px);
  --line-height-base: 1.6;

  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;

  /* Borders & Shadows */
  --border-radius-sm: 4px;
  --border-radius-md: 8px;
  --border-radius-lg: 12px;
  --box-shadow-card: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
}
```

## 3. Theme Structure

Each theme will be implemented as a set of CSS variable overrides. A base set of variables will be defined in the main `<style>` block within `index.html`. Specific themes will then override these variables, typically by applying a `data-theme` attribute to the `<html>` or `<body>` tag and defining new variable values within a CSS block targeting that attribute.

### 3.1. Base Theme (Default Dark)

The current dark theme will serve as the base, with its existing CSS variables refined and standardized. This ensures that if no specific theme is selected, the application defaults to a functional and aesthetically pleasing dark mode.

### 3.2. "Quantum Dark" Theme

This theme will build upon the base dark theme, introducing deeper blues and purples, subtle neon accents, and a more pronounced futuristic feel. It will use the following overrides:

*   `--color-bg-primary`: Darker, richer blue/purple hue.
*   `--color-bg-secondary`: Slightly lighter, complementary dark blue/purple.
*   `--color-accent-primary`: Electric blue or vibrant purple for highlights.
*   `--color-border`: A subtle, glowing border color.
*   **Typography:** Potentially a slightly more condensed or geometric sans-serif font for headings.
*   **Effects:** Subtle `box-shadow` with a glow effect for active elements.

### 3.3. "Arctic Light" Theme

This theme will provide a stark contrast with a light background, cool blues, and grays, aiming for a clean, crisp, and minimalist aesthetic. It will involve more extensive overrides:

*   `--color-bg-primary`: Very light gray or off-white.
*   `--color-bg-secondary`: Pure white or very light gray for cards.
*   `--color-border`: Light gray or subtle blue-gray.
*   `--color-text-primary`: Dark gray or black.
*   `--color-text-muted`: Medium gray.
*   `--color-accent-primary`: Cool light blue or silver.
*   **Effects:** Frosted glass effect (using `backdrop-filter: blur()`) for cards and modals, if browser support allows and performance is not impacted.

## 4. Implementation Strategy

1.  **Refactor Existing CSS:** Extract all inline styles and embedded `<style>` block rules from `index.html` into a new `<style>` block that defines the core CSS variables and applies them to general elements (e.g., `body`, `.card`, `.button`).
2.  **Create Theme Overrides:** Define additional `<style>` blocks or dynamically inject CSS rules for each theme, targeting `[data-theme="quantum-dark"]` or `[data-theme="arctic-light"]` to override the base CSS variables.
3.  **Theme Switching Logic:** Implement a JavaScript function (`switchTheme(themeName)`) that:
    *   Sets the `data-theme` attribute on the `<html>` or `<body>` element.
    *   Persists the selected theme to `localStorage`.
    *   Updates any theme-dependent elements (e.g., theme toggle text/icon).
4.  **Component Styling:** Ensure all UI components (navigation, cards, forms, charts) utilize these CSS variables for their styling, making them theme-agnostic at the component level.
5.  **Chart Theming:** Adapt Chart.js configurations to use the new CSS variables for colors, ensuring charts seamlessly integrate with the selected theme.

This structured approach will allow for easy maintenance, extension with new themes, and a consistent, high-quality user experience across the QuantEdge OS.
