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
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "#6366f1", // Indigo 500
          hover: "#4f46e5",   // Indigo 600
          dark: "#4338ca",    // Indigo 700
        },
        surface: {
          DEFAULT: "rgba(255, 255, 255, 0.05)",
          hover: "rgba(255, 255, 255, 0.1)",
          active: "rgba(255, 255, 255, 0.15)",
        },
        success: "#10b981", // Emerald 500
        warning: "#f59e0b", // Amber 500
        danger: "#ef4444",  // Red 500
        info: "#0ea5e9",    // Sky 500
        dark: {
          900: "#020617", // Slate 950
          800: "#0f172a", // Slate 900
          700: "#1e293b", // Slate 800
          600: "#334155", // Slate 700
        }
      },
      borderRadius: {
        'xl': '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glow': '0 0 15px rgba(99, 102, 241, 0.3)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'dark-mesh': 'radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.15) 0, transparent 50%), radial-gradient(at 100% 0%, rgba(139, 92, 246, 0.15) 0, transparent 50%), radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.05) 0, transparent 50%), radial-gradient(at 0% 100%, rgba(239, 68, 68, 0.05) 0, transparent 50%)',
      },
    },
  },
  plugins: [],
};
export default config;
