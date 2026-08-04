import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Baloo_2 } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const viewport: Viewport = {
  themeColor: "#241B14",
};

export const metadata: Metadata = {
  title: "Color Hop! Kids — Wooden Board Race",
  description:
    "A cozy 3D wooden board game: roll the color die, hop from field to field, bump your rivals home and guide all three pawns to safety. 2–4 players with clever robots.",
  keywords: ["board game", "dice game", "kids game", "3D game", "color dice", "wooden toy"],
  authors: [{ name: "Z.ai" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Color Hop! Kids",
    description: "The wooden color-dice race for 2–4 players",
    siteName: "Color Hop! Kids",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${baloo.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
