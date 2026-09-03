/**
 * Unified Design Token System
 *
 * Single source of truth for FlyGACA (web) + Captain-Adel (landing) + FlyGACA-ios (native)
 * Exports three theme variants: Falcon (dark primary), Cockpit (night ops), Day (light reading)
 *
 * Canonical naming resolves conflicts between:
 * - FlyGACA spacing base (4px) vs Captain-Adel (8px) → standardizing on 4px
 * - FlyGACA semantic surfaces (--surface, --surface-raised) vs Captain-Adel panels (--panel, --panel-2)
 * - Hard-coded hex colors in Captain-Adel (#1E2A37, #1A2532 user bubbles) → tokenized
 * - Motion scale consistency between Framer Motion + CSS
 * - RTL-aware logical properties (no left/right/top/bottom)
 */

// ============================================================================
// COLOR PALETTES
// ============================================================================

// Falcon Theme (OLED-optimized dark, aviation HUD aesthetic)
export const falconPalette = {
  // Base surfaces
  void: '#090A0F',           // pure black, deepest background (OLED-optimized)
  voidRaised: '#0f1a24',     // subtle elevation, raised surfaces
  voidOverlay: '#111318',    // modal/overlay base

  // Semantic surfaces (replacing FlyGACA's --surface/--surface-raised + Captain-Adel's --panel tiers)
  surfaceBase: '#0a0e12',    // primary background canvas (FlyGACA --falcon-night)
  surfaceRaised: '#0f1a24',  // elevated containers, cards
  surfaceElevated: '#132038', // highest elevation, panels

  // Text and UI ink
  textPrimary: '#e8edf2',    // body text, high contrast (FlyGACA --text)
  textSecondary: '#9da9b4',  // secondary text (FlyGACA --text-muted)
  textTertiary: '#6b7280',   // captions, disabled (FlyGACA --text-dim)
  textInverted: '#090A0F',   // text on light backgrounds

  // Brand accent colors
  brandTeal: '#2d6e8a',      // primary brand (FlyGACA --falcon-teal)
  brandTealHover: '#3a8aae',
  brandSage: '#8fc9a8',      // secondary (FlyGACA --falcon-sage)
  brandGold: '#c8a04a',      // heritage/accent (FlyGACA --falcon-gold)
  brandGoldSoft: '#e3c57e',  // soft gold for typography
  brandGoldDeep: '#a9853a',  // deepened gold

  // Semantic status colors
  success: '#66daa1',        // passed, mastery, positive (Captain-Adel --sage)
  warning: '#fbbf24',        // warning, caution (Captain-Adel --amber)
  danger: '#e68e50',         // errors, failures, refusals (Captain-Adel --flag)

  // Flight-specific accent colors (neon layer for HUD)
  neonGreen: '#2bffb0',      // aviation green, positive data (FlyGACA --neon-green)
  neonCyan: '#3fe0ff',       // electric cyan, attention (FlyGACA --neon-cyan)

  // Glass and borders
  borderDefault: 'rgba(255, 255, 255, 0.08)',
  borderMuted: 'rgba(255, 255, 255, 0.04)',
  glassFill: 'rgba(255, 255, 255, 0.04)',
  glassBlur: 'blur(14px) saturate(140%)',

  // Derived text-on-color combinations (for high-contrast controls)
  textOnPrimary: '#050810',   // text on cyan/brand buttons
  textOnAccent: '#1A1206',    // text on gold/mint highlights
  textOnSuccess: '#0A2016',   // text on sage/success
  textOnWarning: '#1A1206',   // text on warning/gold

  // User message bubble (hard-coded #1E2A37, #1A2532 → tokenized)
  userBubbleGradientStart: '#1E2A37',
  userBubbleGradientEnd: '#1A2532',
  userBubbleBorder: '#2A3A49',

  // Flight-specific indicators (fuel/density visualization)
  fuelTrip: '#57AEC9',        // fuel trip indicator cyan
  fuelReserve: '#E3C57E',     // reserve fuel (golden)
  fuelMargin: '#66DAA1',      // safety margin (green)
  runwayLight: '#EEF2F6',     // runway markings light
  runwayDark: '#232C36',      // runway markings dark
};

// Cockpit Theme (night-vision safe: warm amber + soft red, no blue for adaptation)
export const cockpitPalette = {
  void: '#121212',
  voidRaised: '#1a1a1a',
  voidOverlay: '#0f0f0f',

  surfaceBase: '#1a1a1a',
  surfaceRaised: '#242424',
  surfaceElevated: '#2d2d2d',

  textPrimary: '#e8e2d6',    // warm off-white, reduces blue
  textSecondary: '#a89878',
  textTertiary: '#7a7066',
  textInverted: '#1a1a1a',

  brandTeal: '#ffb000',      // replaced with warm amber (night vision safe)
  brandTealHover: '#ffc433',
  brandSage: '#8fb59a',      // muted warm sage
  brandGold: '#d9a574',      // warm gold
  brandGoldSoft: '#e8c9a9',
  brandGoldDeep: '#b8865a',

  success: '#66d9a1',        // soft green, night-vision safe
  warning: '#ff9500',        // soft orange, replaces amber
  danger: '#ff5555',         // soft red, cockpit danger signal

  neonGreen: '#2bffb0',
  neonCyan: '#00d9ff',       // shifted cyan (less harsh blue)

  borderDefault: 'rgba(255, 255, 255, 0.06)',
  borderMuted: 'rgba(255, 255, 255, 0.03)',
  glassFill: 'rgba(255, 255, 255, 0.02)',
  glassBlur: 'blur(12px) saturate(120%)',

  // Derived text-on-color combinations (night-vision safe)
  textOnPrimary: '#0f0f0f',   // text on warm amber buttons
  textOnAccent: '#1a0f00',    // text on warm gold
  textOnSuccess: '#051005',   // text on soft green
  textOnWarning: '#1a0f00',   // text on soft orange

  // User message bubble (warm tones for night vision)
  userBubbleGradientStart: '#1E2A37',  // reuse from Falcon (both are dark)
  userBubbleGradientEnd: '#1A2532',
  userBubbleBorder: '#2A3A49',

  // Flight-specific indicators (adjusted for night vision)
  fuelTrip: '#4a9aba',
  fuelReserve: '#d9a574',
  fuelMargin: '#5fa885',
  runwayLight: '#e8e2d6',
  runwayDark: '#2a2a2a',
};

// Day Theme (light reading: high contrast, accessible)
export const dayPalette = {
  void: '#f5f2ed',           // ivory canvas
  voidRaised: '#faf8f4',
  voidOverlay: '#ffffff',

  surfaceBase: '#f5f2ed',    // main background
  surfaceRaised: '#faf8f4',  // elevated cards
  surfaceElevated: '#ffffff',

  textPrimary: '#16212c',    // dark ink, AA contrast on light
  textSecondary: '#4a5568',
  textTertiary: '#718096',
  textInverted: '#f5f2ed',

  brandTeal: '#1a5f7a',      // darkened teal for AA contrast
  brandTealHover: '#0d3e52',
  brandSage: '#2d7a4a',      // darkened sage
  brandGold: '#9a7c1f',      // darkened gold
  brandGoldSoft: '#b89c41',
  brandGoldDeep: '#6b5810',

  success: '#2d7a4a',        // darkened success
  warning: '#d97706',        // darkened warning
  danger: '#d92d20',         // darkened danger

  neonGreen: '#059669',      // reduced neon intensity
  neonCyan: '#0891b2',       // reduced neon intensity

  borderDefault: 'rgba(0, 0, 0, 0.12)',
  borderMuted: 'rgba(0, 0, 0, 0.06)',
  glassFill: 'rgba(0, 0, 0, 0.02)',
  glassBlur: 'blur(10px) saturate(100%)',

  // Derived text-on-color combinations (day theme, high-contrast)
  textOnPrimary: '#f5f2ed',   // text on darkened teal buttons
  textOnAccent: '#f5f2ed',    // text on darkened gold highlights
  textOnSuccess: '#f5f2ed',   // text on darkened sage/success
  textOnWarning: '#f5f2ed',   // text on darkened warning/gold

  // User message bubble (light background variant)
  userBubbleGradientStart: '#e8e8e8',
  userBubbleGradientEnd: '#d4d4d4',
  userBubbleBorder: '#bfbfbf',

  // Flight-specific indicators (light theme versions)
  fuelTrip: '#0891b2',        // darkened cyan for light bg
  fuelReserve: '#9a7c1f',     // darkened gold for light bg
  fuelMargin: '#2d7a4a',      // darkened green for light bg
  runwayLight: '#16212c',     // dark text for light runways
  runwayDark: '#e8e2d6',      // light for dark runway areas
};

// ============================================================================
// SPACING SCALE (4px base — unified across all platforms)
// ============================================================================

export const spacing = {
  xs: '4px',      // --space-1 / --s-1
  sm: '8px',      // --space-2 / --s-2
  md: '12px',     // --space-3 / --s-3
  lg: '16px',     // --space-4 / --s-4
  xl: '20px',     // --space-5 / --s-5
  '2xl': '24px',  // --space-6 / --s-6
  '3xl': '32px',  // --space-8 / --s-8
  '4xl': '40px',  // --space-10
  '5xl': '48px',  // --space-12
  '6xl': '56px',  // --space-14
  '7xl': '64px',  // --space-16 / --s-7
  '8xl': '80px',
  '9xl': '96px',
};

// ============================================================================
// TYPOGRAPHY
// ============================================================================

export const typography = {
  // Font families
  fontSans: '"Readex Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  fontMono: '"IBM Plex Mono", "JetBrains Mono", Courier, monospace',
  fontSerif: 'Georgia, "Times New Roman", serif',

  // Font sizes (rem, 16px base)
  sizes: {
    '4xl': 'clamp(2.25rem, 5vw, 3.75rem)',  // hero titles
    '3xl': 'clamp(1.875rem, 4vw, 2.25rem)', // major headings
    '2xl': 'clamp(1.5rem, 3.5vw, 1.875rem)',
    xl: '1.25rem',
    lg: '1.125rem',
    base: '1rem',
    sm: '0.875rem',
    xs: '0.75rem',
    '2xs': '0.6875rem',
  },

  // Font weights
  weights: {
    light: 300,
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  },

  // Line heights
  leading: {
    tight: 1.15,
    snug: 1.25,
    normal: 1.5,
    relaxed: 1.65,
    loose: 1.8,
  },
};

// ============================================================================
// GEOMETRY
// ============================================================================

export const geometry = {
  // Border radius (consistent with both systems' --r-* scales)
  radius: {
    sm: '8px',      // --r-sm
    md: '14px',     // --r / --radius (unified canonical)
    lg: '20px',     // --r-lg
    xl: '26px',     // --r-xl
    pill: '999px',  // --r-pill
  },

  // Shadows (layered elevation)
  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.08)',
    md: '0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(0, 0, 0, 0.1)',
    lg: '0 12px 32px rgba(0, 0, 0, 0.2), 0 4px 12px rgba(0, 0, 0, 0.12)',
    glow: '0 0 28px rgba(34, 211, 238, 0.4)',  // cyan glow
    glowGold: '0 0 20px rgba(200, 160, 74, 0.5)',
  },

  // Focus ring (cyan double-ring pattern from Captain-Adel)
  focusRing: '0 0 0 2px rgba(9, 10, 15, 0.95), 0 0 0 4px rgba(34, 211, 238, 0.6)',
  focusRingDay: '0 0 0 2px rgba(245, 242, 237, 0.95), 0 0 0 4px rgba(26, 95, 122, 0.4)',
};

// ============================================================================
// MOTION (Framer Motion + CSS Transition)
// ============================================================================

export const motion = {
  // Animation types with spring physics (Framer Motion v11+)
  'entrance-gentle': {
    stiffness: 60,
    damping: 15,
    mass: 0.8,
  },
  'entrance-snappy': {
    stiffness: 120,
    damping: 20,
    mass: 0.7,
  },
  'entrance-bounce': {
    stiffness: 80,
    damping: 8,
    mass: 1.2,
  },
  'exit-smooth': {
    stiffness: 60,
    damping: 15,
    mass: 0.8,
  },
  'exit-quick': {
    stiffness: 150,
    damping: 25,
    mass: 0.5,
  },
  'drag-resistance': {
    stiffness: 100,
    damping: 20,
    mass: 1.0,
  },

  // Easing curves
  easing: {
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
    enter: 'cubic-bezier(0.16, 1, 0.3, 1)',
    exit: 'cubic-bezier(0.2, 0.9, 0.3, 0.1)',
    smooth: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },

  // Duration scales (ms for Framer, s for CSS)
  durations: {
    fast: 120,      // --dur-1 (0.12s)
    base: 200,      // --dur-2 (0.2s)
    slow: 300,      // --dur-3 (0.3s)
    slower: 400,    // --dur-4 (0.4s)
    slowest: 500,   // --dur-5 (0.5s)
    entry: 620,     // --dur-entry
    long: 1000,
  },

  // Interaction transforms
  transforms: {
    pressScale: 0.97,
    hoverRaise: '-2px',
    hoverLift: 1.015,
  },
};

// ============================================================================
// THEME EXPORT (merge palette + all shared tokens)
// ============================================================================

export interface Theme {
  name: string;
  palette: typeof falconPalette;
  spacing: typeof spacing;
  typography: typeof typography;
  geometry: typeof geometry;
  motion: typeof motion;
}

export const themes: Record<string, Theme> = {
  falcon: {
    name: 'falcon',
    palette: falconPalette,
    spacing,
    typography,
    geometry,
    motion,
  },
  cockpit: {
    name: 'cockpit',
    palette: cockpitPalette,
    spacing,
    typography,
    geometry,
    motion,
  },
  day: {
    name: 'day',
    palette: dayPalette,
    spacing,
    typography,
    geometry,
    motion,
  },
};

// ============================================================================
// CSS CUSTOM PROPERTIES EXPORT (for CSS Modules / :root)
// ============================================================================

export function themeToCSS(theme: Theme): Record<string, string> {
  const { palette, spacing, typography, geometry, motion } = theme;

  return {
    // Colors
    '--color-void': palette.void,
    '--color-void-raised': palette.voidRaised,
    '--color-void-overlay': palette.voidOverlay,
    '--color-surface-base': palette.surfaceBase,
    '--color-surface-raised': palette.surfaceRaised,
    '--color-surface-elevated': palette.surfaceElevated,
    '--color-text-primary': palette.textPrimary,
    '--color-text-secondary': palette.textSecondary,
    '--color-text-tertiary': palette.textTertiary,
    '--color-text-inverted': palette.textInverted,
    '--color-brand-teal': palette.brandTeal,
    '--color-brand-teal-hover': palette.brandTealHover,
    '--color-brand-sage': palette.brandSage,
    '--color-brand-gold': palette.brandGold,
    '--color-brand-gold-soft': palette.brandGoldSoft,
    '--color-brand-gold-deep': palette.brandGoldDeep,
    '--color-success': palette.success,
    '--color-warning': palette.warning,
    '--color-danger': palette.danger,
    '--color-neon-green': palette.neonGreen,
    '--color-neon-cyan': palette.neonCyan,
    '--color-border-default': palette.borderDefault,
    '--color-border-muted': palette.borderMuted,
    '--color-glass-fill': palette.glassFill,

    // Derived text-on-color combinations
    '--color-text-on-primary': palette.textOnPrimary,
    '--color-text-on-accent': palette.textOnAccent,
    '--color-text-on-success': palette.textOnSuccess,
    '--color-text-on-warning': palette.textOnWarning,

    // User message bubbles
    '--color-user-bubble-gradient-start': palette.userBubbleGradientStart,
    '--color-user-bubble-gradient-end': palette.userBubbleGradientEnd,
    '--color-user-bubble-border': palette.userBubbleBorder,

    // Flight-specific indicators
    '--color-fuel-trip': palette.fuelTrip,
    '--color-fuel-reserve': palette.fuelReserve,
    '--color-fuel-margin': palette.fuelMargin,
    '--color-runway-light': palette.runwayLight,
    '--color-runway-dark': palette.runwayDark,

    // Spacing
    '--space-xs': spacing.xs,
    '--space-sm': spacing.sm,
    '--space-md': spacing.md,
    '--space-lg': spacing.lg,
    '--space-xl': spacing.xl,
    '--space-2xl': spacing['2xl'],
    '--space-3xl': spacing['3xl'],
    '--space-4xl': spacing['4xl'],
    '--space-5xl': spacing['5xl'],
    '--space-6xl': spacing['6xl'],
    '--space-7xl': spacing['7xl'],
    '--space-8xl': spacing['8xl'],
    '--space-9xl': spacing['9xl'],

    // Typography
    '--font-sans': typography.fontSans,
    '--font-mono': typography.fontMono,
    '--font-serif': typography.fontSerif,
    '--fs-4xl': typography.sizes['4xl'],
    '--fs-3xl': typography.sizes['3xl'],
    '--fs-2xl': typography.sizes['2xl'],
    '--fs-xl': typography.sizes.xl,
    '--fs-lg': typography.sizes.lg,
    '--fs-base': typography.sizes.base,
    '--fs-sm': typography.sizes.sm,
    '--fs-xs': typography.sizes.xs,
    '--fs-2xs': typography.sizes['2xs'],
    '--fw-light': String(typography.weights.light),
    '--fw-regular': String(typography.weights.regular),
    '--fw-medium': String(typography.weights.medium),
    '--fw-semibold': String(typography.weights.semibold),
    '--fw-bold': String(typography.weights.bold),
    '--fw-extrabold': String(typography.weights.extrabold),
    '--fw-black': String(typography.weights.black),
    '--lh-tight': String(typography.leading.tight),
    '--lh-snug': String(typography.leading.snug),
    '--lh-normal': String(typography.leading.normal),
    '--lh-relaxed': String(typography.leading.relaxed),
    '--lh-loose': String(typography.leading.loose),

    // Geometry
    '--radius-sm': geometry.radius.sm,
    '--radius-md': geometry.radius.md,
    '--radius-lg': geometry.radius.lg,
    '--radius-xl': geometry.radius.xl,
    '--radius-pill': geometry.radius.pill,
    '--shadow-sm': geometry.shadows.sm,
    '--shadow-md': geometry.shadows.md,
    '--shadow-lg': geometry.shadows.lg,
    '--shadow-glow': geometry.shadows.glow,
    '--shadow-glow-gold': geometry.shadows.glowGold,
    '--focus-ring': geometry.focusRing,

    // Motion
    '--ease-standard': motion.easing.standard,
    '--ease-enter': motion.easing.enter,
    '--ease-exit': motion.easing.exit,
    '--ease-smooth': motion.easing.smooth,
    '--dur-fast': `${motion.durations.fast}ms`,
    '--dur-base': `${motion.durations.base}ms`,
    '--dur-slow': `${motion.durations.slow}ms`,
    '--dur-slower': `${motion.durations.slower}ms`,
    '--dur-slowest': `${motion.durations.slowest}ms`,
    '--dur-entry': `${motion.durations.entry}ms`,
    '--dur-long': `${motion.durations.long}ms`,
    '--glass-blur': palette.glassBlur,
  };
}

// ============================================================================
// TAILWIND CONFIG EXPORT (for Captain-Adel landing)
// ============================================================================

export function themeToTailwindConfig(theme: Theme) {
  const { palette, spacing, geometry, typography } = theme;

  return {
    colors: {
      'void': palette.void,
      'void-raised': palette.voidRaised,
      'void-overlay': palette.voidOverlay,
      'surface-base': palette.surfaceBase,
      'surface-raised': palette.surfaceRaised,
      'surface-elevated': palette.surfaceElevated,
      'text-primary': palette.textPrimary,
      'text-secondary': palette.textSecondary,
      'text-tertiary': palette.textTertiary,
      'text-inverted': palette.textInverted,
      'text-on-primary': palette.textOnPrimary,
      'text-on-accent': palette.textOnAccent,
      'text-on-success': palette.textOnSuccess,
      'text-on-warning': palette.textOnWarning,
      'brand-teal': palette.brandTeal,
      'brand-sage': palette.brandSage,
      'brand-gold': palette.brandGold,
      'brand-gold-soft': palette.brandGoldSoft,
      'success': palette.success,
      'warning': palette.warning,
      'danger': palette.danger,
      'neon-green': palette.neonGreen,
      'neon-cyan': palette.neonCyan,
    },
    spacing: {
      xs: spacing.xs,
      sm: spacing.sm,
      md: spacing.md,
      lg: spacing.lg,
      xl: spacing.xl,
      '2xl': spacing['2xl'],
      '3xl': spacing['3xl'],
      '4xl': spacing['4xl'],
    },
    borderRadius: {
      sm: geometry.radius.sm,
      md: geometry.radius.md,
      lg: geometry.radius.lg,
      xl: geometry.radius.xl,
      pill: geometry.radius.pill,
    },
    fontFamily: {
      sans: typography.fontSans,
      mono: typography.fontMono,
      serif: typography.fontSerif,
    },
    fontSize: {
      '4xl': typography.sizes['4xl'],
      '3xl': typography.sizes['3xl'],
      '2xl': typography.sizes['2xl'],
      xl: typography.sizes.xl,
      lg: typography.sizes.lg,
      base: typography.sizes.base,
      sm: typography.sizes.sm,
      xs: typography.sizes.xs,
    },
    boxShadow: {
      sm: geometry.shadows.sm,
      md: geometry.shadows.md,
      lg: geometry.shadows.lg,
      glow: geometry.shadows.glow,
      'glow-gold': geometry.shadows.glowGold,
    },
  };
}

// ============================================================================
// DEFAULT EXPORT (Falcon theme as primary)
// ============================================================================

export default themes.falcon;
