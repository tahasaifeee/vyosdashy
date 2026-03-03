import type { Metadata } from "next";
import { Exo_2, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const exo2 = Exo_2({
  subsets: ["latin"],
  variable: "--font-exo2",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VyOS UI Manager",
  description: "Modern dashboard for VyOS router management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${exo2.variable} ${jetbrainsMono.variable} font-sans bg-dark-950 text-foreground`}>
        <ThemeProvider>
          {/* Dot-grid background */}
          <div className="fixed inset-0 -z-10 dot-bg" />
          {/* Ambient cyan glow — top centre */}
          <div
            className="fixed top-0 left-1/2 -translate-x-1/2 -z-10 w-[700px] h-[220px] rounded-full"
            style={{ background: 'radial-gradient(ellipse, rgba(0,212,255,0.06) 0%, transparent 70%)' }}
          />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
