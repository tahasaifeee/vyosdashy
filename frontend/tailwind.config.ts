import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-exo2)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "#00d4ff",
          hover: "#00b8e0",
        },
        success: "#22c55e",
        warning: "#f59e0b",
        danger: "#f43f5e",
        info: "#0ea5e9",
        dark: {
          950: "#060810",
          900: "#0a0e18",
          800: "#0d1220",
          700: "#141929",
          600: "#1c2436",
          500: "#2a3450",
        },
      },
      boxShadow: {
        'glow': '0 0 20px rgba(0, 212, 255, 0.25), 0 0 60px rgba(0, 212, 255, 0.07)',
        'glow-sm': '0 0 10px rgba(0, 212, 255, 0.18)',
        'card': '0 4px 32px rgba(0, 0, 0, 0.5)',
        'led-online': '0 0 7px rgba(34, 197, 94, 0.85)',
        'led-offline': '0 0 7px rgba(244, 63, 94, 0.7)',
      },
      animation: {
        'pulse-led': 'pulseLed 2.5s ease-in-out infinite',
        'fade-up': 'fadeUp 0.4s ease both',
        'slide-in': 'slideIn 0.25s ease both',
      },
      keyframes: {
        pulseLed: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateX(-6px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
