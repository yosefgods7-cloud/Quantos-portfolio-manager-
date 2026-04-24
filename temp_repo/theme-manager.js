/**
 * QuantEdge OS - Theme Manager
 * ============================================================================
 * Manages theme switching, persistence, and application across the platform.
 * Supports multiple professional themes with smooth transitions.
 * ============================================================================
 */

class ThemeManager {
  constructor() {
    this.themes = [
      { id: 'default', name: 'Default Dark', description: 'Clean dark theme with professional aesthetics' },
      { id: 'quantum-dark', name: 'Quantum Dark', description: 'Futuristic neon-accented dark theme' },
      { id: 'arctic-light', name: 'Arctic Light', description: 'Clean minimalist light theme' },
      { id: 'obsidian', name: 'Obsidian', description: 'Sophisticated dark theme with refined accents' },
      { id: 'emerald', name: 'Emerald', description: 'Nature-inspired theme with green accents' },
      { id: 'slate-pro', name: 'Slate Pro', description: 'Corporate professional theme' },
      { id: 'cyberpunk', name: 'Cyberpunk', description: 'Bold high-contrast neon theme' }
    ];

    this.currentTheme = this.loadTheme();
    this.init();
  }

  /**
   * Initialize the theme manager
   */
  init() {
    this.applyTheme(this.currentTheme);
    this.setupThemeToggle();
    this.setupThemeMenu();
  }

  /**
   * Load theme from localStorage or return default
   */
  loadTheme() {
    const saved = localStorage.getItem('qe_selected_theme');
    return saved || 'default';
  }

  /**
   * Save theme to localStorage
   */
  saveTheme(themeId) {
    localStorage.setItem('qe_selected_theme', themeId);
    this.currentTheme = themeId;
  }

  /**
   * Apply a theme by setting data-theme attribute
   */
  applyTheme(themeId) {
    const htmlElement = document.documentElement;
    
    if (themeId === 'default') {
      htmlElement.removeAttribute('data-theme');
    } else {
      htmlElement.setAttribute('data-theme', themeId);
    }

    this.currentTheme = themeId;
    this.saveTheme(themeId);
    this.updateThemeUI();
    this.dispatchThemeChangeEvent(themeId);
  }

  /**
   * Dispatch custom event when theme changes
   */
  dispatchThemeChangeEvent(themeId) {
    const event = new CustomEvent('themechange', {
      detail: { theme: themeId }
    });
    document.dispatchEvent(event);
  }

  /**
   * Setup theme toggle button (for quick switching between light/dark)
   */
  setupThemeToggle() {
    const toggleButton = document.getElementById('theme-toggle-btn');
    if (toggleButton) {
      toggleButton.addEventListener('click', () => {
        this.toggleLightDark();
      });
    }
  }

  /**
   * Toggle between light and dark themes
   */
  toggleLightDark() {
    const isDark = this.currentTheme === 'default' || 
                   this.currentTheme === 'quantum-dark' || 
                   this.currentTheme === 'obsidian' ||
                   this.currentTheme === 'emerald' ||
                   this.currentTheme === 'slate-pro' ||
                   this.currentTheme === 'cyberpunk';
    
    const newTheme = isDark ? 'arctic-light' : 'default';
    this.applyTheme(newTheme);
  }

  /**
   * Setup theme selection menu
   */
  setupThemeMenu() {
    const themeMenu = document.getElementById('theme-menu');
    if (!themeMenu) return;

    // Clear existing items
    themeMenu.innerHTML = '';

    // Add theme options
    this.themes.forEach(theme => {
      const option = document.createElement('button');
      option.className = 'theme-option';
      if (theme.id === this.currentTheme) {
        option.classList.add('active');
      }

      option.innerHTML = `
        <div class="theme-option-name">${theme.name}</div>
        <div class="theme-option-desc">${theme.description}</div>
      `;

      option.addEventListener('click', () => {
        this.applyTheme(theme.id);
        this.updateThemeMenuUI();
      });

      themeMenu.appendChild(option);
    });
  }

  /**
   * Update theme menu UI to show active theme
   */
  updateThemeMenuUI() {
    const options = document.querySelectorAll('.theme-option');
    options.forEach(option => {
      option.classList.remove('active');
    });

    const activeOption = document.querySelector(
      `.theme-option:has(div:contains("${this.getThemeName(this.currentTheme)}"))`
    );
    if (activeOption) {
      activeOption.classList.add('active');
    }
  }

  /**
   * Update theme toggle button UI
   */
  updateThemeUI() {
    const themeIcon = document.getElementById('theme-icon');
    const themeText = document.getElementById('theme-text');

    if (themeIcon && themeText) {
      const isDark = this.currentTheme === 'default' || 
                     this.currentTheme === 'quantum-dark' || 
                     this.currentTheme === 'obsidian' ||
                     this.currentTheme === 'emerald' ||
                     this.currentTheme === 'slate-pro' ||
                     this.currentTheme === 'cyberpunk';

      if (isDark) {
        themeIcon.setAttribute('data-lucide', 'moon');
        themeText.textContent = 'Dark Mode';
      } else {
        themeIcon.setAttribute('data-lucide', 'sun');
        themeText.textContent = 'Light Mode';
      }

      // Re-render Lucide icons
      if (window.lucide) {
        window.lucide.createIcons();
      }
    }
  }

  /**
   * Get theme name by ID
   */
  getThemeName(themeId) {
    const theme = this.themes.find(t => t.id === themeId);
    return theme ? theme.name : 'Unknown';
  }

  /**
   * Get all available themes
   */
  getThemes() {
    return this.themes;
  }

  /**
   * Get current theme ID
   */
  getCurrentTheme() {
    return this.currentTheme;
  }

  /**
   * Get current theme info
   */
  getCurrentThemeInfo() {
    return this.themes.find(t => t.id === this.currentTheme);
  }

  /**
   * Apply theme-aware styling to Chart.js charts
   */
  getChartThemeConfig() {
    const styles = getComputedStyle(document.documentElement);
    const textColor = styles.getPropertyValue('--text').trim();
    const borderColor = styles.getPropertyValue('--border').trim();
    const primaryColor = styles.getPropertyValue('--primary').trim();

    return {
      textColor: textColor,
      borderColor: borderColor,
      primaryColor: primaryColor,
      gridColor: borderColor + '40',
      plugins: {
        legend: {
          labels: {
            color: textColor,
            font: { family: "'Inter', system-ui, -apple-system, sans-serif" }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: textColor },
          grid: { color: borderColor + '20' }
        },
        y: {
          ticks: { color: textColor },
          grid: { color: borderColor + '20' }
        }
      }
    };
  }

  /**
   * Export current theme configuration as CSS
   */
  exportThemeConfig() {
    const styles = getComputedStyle(document.documentElement);
    const config = {};

    const cssVars = [
      '--bg', '--card', '--border', '--text', '--muted',
      '--primary', '--success', '--danger', '--warning',
      '--surface', '--surface-hover', '--accent-secondary', '--accent-tertiary'
    ];

    cssVars.forEach(varName => {
      config[varName] = styles.getPropertyValue(varName).trim();
    });

    return config;
  }

  /**
   * Listen for theme changes
   */
  onThemeChange(callback) {
    document.addEventListener('themechange', (e) => {
      callback(e.detail.theme);
    });
  }
}

// Initialize theme manager when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.ThemeManager = new ThemeManager();
  });
} else {
  window.ThemeManager = new ThemeManager();
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThemeManager;
}
