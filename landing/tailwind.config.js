/** @type {import('tailwindcss').Config} */
const { themeToTailwindConfig, themes } = require('../src/design/tokens.ts');

const tokenConfig = themeToTailwindConfig(themes.falcon);

module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Unified token system colors from tokens.ts
        ...tokenConfig.colors,

        // Legacy Radix UI fallbacks (mapped to token equivalents)
        border: "var(--color-border-default)",
        input: "var(--color-void-raised)",
        ring: "var(--color-neon-cyan)",
        background: "var(--color-void)",
        foreground: "var(--color-text-primary)",
        primary: {
          DEFAULT: "var(--color-brand-teal)",
          foreground: "var(--color-text-on-primary)",
        },
        secondary: {
          DEFAULT: "var(--color-brand-sage)",
          foreground: "var(--color-text-on-success)",
        },
        destructive: {
          DEFAULT: "var(--color-danger)",
          foreground: "var(--color-text-on-warning)",
        },
        muted: {
          DEFAULT: "var(--color-void-raised)",
          foreground: "var(--color-text-secondary)",
        },
        accent: {
          DEFAULT: "var(--color-brand-gold)",
          foreground: "var(--color-text-on-accent)",
        },
        popover: {
          DEFAULT: "var(--color-surface-elevated)",
          foreground: "var(--color-text-primary)",
        },
        card: {
          DEFAULT: "var(--color-surface-raised)",
          foreground: "var(--color-text-primary)",
        },
        sidebar: {
          DEFAULT: "var(--color-surface-base)",
          foreground: "var(--color-text-primary)",
          primary: "var(--color-brand-teal)",
          "primary-foreground": "var(--color-text-on-primary)",
          accent: "var(--color-brand-gold)",
          "accent-foreground": "var(--color-text-on-accent)",
          border: "var(--color-border-default)",
          ring: "var(--color-neon-cyan)",
        },
      },
      borderRadius: {
        ...tokenConfig.borderRadius,
        xl: "var(--radius-xl)",
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
        xs: "calc(var(--radius-sm) - 2px)",
      },
      boxShadow: {
        ...tokenConfig.boxShadow,
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },
      fontFamily: tokenConfig.fontFamily,
      fontSize: tokenConfig.fontSize,
      spacing: {
        ...tokenConfig.spacing,
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}