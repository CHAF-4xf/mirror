import type { Metadata } from "next";
import { Geist, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { TopBar } from "./_components/top-bar";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["italic"],
  variable: "--font-serif",
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Customer Voice Mirror",
  description:
    "An AI pipeline that surfaces patterns in public customer voice across customer stories, Reddit, and third-party reviews.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const fontVariables = `${geist.variable} ${instrumentSerif.variable} ${jetBrainsMono.variable}`;

  return (
    <html lang="en" className={fontVariables}>
      <body className={fontVariables}>
        <TopBar />
        {children}
      </body>
    </html>
  );
}
