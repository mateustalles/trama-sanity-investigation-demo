import type { Metadata } from "next";
import "./globals.css";
import "./overrides.css";
import "./priority-panel.css";
import "./calendar.css";

export const metadata: Metadata = {
  title: "The Checkout Investigation · Trama",
  description: "Find original evidence, test competing explanations, and investigate what happened."
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
