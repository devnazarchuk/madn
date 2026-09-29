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
  // cover — safe-area insets (notches/home bars) become usable on phones.
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Mensch ärgere Dich nicht Kids — 3D Board Game",
  description:
    "The Kids edition of the classic German board game as a cozy 3D experience: roll the color die, hop from field to field, bump your rivals home and guide your three animal pawns to safety. 2–4 players with clever robots.",
  keywords: [
    "board game",
    "dice game",
    "kids game",
    "3D game",
    "color dice",
    "Mensch ärgere Dich nicht",
    "children",
  ],
  authors: [{ name: "Z.ai" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Mensch ärgere Dich nicht Kids",
    description: "The colorful 3D race for 2–4 players, ages 4 and up",
    siteName: "Mensch ärgere Dich nicht Kids",
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
