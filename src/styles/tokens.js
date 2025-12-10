/**
 * Design Tokens
 *
 * Central source of truth for all design values.
 * Import and use these instead of hardcoded values.
 *
 * Usage:
 * import { tokens } from './styles/tokens'
 *
 * <div style={{ color: tokens.colors.text.secondary }}>
 */

export const tokens = {
  // ========================================
  // COLORS
  // ========================================
  colors: {
    // Primary brand color
    primary: '#2563eb',
    primaryDark: '#1d4ed8',
    primaryDarker: '#1e40af',
    primaryLight: '#e5f0ff',
    primaryLighter: '#eef2ff',

    // Text colors
    text: {
      primary: '#0f172a',
      body: '#111827',
      secondary: '#374151',
      tertiary: '#4b5563',
      muted: '#6b7280',
    },

    // Border colors
    border: {
      default: '#e5e7eb',
      light: '#d0d7e2',
      lighter: '#c5cede',
      dark: '#d1d5db',
      dashed: '#cbd5e1',
    },

    // Background colors
    bg: {
      primary: '#ffffff',
      secondary: '#f8fafc',
      muted: '#f9fafb',
      ghost: '#f3f4f6',
      dark: '#0b1220',
      overlay: 'rgba(15, 23, 42, 0.45)',
      overlayDark: 'rgba(15, 23, 42, 0.55)',
    },

    // Status colors
    status: {
      success: {
        text: '#16a34a',
        textDark: '#065f46',
        bg: '#ecfdf3',
        border: '#86efac',
      },
      error: {
        text: '#b91c1c',
        textDark: '#991b1b',
        textAlt: '#dc2626',
        bg: '#fef2f2',
        border: '#fecaca',
      },
      warning: {
        text: '#d97706',
        bg: '#fef3c7',
        border: '#fcd34d',
      },
      info: {
        text: '#4f46e5',
        textDark: '#3730a3',
        bg: '#eef2ff',
        border: '#c7d2fe',
      },
    },

    // Special UI colors
    link: {
      default: '#2563eb',
      hover: '#1d4ed8',
    },
  },

  // ========================================
  // SPACING
  // ========================================
  spacing: {
    xxs: '0.2rem',    // 3.2px
    xs: '0.25rem',    // 4px
    sm: '0.35rem',    // 5.6px
    md: '0.5rem',     // 8px
    lg: '0.75rem',    // 12px
    xl: '1rem',       // 16px
    '2xl': '1.25rem', // 20px
    '3xl': '1.5rem',  // 24px
  },

  // ========================================
  // TYPOGRAPHY
  // ========================================
  fontSize: {
    xs: '0.875rem',   // 14px
    sm: '0.9rem',     // 14.4px
    base: '0.95rem',  // 15.2px
    md: '0.98rem',    // 15.68px
    lg: '1rem',       // 16px
    xl: '1.05rem',    // 16.8px
    '2xl': '1.25rem', // 20px
  },

  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  fontFamily: {
    base: '"Inter", "Helvetica Neue", Arial, sans-serif',
  },

  lineHeight: {
    tight: 1.35,
    normal: 1.5,
    relaxed: 1.6,
  },

  // ========================================
  // BORDER RADIUS
  // ========================================
  radius: {
    sm: '12px',
    md: '16px',
    lg: '18px',
    full: '999px',
    circle: '50%',
  },

  // ========================================
  // SHADOWS
  // ========================================
  shadow: {
    sm: '0 10px 30px rgba(15, 23, 42, 0.05)',
    md: '0 10px 30px rgba(15, 23, 42, 0.08)',
    lg: '0 12px 40px rgba(15, 23, 42, 0.14)',
    xl: '0 14px 50px rgba(15, 23, 42, 0.12)',
    '2xl': '0 18px 36px rgba(15, 23, 42, 0.18)',
    '3xl': '0 22px 48px rgba(15, 23, 42, 0.25)',
    dark: '0 12px 30px rgba(0, 0, 0, 0.35)',
    button: '0 10px 30px rgba(37, 99, 235, 0.2)',
    buttonHover: '0 10px 30px rgba(15, 23, 42, 0.08)',
    focus: '0 0 0 3px rgba(37, 99, 235, 0.16)',
    inset: 'inset 0 1px 0 rgba(255, 255, 255, 0.6)',
  },

  // ========================================
  // CHIPS / BUBBLES / PILLS
  // ========================================
  chip: {
    // Standard chip/bubble/pill styling
    padding: '0.45rem 0.85rem',
    borderRadius: '999px',
    fontSize: '0.95rem',
    fontWeight: 500,

    // Backgrounds
    bg: {
      default: '#f6f7fb',
      white: '#ffffff',
      ghost: '#f3f4f6',
    },

    // States
    selected: {
      bg: '#2563eb',
      color: '#ffffff',
      border: '#1d4ed8',
      shadow: '0 8px 20px rgba(37, 99, 235, 0.22)',
    },

    active: {
      bg: '#e5f0ff',
      border: '#c3ddff',
      color: '#1d4ed8',
    },
  },

  // ========================================
  // TRANSITIONS
  // ========================================
  transition: {
    fast: '100ms ease',
    normal: '120ms ease',
    slow: '180ms ease',
  },

  // ========================================
  // LAYOUT
  // ========================================
  layout: {
    panelWidth: 'min(440px, calc(100% - 32px))',
    panelWidthWide: 'min(480px, calc(100% - 36px))',
    modalWidth: 'min(520px, 100%)',
    modalWidthMd: 'min(540px, 100%)',
    modalWidthLg: 'min(760px, 100%)',
    maxContent: '720px',
  },

  // ========================================
  // Z-INDEX
  // ========================================
  zIndex: {
    base: 1,
    overlay: 5,
    panel: 6,
    modal: 10,
  },
}

// Helper functions for common patterns
export const helpers = {
  /**
   * Create a detail text style (used frequently in cards)
   */
  detailText: {
    margin: `${tokens.spacing.xs} 0`,
    fontSize: tokens.fontSize.base,
    color: tokens.colors.text.secondary,
  },

  /**
   * Create a flex row with alignment
   */
  flexRow: (gap = tokens.spacing.md) => ({
    display: 'flex',
    alignItems: 'center',
    gap,
  }),

  /**
   * Create a flex column
   */
  flexCol: (gap = tokens.spacing.md) => ({
    display: 'flex',
    flexDirection: 'column',
    gap,
  }),

  /**
   * Create a flex space-between layout
   */
  flexBetween: (gap = tokens.spacing.md) => ({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap,
  }),

  /**
   * Create a card container style
   */
  card: {
    border: '1px solid var(--color-border)',
    borderRadius: tokens.radius.md,
    padding: `${tokens.spacing.xl} 1.1rem`,
    background: 'var(--surface-panel, #ffffff)',
    boxShadow: 'var(--card-shadow, 0 10px 30px rgba(15, 23, 42, 0.08))',
  },
}

export default tokens
