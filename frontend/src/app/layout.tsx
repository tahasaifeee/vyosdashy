import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({ subsets: ["latin"] });

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
    <html lang="en">
      <body className={`${inter.className} bg-background text-foreground transition-colors duration-300`}>
        <ThemeProvider>
          <div className="mesh-background opacity-40 dark:opacity-80 transition-opacity duration-500" />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
