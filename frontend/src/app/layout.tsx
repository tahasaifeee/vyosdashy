import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VyOS UI Manager",
  description: "Manage your VyOS routers efficiently",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
